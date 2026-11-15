/**
 * Writes one page for spot-checking a reviewer: every record they judged,
 * in full, beside the answers they gave.
 *
 * It only reads the database, and it runs on your own machine, so it can be
 * used while the event is running without deploying anything. The page is
 * a single file with nothing loaded from elsewhere. It holds participants'
 * conversations and names: keep it to the organizers.
 *
 *   npm run prod:review-audit -- sophie@example.com
 *   npm run prod:review-audit -- sophie            (part of a name works too)
 *   npm run prod:review-audit -- a@example.com b@example.com c@example.com
 *   npm run prod:review-audit -- --top 10          (the ten who reviewed most)
 *   npm run prod:review-audit -- --all             (everyone who reviewed)
 *   npm run review-audit -- someone@example.com    (your development database)
 *
 * Given more than one person it writes a page each, and one more,
 * audits/reviewers-<time>.html, that puts their numbers side by side and
 * links to each page.
 *
 * Beside each record: the reviewer's verdict, confidence, the user messages
 * they pointed to (marked in the record), their two ratings, how long they
 * had the record and how much there was to read, what other reviewers said
 * of the same record, and what its author said of it. At the top: the
 * totals, and buttons to show only the fastest or only the disagreements.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  AUTHOR_ROLES,
  EXPECT_REFERRAL,
  SCENARIOS,
  labelOf,
} from "@/lib/author-labels";
import { comparisonIntentLabel } from "@/lib/episode-options";
import {
  AIM_EVIDENCE,
  CONFIDENCE,
  MAIN_DIFFERENCE,
  MATCH,
  SCOPE_SIMILARITY,
  SUBJECT_SENSITIVITY,
  VERDICTS,
} from "@/lib/review-form";

type Turn = { n: number; session: string | null; role: string; content: string; failed?: boolean };
type View = { kind: string; sessions: string[]; turns: Turn[] };

type ReviewRow = {
  assignment_id: string;
  view_id: string;
  reserved_at: Date;
  finished_at: Date;
  verdict: string;
  confidence: string;
  evidence_mode: string;
  evidence_turns: number[];
  rationale: string;
  subject_sensitivity: string;
  aim_evidence: string;
  revision_count: number;
  kind: string;
  content: View;
  author_name: string;
  author_id: string;
  model_id: string | null;
  labels: Record<string, unknown> | null;
};

type AuditRow = {
  assignment_id: string;
  reserved_at: Date;
  finished_at: Date;
  topic_task_match: string;
  scope_similarity: string | null;
  main_difference: string | null;
  audit_note: string | null;
  comparison_intent: string;
  intended_difference: string;
  source: View | null;
  target: View | null;
  author_name: string;
};

const rows = <T>(result: unknown) => result as T[];

const escape = (text: unknown) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const seconds = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / 1000);
const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const clock = (d: Date) =>
  d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", second: "2-digit" });
const duration = (s: number) => (s < 90 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

/** How long a reply is shown before the rest is folded away. */
const REPLY_SHOWN = 700;

function transcript(view: View | null, cited: number[] = []) {
  if (!view) return `<p class="muted">Nothing to show.</p>`;
  return view.turns
    .map((turn) => {
      const user = turn.role === "user";
      const isCited = user && cited.includes(turn.n);
      const text = turn.content ?? "";
      const body =
        !user && text.length > REPLY_SHOWN
          ? `${escape(text.slice(0, REPLY_SHOWN))}<details><summary>the rest of this reply (${(text.length - REPLY_SHOWN).toLocaleString("en-US")} more characters)</summary>${escape(text.slice(REPLY_SHOWN))}</details>`
          : text.trim()
            ? escape(text)
            : `<span class="muted">${turn.failed ? "No reply: the request failed or was blocked." : "No reply text was returned."}</span>`;
      return `<div class="turn ${user ? "user" : "assistant"}${isCited ? " cited" : ""}">
        <div class="who">${turn.n}. ${user ? "User" : "Assistant"}${turn.session ? ` · session ${escape(turn.session)}` : ""}${isCited ? ` <span class="tag cite">pointed to by the reviewer</span>` : ""}</div>
        <div class="text">${body}</div>
      </div>`;
    })
    .join("\n");
}

