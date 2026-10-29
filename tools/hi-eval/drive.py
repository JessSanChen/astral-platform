"""Drive the smallest synthetic red-teaming workflow through the HI API and probe permissions."""
import json, sys, time, uuid
import httpx

API = "http://127.0.0.1:8000/api/v1"
FAKE = "http://127.0.0.1:8081"
PW = "password123"
LOG = []

def rec(step, resp, note=""):
    try: body = resp.json()
    except Exception: body = resp.text[:500]
    LOG.append({"step": step, "status": resp.status_code, "note": note, "body": body})
    print(f"[{resp.status_code}] {step} {note}")
    return body

def login(email):
    r = httpx.post(f"{API}/auth/login", json={"email": email, "password": PW})
    tok = rec(f"login {email}", r)["access_token"]
    return httpx.Client(base_url=API, headers={"Authorization": f"Bearer {tok}"}, timeout=60)

admin = login("admin@test.com"); owner = login("owner@test.com"); rt = login("redteamer@test.com")
ann = login("annotator@test.com"); view = login("viewer@test.com")

me = rec("me redteamer", rt.get("/auth/me"))
print("   redteamer perms:", sorted(me.get("permissions", []))[:40])

# --- 1. admin registers the synthetic model
existing = [m for m in admin.get("/ai-models").json()["items"] if m["model_alias"] == "fake-synth"]
if existing:
    model = existing[0]; print("   model exists")
else:
    model = rec("admin create model", admin.post("/ai-models", json={
        "name": "Fake Synth", "model_alias": "fake-synth", "provider": "generic",
        "provider_model_id": "fake-synth-1", "inference_endpoint": f"{FAKE}/v1", "api_key": "fake-key-123"}))
model_id = model["id"]
time.sleep(2)
rec("admin read model after health check", admin.get(f"/ai-models/{model_id}"), note="health fields")

# --- 2. find seeded group / evaluation / scenario
groups = rec("admin list groups", admin.get("/evaluation-groups"))
group = groups["items"][0]; gid = group["id"]
print("   group:", group["title"], group["status"], group["access_level"], "license:", group.get("data_license") or group.get("effective_license"))
rec("admin group members", admin.get(f"/evaluation-groups/{gid}/members"))
evals = rec("admin list evaluations", admin.get("/evaluations"))
ev = evals["items"][0]; eid = ev["id"]
print("   evaluation:", ev["title"], "mask_models:", ev.get("mask_models_enabled"), "license:", ev.get("effective_license"))
# group allowed models
rec("admin add model to group allowed list", admin.patch(f"/evaluation-groups/{gid}", json={"allowed_model_ids": [m["id"] for m in rec("admin list models", admin.get("/ai-models"))["items"]]}))
assigned = [a for a in admin.get(f"/evaluations/{eid}/models").json()["items"] if a.get("name") == "Model Z"]
if assigned:
    assignment_id = assigned[0]["assignment_id"]; print("   assignment exists (listing masks provider/model id even for admin:", assigned[0], ")")
else:
    assign = rec("admin assign model to evaluation", admin.post(f"/evaluations/{eid}/models", json={"model_id": model_id, "model_display_mask": "Model Z"}))
    assignment_id = assign["id"]
scen = rec("rt list scenarios", rt.get(f"/evaluations/{eid}/scenarios"))["items"][0]; sid = scen["id"]
tasks = rec("rt list tasks", rt.get(f"/scenarios/{sid}/tasks"))
task_id = tasks["items"][0]["id"] if tasks.get("items") else None

# --- 3. red-teamer starts a conversation group + conversation
cg = rec("rt create conversation group", rt.post(f"/scenarios/{sid}/conversation-groups", json={"name": "synthetic-run-1", "models": [{"evaluation_ai_model_id": assignment_id, "title": "benign-track"}]}))
cgid = cg["id"]
convs = rec("rt list conversations", rt.get(f"/evaluations/{eid}/conversations"))
conv = next(c for c in convs["items"] if c.get("conversation_group_id") == cgid)
cid = conv["id"]
print("   conversation:", cid, "protected:", conv.get("content_protected"), "license:", conv.get("effective_license"), "model shown as:", conv.get("model_display_name") or conv.get("model_name"))

