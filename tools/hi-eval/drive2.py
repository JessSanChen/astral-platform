import json, time, uuid, httpx
API="http://127.0.0.1:8000/api/v1"; PW="password123"
def login(e):
    t=httpx.post(f"{API}/auth/login",json={"email":e,"password":PW}).json()["access_token"]
    return httpx.Client(base_url=API,headers={"Authorization":f"Bearer {t}"},timeout=60)
admin=login("admin@test.com"); owner=login("owner@test.com"); rt=login("redteamer@test.com"); ann=login("annotator@test.com")
def show(n,r): 
    try: b=r.json()
    except Exception: b=r.text[:300]
    print(f"[{r.status_code}] {n}: {json.dumps(b, default=str)[:700]}"); return b
# a. verdict with the right enum
rid=None
if rid: show("verdict", ann.patch(f"/reviews/{rid}",json={"status":"approved","successful_exploit":True,"unique_exploit":False,"valid_submission":True,"number_prompts":2,"notes":"synthetic verdict"}))
show("rt sees verdict", rt.get("/reviews"))
# f. platform settings + licences
show("platform settings", admin.get("/platform-settings"))
lic=show("licenses", owner.get("/licenses"))
nolic=[l for l in lic["items"] if l.get("is_no_license") or l.get("protects_conversation_data")]
print("protecting licences:", [(l["name"], l["id"], l["protects_conversation_data"]) for l in nolic])
if False: show("owner tries custom protecting licence", owner.post("/licenses", json={"name":"ASTRAL quarantine","short_description":"sealed quarantine licence","content":"Quarantined until hazard review. No redistribution.","protects_conversation_data":True}))
# b. sealed group end to end: owner creates a group under "No license"
existing=[x for x in owner.get("/evaluation-groups").json()["items"] if x["title"]=="Sealed synthetic group"]
g=existing[0] if existing else show("owner create group", owner.post("/evaluation-groups", json={"title":"Sealed synthetic group","description":"d","access_level":"invitation_only","start_date":"2026-10-29","data_license_id":nolic[0]["id"],"allowed_model_ids":[m["id"] for m in admin.get("/ai-models").json()["items"] if m["model_alias"]=="fake-synth"]}))
gid=g["id"]
rtid=[u for u in admin.get("/auth/users").json()["items"] if u["email"]=="redteamer@test.com"][0]["id"]
rtrole=[r["id"] for r in admin.get("/roles").json()["items"] if r["name"]=="red_teamer"]
if not existing: show("owner adds redteamer as member", owner.post(f"/evaluation-groups/{gid}/members", json={"user_id":rtid,"role_ids":rtrole}))
show("admin approve", admin.post(f"/evaluation-groups/{gid}/approve"))
e=show("owner create evaluation", owner.post("/evaluations", json={"evaluation_group_id":gid,"title":"Sealed eval","description":"d"}))
eid=e["id"]
mid=[m["id"] for m in admin.get("/ai-models").json()["items"] if m["model_alias"]=="fake-synth"][0]
a=show("owner assign model", owner.post(f"/evaluations/{eid}/models", json={"model_id":mid}))
s=show("owner create scenario", owner.post(f"/evaluations/{eid}/scenarios", json={"name":"Sealed scenario","description":"d"}))
sid=s["id"]
show("owner publish", owner.post(f"/evaluation-groups/{gid}/publish"))
cg=show("rt create cg in sealed group", rt.post(f"/scenarios/{sid}/conversation-groups", json={"name":"sealed-run","models":[{"evaluation_ai_model_id":a["id"]}]}))
cid=[c for c in rt.get(f"/evaluations/{eid}/conversations").json()["items"]][0]["id"]
with rt.stream("POST", f"/evaluations/{eid}/conversations/{cid}/messages", json={"content":"sealed synthetic turn"}) as r:
    r.read(); print("sealed send status", r.status_code, r.text[-200:])
show("rt reads sealed messages (unsealed for owner)", rt.get(f"/evaluations/{eid}/conversations/{cid}/messages"))
# c. withdrawal: soft delete + restore window
show("rt deletes own conversation", rt.delete(f"/evaluations/{eid}/conversations/{cid}"))
show("rt lists deleted", rt.get(f"/evaluations/{eid}/conversations", params={"deleted":"true"}))
show("admin still reads deleted?", admin.get(f"/evaluations/{eid}/conversations/{cid}/messages"))
json.dump({"sealed_cid":cid,"sealed_eid":eid,"sealed_gid":gid}, open("drive2_ids.json","w"))