const item = (term: string, value: string) =>
  value ? `<div class="row"><dt>${escape(term)}</dt><dd>${value}</dd></div>` : "";

type Person = { id: string; name: string; email: string };

/** What one reviewer's page comes to, for the page that lists several. */
type Outcome = {
  reviewer: Person;
  file: string;
  reviews: number;
  comparisons: number;
  skipped: number;
  span: string;
  medianTook: number;
  medianPerUserMessage: number;
  yes: number;
  no: number;
  indeterminate: number;
  otherVerdicts: number;
  same: number;
  yesVsNo: number;
  noVsYes: number;
  disagreements: number;
  withExpectation: number;
  sameAsExpectation: number;
};

const USAGE = `
Say whose reviews: one or more email addresses or parts of names, or
--top and a number, or --all.
  npm run prod:review-audit -- sophie@example.com
  npm run prod:review-audit -- a@example.com b@example.com
  npm run prod:review-audit -- --top 10
  npm run prod:review-audit -- --all
`;

/** The one person an email address or part of a name means, or why not. */
async function find(wanted: string): Promise<Person | string> {
  const people = rows<Person>(
    await db.execute(sql`
      select id, name, email from "user"
      where lower(email) = lower(${wanted}) or name ilike ${"%" + wanted + "%"}
      order by (lower(email) = lower(${wanted})) desc, name
    `),
  );
  if (people.length === 0) return `Nobody found for "${wanted}".`;
  if (people.length > 1 && people[0].email.toLowerCase() !== wanted.toLowerCase()) {
    return `"${wanted}" matches more than one person. Use an email address:\n${people
      .map((p) => `    ${p.email}   ${p.name}`)
      .join("\n")}`;
  }
  return people[0];
}

/** The people who completed the most transcript reviews, most first. */
async function busiest(limit: number | null) {
  return rows<Person>(
    await db.execute(sql`
      select u.id, u.name, u.email
      from "user" u
      join review_assignment a on a.reviewer_id = u.id
      where a.purpose = 'primary' and a.state = 'completed'
      group by u.id, u.name, u.email
      order by count(*) desc, u.name
      limit ${limit ?? 100000}
    `),
  );
}

/** The page names used in this run. */
const written = new Set<string>();

const stamp = (made: Date) => made.toISOString().slice(0, 16).replace(/[:T]/g, "-");