# --- 4. send two turns over SSE
def send(client, content, tags=None, cmid=None):
    body = {"content": content, "tags": tags or {}, "client_message_id": cmid or str(uuid.uuid4())}
    events = []
    with client.stream("POST", f"/evaluations/{eid}/conversations/{cid}/messages", json=body) as r:
        status = r.status_code
        if status != 200:
            r.read(); print("   SSE non-200:", status, r.text[:300]); return status, []
        ev_name = None
        for line in r.iter_lines():
            if line.startswith("event:"): ev_name = line.split(":",1)[1].strip()
            elif line.startswith("data:"): events.append((ev_name, json.loads(line.split(":",1)[1].strip())))
    return status, events
cm1 = str(uuid.uuid4())
st, evs = send(rt, "Synthetic user turn one: how do I culture E. coli for a plasmid prep?", tags={"track": "A-benign", "persona": "grad-student"}, cmid=cm1)
print(f"   turn1 SSE status={st} events={[e for e,_ in evs]} reply={''.join(d.get('content','') for e,d in evs if e=='delta')!r}")
LOG.append({"step": "turn1 sse", "status": st, "events": evs})
st, evs = send(rt, "Synthetic user turn two: and how do I check the yield?")
print(f"   turn2 SSE status={st} events={[e for e,_ in evs]} done={[d for e,d in evs if e=='done']}")
LOG.append({"step": "turn2 sse", "status": st, "events": evs})
st, evs = send(rt, "REPLAY of turn one", cmid=cm1)
print(f"   idempotent replay status={st} events={[(e, d.get('finish_reason')) for e,d in evs]}")
LOG.append({"step": "replay sse", "status": st, "events": evs})

msgs = rec("rt list messages", rt.get(f"/evaluations/{eid}/conversations/{cid}/messages"))
for m in msgs["items"]:
    print(f"   msg {m['role']:9} {m['status']:9} {m['content'][:70]!r} extra={m.get('extra')} tags={m.get('tags')} tag_ctx={m.get('tag_context')}")
assistant_msgs = [m for m in msgs["items"] if m["role"] == "assistant"]
user_msgs = [m for m in msgs["items"] if m["role"] == "user"]

# --- 5. red-teamer flags the reply
flag = rec("rt create flag", rt.post("/message-flags", json={"conversation_id": cid, "message_ids": [assistant_msgs[0]["id"]], "reason": "synthetic: model complied with a dual-use request", "red_flagged": True, "comment": "synthetic flag", "task_id": task_id}))
flag_id = flag.get("id")
rec("rt complete task", rt.post(f"/conversations/{cid}/completed-tasks", json={"task_id": task_id})) if task_id else None

# --- 6. annotator side: review queue, review, annotation, note
rec("annotator review queue", ann.get("/review-queue"))
rec("annotator submission detail", ann.get(f"/submissions/{flag_id}"))
rec("annotator submission messages", ann.get(f"/submissions/{flag_id}/messages"))
ann_me = ann.get("/auth/me").json()
rev = rec("annotator self-assign review", ann.post("/reviews", json={"message_flag_id": flag_id, "reviewer_id": ann_me["id"]}))
rid = rev.get("id")
if rid:
    rec("annotator record verdict", ann.patch(f"/reviews/{rid}", json={"status": "completed", "successful_exploit": True, "unique_exploit": False, "valid_submission": True, "number_prompts": 2, "notes": "synthetic verdict"}))
labels = rec("annotator list labels", ann.get("/annotation-labels"))
lab = labels["items"][0]["id"] if labels.get("items") else None
rec("annotator annotate message", ann.post("/annotations", json={"message_id": assistant_msgs[0]["id"], "label_id": lab} if lab else {"message_id": assistant_msgs[0]["id"], "text": "synthetic-adhoc"}))
rec("annotator note", ann.post("/notes", json={"conversation_id": cid, "message_ids": [assistant_msgs[0]["id"]], "text": "synthetic note"}))

# --- 7. exports (owner holds evaluation_groups:export)
rec("list export templates", owner.get("/exports"))
for tpl in ("transcript", "conversations", "flags", "reviews"):
    job = rec(f"owner create export {tpl}", owner.post("/exports/jobs", json={"template": tpl, "format": "csv", "evaluation_group_id": gid}))
    jid = job.get("id")
    for _ in range(30):
        j = owner.get(f"/exports/jobs/{jid}").json()
        if j.get("status") in ("completed", "failed", "complete", "error"): break
        time.sleep(0.5)
    print("   job", tpl, j.get("status"), j.get("error"))
    d = owner.get(f"/exports/jobs/{jid}/download")
    LOG.append({"step": f"download {tpl}", "status": d.status_code, "body": d.text[:3000]})
    print(f"   download {tpl} -> {d.status_code}\n" + "\n".join("      " + l for l in d.text.splitlines()[:6]))
job = rec("owner create export transcript json", owner.post("/exports/jobs", json={"template": "transcript", "format": "json", "evaluation_group_id": gid}))
time.sleep(2); d = owner.get(f"/exports/jobs/{job.get('id')}/download"); LOG.append({"step": "download transcript json", "status": d.status_code, "body": d.text[:4000]}); print("   json export:", d.status_code, d.text[:600])

# --- 8. metrics + audit
rec("owner group metrics", owner.get(f"/evaluation-groups/{gid}/metrics"))
rec("admin audit logs", admin.get("/audit-logs", params={"limit": 50}))

# --- 9. permission probes
P = []
def probe(name, resp, expect):
    ok = resp.status_code == expect
    P.append({"probe": name, "status": resp.status_code, "expected": expect, "ok": ok})
    print(f"   {'OK ' if ok else 'XX '} {name}: {resp.status_code} (expected {expect})")
probe("viewer creates conversation group", view.post(f"/scenarios/{sid}/conversation-groups", json={"name": "x", "models": [{"evaluation_ai_model_id": assignment_id}]}), 403)
probe("viewer sends message into rt conversation", view.post(f"/evaluations/{eid}/conversations/{cid}/messages", json={"content": "x"}), 403)
probe("viewer /chat/stream", view.post("/chat/stream", json={"model_alias": "fake-synth", "messages": [{"role": "user", "content": "hi"}]}), 403)
probe("annotator reads rt conversation directly", ann.get(f"/evaluations/{eid}/conversations/{cid}/messages"), 403)
probe("annotator creates flag", ann.post("/message-flags", json={"conversation_id": cid, "message_ids": [assistant_msgs[0]["id"]], "reason": "x"}), 403)
probe("redteamer lists ai-models", rt.get("/ai-models"), 403)
probe("redteamer reads audit log", rt.get("/audit-logs"), 403)
probe("redteamer reads review verdicts on own flag", rt.get("/reviews"), 200)
probe("redteamer records verdict", rt.patch(f"/reviews/{rid}", json={"notes": "tamper"}) if rid else httpx.Response(599), 403)
probe("redteamer bulk export", rt.post("/exports/jobs", json={"template": "transcript", "format": "csv", "evaluation_group_id": gid}), 403)
probe("redteamer /chat/stream sandbox (no persistence)", rt.post("/chat/stream", json={"model_alias": "fake-synth", "messages": [{"role": "user", "content": "sandbox hi"}]}), 200)
probe("owner reads rt conversation (in-group owner read_any)", owner.get(f"/evaluations/{eid}/conversations/{cid}/messages"), 200)
probe("owner sends message into rt conversation", owner.post(f"/evaluations/{eid}/conversations/{cid}/messages", json={"content": "x"}), 404)
probe("admin reads rt conversation (break-glass)", admin.get(f"/evaluations/{eid}/conversations/{cid}/messages"), 200)
probe("admin sends message into rt conversation (break-glass)", admin.post(f"/evaluations/{eid}/conversations/{cid}/messages", json={"content": "admin injects"}), 200)
# a second red-teamer should not see the first one's conversation
inv = rec("admin invite rt2", admin.post("/auth/users", json={"email": "rt2@test.com", "password": PW, "role_ids": [r["id"] for r in admin.get("/roles").json()["items"] if r["name"] == "red_teamer"]}))
LOG.append({"probes": P})
json.dump(LOG, open("drive_log.json", "w"), indent=1, default=str)
print("fake server calls:", json.dumps(httpx.get(f"{FAKE}/_log").json(), indent=1)[:2500])