async function auditOne(reviewer: Person, made: Date): Promise<Outcome> {
  const reviews = rows<ReviewRow>(
    await db.execute(sql`
      select a.id as assignment_id, v.id as view_id, a.reserved_at, a.finished_at,
             r.verdict, r.confidence, r.evidence_mode, r.evidence_turns, r.rationale,
             r.subject_sensitivity, r.aim_evidence, r.revision_count,
             v.kind, v.content,
             au.name as author_name, au.id as author_id,
             c.model_id,
             coalesce(c.author_labels, e.author_labels) as labels
      from review_assignment a
      join review_response r on r.assignment_id = a.id
      join review_view v on v.id = a.view_id
      join episode e on e.id = v.episode_id
      join "user" au on au.id = e.user_id
      left join conversation c on c.id = v.conversation_id
      where a.reviewer_id = ${reviewer.id} and a.purpose = 'primary' and a.state = 'completed'
      order by a.finished_at
    `),
  );

  const others = rows<{ view_id: string; verdict: string; confidence: string; name: string }>(
    await db.execute(sql`
      select r.view_id, r.verdict, r.confidence, u.name
      from review_response r
      join "user" u on u.id = r.reviewer_id
      where r.reviewer_id <> ${reviewer.id}
        and r.view_id in (
          select a.view_id from review_assignment a
          where a.reviewer_id = ${reviewer.id} and a.purpose = 'primary' and a.state = 'completed')
    `),
  );
  const othersByView = new Map<string, typeof others>();
  for (const o of others) othersByView.set(o.view_id, [...(othersByView.get(o.view_id) ?? []), o]);

  const audits = rows<AuditRow>(
    await db.execute(sql`
      select a.id as assignment_id, a.reserved_at, a.finished_at,
             p.topic_task_match, p.scope_similarity, p.main_difference, p.audit_note,
             rv.comparison_intent, rv.intended_difference,
             (select v.content from review_view v
               where v.conversation_id = rv.source_conversation_id and v.kind = 'session' limit 1) as source,
             (select v.content from review_view v
               where v.conversation_id = rv.target_conversation_id and v.kind = 'session' limit 1) as target,
             au.name as author_name
      from review_assignment a
      join pair_audit p on p.assignment_id = a.id
      join related_version rv on rv.id = a.related_version_id
      join "user" au on au.id = rv.created_by
      where a.reviewer_id = ${reviewer.id} and a.purpose = 'pair_audit' and a.state = 'completed'
      order by a.finished_at
    `),
  );

  const skipped = rows<{ n: number }>(
    await db.execute(sql`
      select count(*)::int as n from review_assignment
      where reviewer_id = ${reviewer.id} and state = 'skipped'
    `),
  )[0].n;

  // --- What each review amounts to, in numbers -------------------------
  const measured = reviews.map((r, index) => {
    const turns = r.content?.turns ?? [];
    const userTurns = turns.filter((t) => t.role === "user");
    const took = seconds(new Date(r.reserved_at), new Date(r.finished_at));
    const all = turns.reduce((sum, t) => sum + (t.content?.length ?? 0), 0);
    const userChars = userTurns.reduce((sum, t) => sum + (t.content?.length ?? 0), 0);
    const peers = othersByView.get(r.view_id) ?? [];
    return {
      ...r,
      number: index + 1,
      took,
      all,
      userChars,
      userTurnCount: userTurns.length,
      perUserMessage: userTurns.length ? took / userTurns.length : took,
      peers,
      disagrees: peers.some((p) => p.verdict !== r.verdict),
      expected: typeof r.labels?.expectReferral === "string" ? (r.labels.expectReferral as string) : "",
      scenario: typeof r.labels?.scenario === "string" ? (r.labels.scenario as string) : "",
    };
  });

  // The fastest fifth, by how long each user message got.
  const byPace = [...measured].sort((a, b) => a.perUserMessage - b.perUserMessage);
  const fastCut = byPace[Math.max(0, Math.ceil(measured.length / 5) - 1)]?.perUserMessage ?? 0;
  const isFast = (m: (typeof measured)[number]) => measured.length > 0 && m.perUserMessage <= fastCut;

  const shared = measured.filter((m) => m.peers.length > 0);
  const pairs = shared.flatMap((m) => m.peers.map((p) => ({ hers: m.verdict, theirs: p.verdict })));
  const agree = pairs.filter((p) => p.hers === p.theirs).length;
  const yesVsNo = pairs.filter((p) => p.hers === "yes" && p.theirs === "no").length;
  const noVsYes = pairs.filter((p) => p.hers === "no" && p.theirs === "yes").length;
  const withExpectation = measured.filter(
    (m) => (m.expected === "yes" || m.expected === "no") && (m.verdict === "yes" || m.verdict === "no"),
  );
  const count = (v: string) => measured.filter((m) => m.verdict === v).length;
  const first = measured[0];
  const last = measured[measured.length - 1];

  const stat = (label: string, value: string, note = "") =>
    `<div class="stat"><div class="label">${escape(label)}</div><div class="value">${value}</div>${note ? `<div class="note">${escape(note)}</div>` : ""}</div>`;

  const summary = measured.length
    ? [
        stat("Transcript reviews", String(measured.length), `${audits.length} comparison${audits.length === 1 ? "" : "s"}, ${skipped} skipped`),
        stat("From first to last", `${clock(new Date(first.reserved_at))} to ${clock(new Date(last.finished_at))}`, "Boston time"),
        stat("Median time on a record", duration(median(measured.map((m) => m.took))), "from being handed it to submitting; a break counts"),
        stat("Median time per user message", duration(median(measured.map((m) => m.perUserMessage))), "the reviewer judges the user's messages"),
        stat("Verdicts", `${count("yes")} yes · ${count("no")} no · ${count("indeterminate")} cannot determine`),
        stat(
          "Against other reviewers",
          pairs.length ? `${Math.round((100 * agree) / pairs.length)}% the same` : "no record shared yet",
          pairs.length
            ? `${pairs.length} other verdict${pairs.length === 1 ? "" : "s"} on ${shared.length} shared record${shared.length === 1 ? "" : "s"}. Yes where another said No: ${yesVsNo}. No where another said Yes: ${noVsYes}.`
            : "",
        ),
        stat(
          "Against the author's own expectation",
          withExpectation.length
            ? `${Math.round((100 * withExpectation.filter((m) => m.verdict === m.expected).length) / withExpectation.length)}% the same`
            : "none to compare",
          withExpectation.length
            ? `${withExpectation.length} record${withExpectation.length === 1 ? "" : "s"} where both said yes or no. Not a right answer.`
            : "",
        ),
      ].join("\n")
    : `<p class="muted">No completed transcript reviews.</p>`;

  const index = measured
    .map(
      (m) => `<tr data-flags="${[m.disagrees ? "disagrees" : "", isFast(m) ? "fast" : "", m.verdict].join(" ")}">
        <td><a href="#r${m.number}">${m.number}</a></td>
        <td>${clock(new Date(m.finished_at))}</td>
        <td>${escape(labelOf(VERDICTS, m.verdict))}</td>
        <td>${escape(labelOf(CONFIDENCE, m.confidence))}</td>
        <td class="num">${duration(m.took)}</td>
        <td class="num">${m.userTurnCount}</td>
        <td class="num">${m.userChars.toLocaleString("en-US")} / ${m.all.toLocaleString("en-US")}</td>
        <td>${m.peers.map((p) => escape(labelOf(VERDICTS, p.verdict))).join(", ") || `<span class="muted">none yet</span>`}</td>
        <td>${m.disagrees ? `<span class="tag warn">disagrees</span>` : ""}${isFast(m) ? ` <span class="tag fast">fast</span>` : ""}</td>
        <td class="clip">${escape((m.content?.turns?.[0]?.content ?? "").slice(0, 70))}</td>
      </tr>`,
    )
    .join("\n");

  const cards = measured
    .map((m) => {
      const flags = [m.disagrees ? "disagrees" : "", isFast(m) ? "fast" : "", m.verdict].join(" ");
      const peers = m.peers.length
        ? m.peers
            .map((p) => `${escape(labelOf(VERDICTS, p.verdict))} (${escape(labelOf(CONFIDENCE, p.confidence).toLowerCase())}), ${escape(p.name)}`)
            .join("<br>")
        : `<span class="muted">Nobody else has reviewed it yet.</span>`;
      return `<section class="card" id="r${m.number}" data-flags="${flags}">
        <header>
          <h2>Review ${m.number} <span class="muted">of ${measured.length}</span></h2>
          <span class="tags">${m.disagrees ? `<span class="tag warn">disagrees with another reviewer</span>` : ""}${isFast(m) ? `<span class="tag fast">among the fastest</span>` : ""}</span>
          <a class="top" href="#top">top</a>
        </header>
        <div class="cols">
          <div class="record">
            <div class="recordhead">${m.kind === "linked" ? `Linked sessions (${m.content.sessions.length}), in the order things happened` : "One session"} · ${m.content.turns.length} turns${m.model_id ? ` · ${escape(m.model_id)}` : ""}</div>
            ${transcript(m.content, m.evidence_turns ?? [])}
          </div>
          <aside>
            <h3>What ${escape(reviewer.name.split(" ")[0])} answered</h3>
            <dl>
              ${item("Recommend specialist review?", `<strong class="v-${escape(m.verdict)}">${escape(labelOf(VERDICTS, m.verdict))}</strong>`)}
              ${item("Confidence", escape(labelOf(CONFIDENCE, m.confidence)))}
              ${item("User messages pointed to", m.evidence_turns?.length ? escape(m.evidence_turns.join(", ")) : "None: no specific evidence, or the overall pattern")}
              ${item("Subject sensitivity", escape(labelOf(SUBJECT_SENSITIVITY, m.subject_sensitivity)))}
              ${item("Evidence of a concerning aim", escape(labelOf(AIM_EVIDENCE, m.aim_evidence)))}
              ${item("Explanation", m.rationale ? escape(m.rationale) : `<span class="muted">None written.</span>`)}
              ${m.revision_count > 0 ? item("Changed after submitting", `${m.revision_count} time${m.revision_count === 1 ? "" : "s"}`) : ""}
            </dl>
            <h3>How long it took</h3>
            <dl>
              ${item("Handed out, submitted", `${clock(new Date(m.reserved_at))}, ${clock(new Date(m.finished_at))}`)}
              ${item("Time on the record", `<strong>${duration(m.took)}</strong>`)}
              ${item("To read", `${m.userTurnCount} user message${m.userTurnCount === 1 ? "" : "s"} (${m.userChars.toLocaleString("en-US")} characters); ${m.all.toLocaleString("en-US")} characters with the replies`)}
              ${item("Per user message", duration(m.perUserMessage))}
            </dl>
            <h3>Other reviewers of this record</h3>
            <p>${peers}</p>
            <h3>What its author said of it</h3>
            <dl>
              ${item("Author", `${escape(m.author_name)}`)}
              ${item("Scenario", m.scenario ? escape(labelOf(SCENARIOS, m.scenario)) : `<span class="muted">Not recorded.</span>`)}
              ${item("Expected a reviewer to recommend specialist review", m.expected ? escape(labelOf(EXPECT_REFERRAL, m.expected)) : `<span class="muted">Not recorded.</span>`)}
              ${item("Role taken", typeof m.labels?.role === "string" && m.labels.role ? escape(labelOf(AUTHOR_ROLES, m.labels.role as string)) : "")}
            </dl>
            <h3>Your check</h3>
            <label class="check"><input type="radio" name="check${m.number}"> Looks right</label>
            <label class="check"><input type="radio" name="check${m.number}"> Looks wrong</label>
            <label class="check"><input type="radio" name="check${m.number}"> Unsure</label>
            <p class="muted small">For your own use while this page is open. Nothing is saved.</p>
          </aside>
        </div>
      </section>`;
    })
    .join("\n");

  const comparisons = audits
    .map(
      (a, i) => `<section class="card" id="c${i + 1}">
        <header><h2>Comparison ${i + 1} <span class="muted">of ${audits.length}</span></h2><a class="top" href="#top">top</a></header>
        <div class="cols three">
          <div class="record"><div class="recordhead">Original conversation</div>${transcript(a.source)}</div>
          <div class="record"><div class="recordhead">Related conversation</div>${transcript(a.target)}</div>
          <aside>
            <h3>What the author set out to explore</h3>
            <p>${escape(comparisonIntentLabel(a.comparison_intent))}${a.intended_difference ? `: ${escape(a.intended_difference)}` : ""}</p>
            <h3>What ${escape(reviewer.name.split(" ")[0])} answered</h3>
            <dl>
              ${item("Same topic or task?", escape(labelOf(MATCH, a.topic_task_match)))}
              ${item("Technical scope", a.scope_similarity ? escape(labelOf(SCOPE_SIMILARITY, a.scope_similarity)) : "")}
              ${item("Main difference", a.main_difference ? escape(labelOf(MAIN_DIFFERENCE, a.main_difference)) : "")}
              ${item("Note", a.audit_note ? escape(a.audit_note) : `<span class="muted">None written.</span>`)}
              ${item("Time on the pair", duration(seconds(new Date(a.reserved_at), new Date(a.finished_at))))}
              ${item("Author", escape(a.author_name))}
            </dl>
          </aside>
        </div>
      </section>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reviews by ${escape(reviewer.name)}</title>
<style>
  :root { --line:#d9d6cc; --muted:#6b6a63; --bg:#f7f6f2; --card:#fff; --accent:#4d6b53; --warn:#9a3412; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; color:#1c1b18; background:var(--bg); }
  main { max-width: 1500px; margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font: 600 26px/1.2 Georgia, serif; margin: 0 0 4px; }
  h2 { font: 600 18px/1.2 Georgia, serif; margin: 0; }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 18px 0 6px; }
  aside h3:first-child { margin-top: 0; }
  .muted { color: var(--muted); } .small { font-size: 12px; }
  .stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px; margin: 18px 0; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; }
  .stat .label { font-size:12px; color:var(--muted); } .stat .value { font-size:18px; font-weight:600; } .stat .note { font-size:12px; color:var(--muted); }
  .filters { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 10px 0; display:flex; flex-wrap:wrap; gap:8px; align-items:center; border-bottom:1px solid var(--line); }
  .filters button { font: inherit; padding: 6px 12px; border-radius: 999px; border:1px solid var(--line); background:var(--card); cursor:pointer; }
  .filters button[aria-pressed="true"] { background: var(--accent); color:#fff; border-color: var(--accent); }
  table { width:100%; border-collapse: collapse; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; font-size:13px; margin: 14px 0 28px; }
  th, td { text-align:left; padding: 6px 10px; border-top:1px solid var(--line); vertical-align: top; }
  th { background:#efede6; border-top:0; font-size:12px; color:var(--muted); font-weight:600; }
  td.num { text-align:right; white-space:nowrap; } td.clip { max-width: 320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--muted); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; margin: 0 0 22px; }
  .card > header { display:flex; align-items:center; gap:12px; padding: 12px 16px; border-bottom:1px solid var(--line); }
  .card > header .top { margin-left:auto; font-size:12px; color:var(--muted); }
  .cols { display:grid; grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr); }
  .cols.three { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(260px, .8fr); }
  .record { padding: 14px 16px; border-right:1px solid var(--line); max-height: 80vh; overflow-y:auto; }
  .recordhead { font-size:12px; color:var(--muted); margin-bottom:10px; }
  aside { padding: 14px 16px; }
  .turn { border:1px solid var(--line); border-radius:10px; padding:8px 12px; margin: 0 0 10px; }
  .turn.user { background:#eef3ef; border-color:#c9d8cc; margin-left: 8%; }
  .turn.assistant { margin-right: 8%; }
  .turn.cited { border:2px solid var(--accent); box-shadow: 0 0 0 3px rgba(77,107,83,.15); }
  .who { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:3px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .text details { margin-top:6px; } .text summary { cursor:pointer; color:var(--accent); font-size:13px; }
  dl { margin:0; } .row { display:grid; grid-template-columns: 1fr; gap:1px; padding: 5px 0; border-top:1px dashed var(--line); } .row:first-child { border-top:0; }
  dt { font-size:12px; color:var(--muted); } dd { margin:0; }
  .tag { display:inline-block; font-size:11px; padding: 1px 8px; border-radius:999px; border:1px solid var(--line); margin-right:4px; white-space:nowrap; }
  .tag.warn { color: var(--warn); border-color:#f0c7b5; background:#fdf1ea; } .tag.fast { color:#7a5b00; border-color:#ead9a3; background:#fbf5df; } .tag.cite { color:var(--accent); border-color:#c9d8cc; background:#fff; text-transform:none; letter-spacing:0; }
  .v-yes { color: var(--warn); } .v-no { color: var(--accent); }
  .check { display:block; font-size:14px; }
  [hidden] { display:none !important; }
  @media (max-width: 900px) { .cols, .cols.three { grid-template-columns: 1fr; } .record { border-right:0; border-bottom:1px solid var(--line); max-height:none; } }
  @media print { .filters { position: static; } .record { max-height:none; overflow:visible; } }
</style>
</head>
<body>
<main id="top">
  <h1>Reviews by ${escape(reviewer.name)}</h1>
  <p class="muted">${escape(reviewer.email)} · made ${escape(made.toLocaleString("en-US", { timeZone: "America/New_York" }))} Boston time · for organizers only: this page holds participants' conversations and names.</p>

  <div class="stats">${summary}</div>

  <p class="muted small">How to read the times. The clock runs from when a record was handed to the reviewer until they submitted, so a pause shows as a long time and only the short ones mean anything. A reviewer is asked to judge the user's messages and read the assistant's for context, so time per user message is the fairer measure. "Fast" marks the fifth of reviews with the least time per user message.</p>

  <div class="filters" role="group" aria-label="Show">
    <span class="muted">Show</span>
    <button data-show="" aria-pressed="true">All (${measured.length})</button>
    <button data-show="disagrees" aria-pressed="false">Disagrees with another reviewer (${measured.filter((m) => m.disagrees).length})</button>
    <button data-show="fast" aria-pressed="false">Fastest (${measured.filter(isFast).length})</button>
    <button data-show="yes" aria-pressed="false">Yes (${count("yes")})</button>
    <button data-show="no" aria-pressed="false">No (${count("no")})</button>
    <button data-show="indeterminate" aria-pressed="false">Cannot determine (${count("indeterminate")})</button>
  </div>

  <table>
    <thead><tr><th>#</th><th>Submitted</th><th>Verdict</th><th>Confidence</th><th>Time</th><th>User messages</th><th>Characters, user / all</th><th>Other reviewers</th><th></th><th>Opens with</th></tr></thead>
    <tbody>${index}</tbody>
  </table>

  ${cards}

  ${audits.length ? `<h1 style="margin-top:40px">Comparisons</h1>${comparisons}` : ""}
</main>
<script>
  const buttons = document.querySelectorAll(".filters button");
  buttons.forEach((button) => button.addEventListener("click", () => {
    const want = button.dataset.show;
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    document.querySelectorAll("[data-flags]").forEach((el) => {
      el.hidden = Boolean(want) && !el.dataset.flags.split(" ").includes(want);
    });
  }));
</script>
</body>
</html>
`;

  const folder = join(process.cwd(), "audits");
  mkdirSync(folder, { recursive: true });
  const plain = reviewer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reviewer";
  // Two people with one name would otherwise write over each other.
  let slug = plain;
  for (let n = 2; written.has(slug); n++) slug = `${plain}-${n}`;
  written.add(slug);
  const name = `reviews-${slug}-${stamp(made)}.html`;
  writeFileSync(join(folder, name), html);
  return {
    reviewer,
    file: name,
    reviews: measured.length,
    comparisons: audits.length,
    skipped,
    span: measured.length ? `${clock(new Date(first.reserved_at))} to ${clock(new Date(last.finished_at))}` : "",
    medianTook: median(measured.map((m) => m.took)),
    medianPerUserMessage: median(measured.map((m) => m.perUserMessage)),
    yes: count("yes"),
    no: count("no"),
    indeterminate: count("indeterminate"),
    otherVerdicts: pairs.length,
    same: agree,
    yesVsNo,
    noVsYes,
    disagreements: measured.filter((m) => m.disagrees).length,
    withExpectation: withExpectation.length,
    sameAsExpectation: withExpectation.filter((m) => m.verdict === m.expected).length,
  };
}

/** Several reviewers' numbers side by side, with a link to each one's page. */
function listing(outcomes: Outcome[], made: Date) {
  const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "");
  const body = outcomes
    .map(
      (o) => `<tr>
        <td><a href="${escape(o.file)}">${escape(o.reviewer.name)}</a><br><span class="muted">${escape(o.reviewer.email)}</span></td>
        <td class="num">${o.reviews}</td>
        <td class="num">${o.comparisons}</td>
        <td class="num">${o.skipped}</td>
        <td>${escape(o.span)}</td>
        <td class="num">${o.reviews ? duration(o.medianTook) : ""}</td>
        <td class="num">${o.reviews ? duration(o.medianPerUserMessage) : ""}</td>
        <td class="num">${o.yes} / ${o.no} / ${o.indeterminate}</td>
        <td class="num">${percent(o.yes, o.reviews)}</td>
        <td class="num">${o.otherVerdicts ? `${percent(o.same, o.otherVerdicts)} of ${o.otherVerdicts}` : `<span class="muted">none shared</span>`}</td>
        <td class="num">${o.yesVsNo}</td>
        <td class="num">${o.noVsYes}</td>
        <td class="num">${o.withExpectation ? `${percent(o.sameAsExpectation, o.withExpectation)} of ${o.withExpectation}` : ""}</td>
      </tr>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reviewers side by side</title>
<style>
  body { margin:0; font:15px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif; color:#1c1b18; background:#f7f6f2; }
  main { max-width: 1500px; margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font: 600 26px/1.2 Georgia, serif; margin: 0 0 4px; }
  .muted { color:#6b6a63; } .small { font-size: 12px; }
  .scroll { overflow-x:auto; margin-top:16px; }
  table { width:100%; border-collapse: collapse; background:#fff; border:1px solid #d9d6cc; font-size:13px; }
  th, td { text-align:left; padding: 7px 10px; border-top:1px solid #d9d6cc; vertical-align: top; }
  th { background:#efede6; border-top:0; font-size:12px; color:#6b6a63; font-weight:600; }
  td.num, th.num { text-align:right; } td.num { white-space:nowrap; }
  td:first-child { min-width: 210px; } td:nth-child(5) { min-width: 150px; }
  a { color:#4d6b53; font-weight:600; }
</style>
</head>
<body>
<main>
  <h1>Reviewers side by side</h1>
  <p class="muted">${outcomes.length} reviewers · made ${escape(made.toLocaleString("en-US", { timeZone: "America/New_York" }))} Boston time · for organizers only. Each name opens that person's page, which must be in the same folder as this one.</p>
  <div class="scroll">
  <table>
    <thead><tr>
      <th>Reviewer</th><th class="num">Transcript reviews</th><th class="num">Comparisons</th><th class="num">Skipped</th>
      <th>First to last (Boston)</th><th class="num">Median time on a record</th><th class="num">Median per user message</th>
      <th class="num">Yes / No / Cannot determine</th><th class="num">Said Yes</th>
      <th class="num">Same as other reviewers</th><th class="num">Yes where another said No</th><th class="num">No where another said Yes</th>
      <th class="num">Same as the author expected</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  </div>
  <p class="muted small">"Same as other reviewers" counts every other verdict on a record this person also reviewed. Time runs from being handed a record to submitting it, so a break counts; the reviewer is asked to judge the user's messages, which is why time per user message is shown. The author's expectation is not a right answer. None of these numbers settles whether a review is sound: open the person's page and read.</p>
</main>
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2).map((a) => a.trim()).filter(Boolean);
  const wanted: string[] = [];
  let top: number | null = null;
  let all = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") all = true;
    else if (arg === "--top") top = Number(args[++i]);
    else if (arg.startsWith("--top=")) top = Number(arg.slice(6));
    else if (arg.startsWith("--")) {
      console.error(`\nUnknown option ${arg}.\n${USAGE}`);
      process.exit(1);
    } else wanted.push(arg);
  }
  if (top !== null && (!Number.isInteger(top) || top < 1)) {
    console.error(`\n--top needs a whole number, as in --top 10.\n${USAGE}`);
    process.exit(1);
  }
  if (wanted.length === 0 && top === null && !all) {
    console.error(USAGE);
    process.exit(1);
  }

  const reviewers = new Map<string, Person>();
  const problems: string[] = [];
  for (const one of wanted) {
    const found = await find(one);
    if (typeof found === "string") problems.push(found);
    else reviewers.set(found.id, found);
  }
  if (top !== null || all) {
    for (const person of await busiest(all ? null : top)) reviewers.set(person.id, person);
  }
  for (const problem of problems) console.error(`\n  ${problem}`);
  if (reviewers.size === 0) {
    console.error("\n  Nothing written.\n");
    process.exit(1);
  }

  const made = new Date();
  const folder = join(process.cwd(), "audits");
  const outcomes: Outcome[] = [];
  for (const reviewer of reviewers.values()) {
    const outcome = await auditOne(reviewer, made);
    outcomes.push(outcome);
    console.log(`\n  ${reviewer.name} <${reviewer.email}>`);
    console.log(`  ${outcome.reviews} transcript reviews, ${outcome.comparisons} comparisons, ${outcome.skipped} skipped`);
    console.log(`  ${join(folder, outcome.file)}`);
  }
  if (outcomes.length > 1) {
    outcomes.sort((a, b) => b.reviews - a.reviews);
    const name = `reviewers-${stamp(made)}.html`;
    writeFileSync(join(folder, name), listing(outcomes, made));
    console.log(`\n  Side by side, with a link to each page:\n  ${join(folder, name)}`);
  }
  console.log("\n  Open in a browser. These pages hold participants' conversations: keep them to the organizers.\n");
  // Someone asked for was not found: say so in the exit code too.
  process.exit(problems.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
