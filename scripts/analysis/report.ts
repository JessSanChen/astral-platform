/**
 * The descriptive report: one page of counts and tables about who took
 * part, what they made, how it was reviewed and how far reviewers agreed.
 *
 * People appear as P001, P002 ...; there are no names and no conversation
 * text. Small groups can still point to a person, so it is for the
 * organizers until someone has decided what may be shared.
 */
import { WORK_AREAS } from "@/lib/intake";
import type { Dataset } from "./load";
import {
  COMPARISON_FORM_FAMILY,
  FAST_SECONDS_ON_RECORD,
  FAST_SECONDS_PER_USER_MESSAGE,
  REVIEW_FORM_FAMILY,
  SHORTLIST_POINTS,
  SOLID_FROM,
  STRONG_FROM,
  TIERS,
  TRIVIAL_USER_CHARS,
  background,
  familiarityName,
  krippendorffAlpha,
  majority,
  median,
  pairwise,
  type Comparison,
  type Review,
  type Rules,
  type Work,
} from "./measure";
import { activityOf, names } from "./outputs";
import { bostonDay, bostonTime, duration, esc, fixed, num, page, pct, share, stat, table, tally } from "./write";

const G_ORDER = ["g0", "g1", "g2", "g3", "not_applicable", "cannot_assess"];
const A_ORDER = ["a0", "a1", "a2", "a3", "cannot_assess"];

const label = (labels: Record<string, unknown> | null, key: string) =>
  typeof labels?.[key] === "string" ? (labels[key] as string) : "";

/** Reviews grouped by the record they are of. */
function byView(reviews: Review[], verdict: (r: Review) => string = (r) => r.response.verdict) {
  const units = new Map<string, string[]>();
  for (const r of reviews) units.set(r.view.id, [...(units.get(r.view.id) ?? []), verdict(r)]);
  return [...units.values()];
}

function agreementRow(name: string, reviews: Review[], verdict?: (r: Review) => string) {
  const units = byView(reviews, verdict);
  const shared = units.filter((u) => u.length >= 2);
  const { pairs, same } = pairwise(shared);
  const yesNo = shared.map((u) => u.filter((v) => v !== "indeterminate")).filter((u) => u.length >= 2);
  const yn = pairwise(yesNo);
  return [
    name,
    reviews.length,
    shared.length,
    pairs,
    pct(same, pairs),
    fixed(krippendorffAlpha(shared)),
    pct(yn.same, yn.pairs),
    fixed(krippendorffAlpha(yesNo)),
  ];
}

/** One row of verdicts for a group of reviews, with pace and agreement. */
function verdictRow(name: string, group: Review[], all: Review[]) {
  const n = group.length;
  const count = (v: string) => group.filter((r) => r.response.verdict === v).length;
  // Every other verdict on a record someone in this group also reviewed.
  const others = new Map<string, Review[]>();
  for (const r of all) others.set(r.view.id, [...(others.get(r.view.id) ?? []), r]);
  let pairs = 0;
  let same = 0;
  for (const r of group) {
    for (const o of others.get(r.view.id) ?? []) {
      if (o.response.id === r.response.id) continue;
      pairs++;
      if (o.response.verdict === r.response.verdict) same++;
    }
  }
  return [
    name,
    new Set(group.map((r) => r.reviewer.id)).size,
    n,
    share(count("yes"), n),
    pct(count("no"), n),
    pct(count("indeterminate"), n),
    n ? duration(median(group.map((r) => r.seconds))) : "–",
    n ? duration(median(group.map((r) => r.secondsPerUserMessage))) : "–",
    pairs ? `${pct(same, pairs)} of ${pairs}` : "–",
  ];
}
const VERDICT_HEAD = [
  "", "Reviewers", "Reviews", "Said Yes", "No", "Cannot determine", "Median time on a record",
  "Median per user message", "Same as other reviewers",
];

function crosstab(reviews: Review[], rowOf: (r: Review) => string, rows: string[], rowName: (v: string) => string) {
  return table(
    ["", "Reviews", "Yes", "No", "Cannot determine", "Said Yes"],
    rows
      .map((value) => {
        const group = reviews.filter((r) => rowOf(r) === value);
        const count = (v: string) => group.filter((r) => r.response.verdict === v).length;
        return [
          rowName(value) || "(not answered)",
          group.length,
          count("yes"),
          count("no"),
          count("indeterminate"),
          share(count("yes"), group.length),
        ];
      })
      .filter((row) => (row[1] as number) > 0),
  );
}

export function report(input: {
  data: Dataset;
  rules: Rules;
  reviews: Review[];
  otherForms: Record<string, number>;
  comparisons: Comparison[];
  works: Work[];
  made: Date;
}) {
  const { data, rules, reviews, otherForms, comparisons, works, made } = input;
  const everyone = [...data.people.values()];
  const kept = everyone.filter((p) => !p.leftOut);
  const answered = kept.map((p) => ({ p, b: background(p) })).filter((x) => x.b.score !== null);
  const activity = activityOf(data, reviews, comparisons);

  /* ---- 1. What is included ------------------------------------------ */
  const leftOut = tally(
    everyone.filter((p) => p.leftOut),
    (p) => p.leftOut,
  ).map(([why, n]) => [why, n]);
  const days = new Map<string, { accounts: number; kept: number; submitted: number; reviews: number }>();
  for (const p of everyone) {
    const day = bostonDay(p.createdAt);
    const d = days.get(day) ?? { accounts: 0, kept: 0, submitted: 0, reviews: 0 };
    d.accounts++;
    if (!p.leftOut) d.kept++;
    days.set(day, d);
  }
  for (const e of data.episodes.values()) {
    const p = data.people.get(e.userId);
    if (p && e.status === "submitted") days.get(bostonDay(p.createdAt))!.submitted++;
  }
  for (const r of data.responses) {
    const p = data.people.get(r.reviewerId);
    if (p) days.get(bostonDay(p.createdAt))!.reviews++;
  }
  const submittedSessions = works.flatMap((w) => w.sessions).filter((s) => s.session.status === "submitted");
  const viewedSessions = new Set([...data.views.values()].map((v) => v.sessionId));
  const noView = submittedSessions.filter((s) => !viewedSessions.has(s.session.id)).length;

  const included = `
  <h2 id="included">1. What is in this report</h2>
  <p>Read from <code>${esc(data.file.split("/").pop())}</code>. ${
    data.complete
      ? "The file is whole: it ends with its closing line."
      : `<strong>The file has no closing line, so the download was cut short and some records are missing.</strong> Download it again before relying on anything below.`
  }</p>
  <div class="stats">
    ${stat("Accounts in the file", everyone.length)}
    ${stat("Left out", everyone.length - kept.length, "see the reasons below")}
    ${stat("People in the analysis", kept.length, `${answered.length} finished the intake form`)}
    ${stat("Pieces of work", works.length, "a conversation or a folder, with at least one user message")}
    ${stat("Transcript reviews used", reviews.length)}
    ${stat("Comparisons used", comparisons.length)}
  </div>
  <h3>Accounts left out, and why</h3>
  ${leftOut.length ? table(["Reason", "Accounts"], leftOut) : `<p class="muted">None.</p>`}
  ${
    !rules.testersBefore && everyone.every((p) => !p.isTester)
      ? `<div class="note"><strong>No account is marked as a tester</strong>, and no start time was given, so accounts made while the platform was being tested are counted as participants. The table below shows when accounts were made. Run again with <code>--testers-before</code> and the time the event began (for example <code>--testers-before 2026-11-15T09:00</code>, Boston time) to leave earlier accounts out, with <code>--keep someone@example.com</code> for anyone who signed up early and is a real participant.</div>`
      : ""
  }
  <h3>When accounts were made</h3>
  ${table(
    ["Day (Boston)", "Accounts", "In the analysis", "Work they submitted", "Reviews they did"],
    [...days.entries()].sort().map(([day, d]) => [day, d.accounts, d.kept, d.submitted, d.reviews]),
  )}
  <h3>What else is set aside</h3>
  <ul>
    <li>Work and reviews by accounts that are left out, and reviews <em>of</em> their work.</li>
    <li>Reviews made with a form other than ${REVIEW_FORM_FAMILY}.x, which asked different questions${
      Object.keys(otherForms).length
        ? `: ${Object.entries(otherForms).map(([form, n]) => `${n} with ${esc(form)}`).join(", ")}`
        : " (there are none)"
    }. Comparisons likewise, other than ${COMPARISON_FORM_FAMILY}.x.</li>
    <li>${noView} submitted session${noView === 1 ? " has" : "s have"} no reviewer view, so could never be handed to a reviewer. They are counted as work but have no reviews.</li>
    <li>A changed review counts by its answers as they now stand. Section 5 shows what first answers would give.</li>
  </ul>`;

  /* ---- 2. People ----------------------------------------------------- */
  const tierRows = TIERS.map((tier) => {
    const group = kept.filter((p) => background(p).tier === tier);
    const sum = (f: (id: string) => number) => group.reduce((s, p) => s + f(p.id), 0);
    return [
      tier,
      group.length,
      sum((id) => activity(id).workSubmitted),
      sum((id) => activity(id).userMessages),
      sum((id) => activity(id).reviews),
      sum((id) => activity(id).comparisons),
    ];
  }).filter((row) => (row[1] as number) > 0);

  const people = `
  <h2 id="people">2. Who took part</h2>
  <p>From the intake form, for the ${answered.length} people in the analysis who finished it.</p>
  <h3>Current role</h3>
  ${table(["Role", "People", ""], tally(answered, (x) => x.b.role, names.role))}
  <h3>Strength of life-science background</h3>
  <p>A score from 0 to 10, made from three intake answers: the best familiarity they rated themselves in a life-science area (F0 to F3, 0 to 3 points), their longest applied experience in wet-lab, clinical or public-health work, or in computational research if they named a life-science area (0 to 4 points), and their career stage (0 to 3 points). <strong>Strong</strong> is ${STRONG_FROM} or more, <strong>Solid</strong> is ${SOLID_FROM} to under ${STRONG_FROM}. It is a way of sorting people, made up for this report: the points are at the top of <code>scripts/analysis/measure.ts</code> and are yours to change.</p>
  ${table(["Background", "People", "Work submitted", "User messages written", "Transcript reviews", "Comparisons"], tierRows)}
  <h3>Best self-rated familiarity in a life-science area</h3>
  ${table(["Level", "People", ""], tally(answered, (x) => familiarityName(x.b.bestLifeScience)))}
  <p class="muted small">F0: not enough background to assess plausibility. F1: can follow general concepts. F2: can assess routine work and spot material errors. F3: can assess specialized or ambiguous work. People rate at most three areas.</p>
  <h3>Areas people have studied or worked in</h3>
  ${table(["Area", "People", ""], tally(answered, (x) => (x.b.domains.length ? x.b.domains : ["(none named)"]), names.domain))}
  <h3>Applied experience, by kind of work</h3>
  ${table(
    ["Kind of work", "None", "Coursework or training", "Under 1 year", "1 to 3 years", "3 to 8 years", "8 years or more"],
    WORK_AREAS.map((w) => [
      w.label,
      ...[
        "none",
        "coursework_or_training_only",
        "applied_under_1_year",
        "applied_1_to_under_3_years",
        "applied_3_to_under_8_years",
        "applied_8_plus_years",
      ].map((band) => answered.filter((x) => (x.b.work[w.key] ?? "none") === band).length),
    ]),
  )}
  <h3>Working in AI safety or biosecurity</h3>
  ${table(
    ["", "People", ""],
    [
      ["AI safety and alignment", answered.filter((x) => x.b.focusTags.includes("ai_safety")).length],
      ["Biosecurity", answered.filter((x) => x.b.focusTags.includes("biosecurity")).length],
      ["Both", answered.filter((x) => x.b.focusTags.length === 2).length],
      ["Neither", answered.filter((x) => x.b.focusTags.length === 0).length],
    ].map(([name, n]) => [name, n, share(n as number, answered.length)]),
  )}
  <h3>How often they use AI assistants</h3>
  ${table(["", "People", ""], tally(answered, (x) => x.b.aiUse, names.aiUse))}`;

  /* ---- 3. What people made ------------------------------------------- */
  const sessions = works.flatMap((w) => w.sessions);
  const trivial = submittedSessions.filter((s) => s.userChars < TRIVIAL_USER_CHARS).length;
  const perAuthor = new Map<string, number>();
  for (const s of submittedSessions) perAuthor.set(s.session.userId, (perAuthor.get(s.session.userId) ?? 0) + 1);
  const authorCounts = [...perAuthor.values()].sort((a, b) => b - a);
  const top5 = authorCounts.slice(0, 5).reduce((a, b) => a + b, 0);
  const models = new Map<string, typeof submittedSessions>();
  for (const s of submittedSessions) {
    const model = s.session.modelId ?? "(unknown)";
    models.set(model, [...(models.get(model) ?? []), s]);
  }
  const made_ = `
  <h2 id="made">3. What people made</h2>
  <div class="stats">
    ${stat("Submitted", works.filter((w) => w.state === "submitted").length, `${works.filter((w) => w.state === "submitted" && w.episode.isFolder).length} of them folders`)}
    ${stat("Partly submitted folders", works.filter((w) => w.state === "partly submitted").length)}
    ${stat("Drafts never submitted", works.filter((w) => w.state === "draft").length)}
    ${stat("Sessions submitted", submittedSessions.length, `of ${sessions.length} with a user message`)}
    ${stat("People who submitted", perAuthor.size, authorCounts.length ? `median ${median(authorCounts)} sessions, most ${authorCounts[0]}` : "")}
    ${stat("From the 5 most active", pct(top5, submittedSessions.length), "share of submitted sessions")}
  </div>
  <p>The rest of this section is about the ${submittedSessions.length} submitted sessions. ${trivial} of them have fewer than ${TRIVIAL_USER_CHARS} characters from the user in all ("test", "hello"), which is not an attempt at anything.</p>
  <h3>How long they are</h3>
  ${table(
    ["", "Median", "Longest"],
    [
      ["User messages", median(submittedSessions.map((s) => s.userMessages)), Math.max(0, ...submittedSessions.map((s) => s.userMessages))],
      ["Characters written by the user", median(submittedSessions.map((s) => s.userChars)), Math.max(0, ...submittedSessions.map((s) => s.userChars))],
      ["Characters from the assistant", median(submittedSessions.map((s) => s.assistantChars)), Math.max(0, ...submittedSessions.map((s) => s.assistantChars))],
      ["Minutes from first message to last", Math.round(median(submittedSessions.map((s) => s.minutes))), Math.round(Math.max(0, ...submittedSessions.map((s) => s.minutes)))],
    ],
  )}
  <h3>By model</h3>
  ${table(
    ["Model", "Sessions", "Median user messages", "Sessions with a failed or empty reply"],
    [...models.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([model, group]) => [
        model,
        group.length,
        median(group.map((s) => s.userMessages)),
        group.filter((s) => s.failedReplies > 0).length,
      ]),
  )}
  <h3>What authors said about their own sessions</h3>
  <p class="muted small">Authors answered these before submitting. Reviewers never saw them.</p>
  ${table(["Scenario", "Sessions", ""], tally(submittedSessions, (s) => label(s.session.labels, "scenario"), names.scenario))}
  ${table(["Expected a reviewer to recommend specialist review", "Sessions", ""], tally(submittedSessions, (s) => label(s.session.labels, "expectReferral"), names.expected))}
  ${table(["Role taken", "Sessions", ""], tally(submittedSessions, (s) => label(s.session.labels, "role"), names.authorRole))}
  ${table(
    ["Kind of task (more than one allowed)", "Sessions", ""],
    tally(
      submittedSessions,
      (s) => (Array.isArray(s.session.labels?.taskKinds) ? (s.session.labels!.taskKinds as string[]) : []),
      names.taskKind,
    ),
  )}`;

  /* ---- 4. Reviewing --------------------------------------------------- */
  const perReviewer = new Map<string, Review[]>();
  for (const r of reviews) perReviewer.set(r.reviewer.id, [...(perReviewer.get(r.reviewer.id) ?? []), r]);
  const reviewerCounts = [...perReviewer.values()].map((g) => g.length).sort((a, b) => b - a);
  const reviewsByView = new Map<string, number>();
  for (const r of reviews) reviewsByView.set(r.view.id, (reviewsByView.get(r.view.id) ?? 0) + 1);
  const keptViews = [...data.views.values()].filter((v) => {
    const e = data.episodes.get(v.episodeId);
    return e && !data.people.get(e.userId)?.leftOut;
  });
  const coverage = new Map<number, number>();
  for (const v of keptViews) {
    const n = reviewsByView.get(v.id) ?? 0;
    coverage.set(n, (coverage.get(n) ?? 0) + 1);
  }
  const fast = reviews.filter((r) => r.fast).length;

  const reviewing = `
  <h2 id="reviewing">4. Reviewing</h2>
  <div class="stats">
    ${stat("Transcript reviews", reviews.length)}
    ${stat("Reviewers", perReviewer.size, reviewerCounts.length ? `median ${median(reviewerCounts)} reviews, most ${reviewerCounts[0]}` : "")}
    ${stat("From the 5 most active", pct(reviewerCounts.slice(0, 5).reduce((a, b) => a + b, 0), reviews.length), "share of all reviews")}
    ${stat("Median time on a record", duration(median(reviews.map((r) => r.seconds))), "handed out to submitted; a break counts")}
    ${stat("Median per user message", duration(median(reviews.map((r) => r.secondsPerUserMessage))))}
    ${stat("Fast reviews", pct(fast, reviews.length), `under ${FAST_SECONDS_ON_RECORD} s on the record, or under ${FAST_SECONDS_PER_USER_MESSAGE} s per user message`)}
  </div>
  <h3>How many reviews each record got</h3>
  ${table(
    ["Reviews on the record", "Records", ""],
    [...coverage.entries()].sort((a, b) => a[0] - b[0]).map(([n, views]) => [n, views, share(views, keptViews.length)]),
  )}
  <p class="muted small">A record is one thing a reviewer is shown: a session, or a folder's sessions read together.</p>
  <h3>Would you recommend specialist review?</h3>
  ${table(["Verdict", "Reviews", ""], tally(reviews, (r) => r.response.verdict, names.verdict))}
  ${table(["Confidence", "Reviews", ""], tally(reviews, (r) => r.response.confidence, names.confidence))}
  <h3>Verdict by how sensitive the reviewer judged the subject (g)</h3>
  ${crosstab(reviews, (r) => r.response.subjectSensitivity, G_ORDER, (v) => v)}
  <h3>Verdict by evidence of a concerning aim (a)</h3>
  ${crosstab(reviews, (r) => r.response.aimEvidence, A_ORDER, (v) => v)}
  <h3>Sensitivity (rows) against aim (columns): number of reviews</h3>
  ${table(
    ["", ...A_ORDER],
    G_ORDER.map((g) => [
      g,
      ...A_ORDER.map((a) => reviews.filter((r) => r.response.subjectSensitivity === g && r.response.aimEvidence === a).length),
    ]).filter((row) => row.slice(1).some((n) => (n as number) > 0)),
  )}
  <p class="muted small">g0: no specific sensitivity. g1: plausible, context-dependent dual-use relevance. g2: direct connection to a serious harm-relevant capability. g3: very high consequence. a0: no affirmative evidence. a1: indirect indications. a2: specific supporting evidence. a3: explicit concerning aim.</p>`;

  /* ---- 5. Agreement ---------------------------------------------------- */
  const shared = byView(reviews).filter((u) => u.length >= 2);
  const unanimous = shared.filter((u) => new Set(u).size === 1);
  const outcome = (v: string) => unanimous.filter((u) => u[0] === v).length;
  const agreement = `
  <h2 id="agreement">5. How far reviewers agree</h2>
  <p>${shared.length} records were reviewed by two or more people. On ${unanimous.length} of them (${pct(unanimous.length, shared.length)}) everyone gave the same verdict: ${outcome("yes")} all Yes, ${outcome("no")} all No, ${outcome("indeterminate")} all Cannot determine.</p>
  ${table(
    ["Counting", "Reviews", "Records with 2+", "Pairs of reviews", "Pairs the same", "Alpha", "Pairs the same, Yes or No only", "Alpha, Yes or No only"],
    [
      agreementRow("Every review", reviews),
      agreementRow(`Without records where the user wrote under ${TRIVIAL_USER_CHARS} characters`, reviews.filter((r) => !r.trivialRecord)),
      agreementRow("Without fast reviews", reviews.filter((r) => !r.fast)),
      agreementRow("First answers, where a review was later changed", reviews, (r) => r.firstVerdict),
      agreementRow("Single sessions only", reviews.filter((r) => r.view.kind === "session")),
    ],
  )}
  <p class="muted small">"Pairs the same" takes every two reviews of the same record and counts how often the verdicts match. Alpha is Krippendorff's alpha, which corrects that for the agreement chance alone would give: 1 is perfect, 0 is no better than chance. As a rule of thumb 0.8 or more is reliable and under 0.67 is not, though with few records it moves a lot. "Yes or No only" drops Cannot determine verdicts first.</p>`;

  /* ---- 6. Reviewer background ------------------------------------------- */
  const groupBy = (key: (r: Review) => string, order: string[]) =>
    order.map((value) => verdictRow(value, reviews.filter((r) => key(r) === value), reviews)).filter((row) => (row[2] as number) > 0);
  const busy = [...perReviewer.entries()].filter(([, g]) => g.length >= 10).sort((a, b) => b[1].length - a[1].length);
  const backgroundSection = `
  <h2 id="background">6. Does the reviewer's background change the verdict?</h2>
  <h3>By strength of life-science background</h3>
  ${table(VERDICT_HEAD, groupBy((r) => r.reviewerBackground.tier, [...TIERS]))}
  <h3>By best self-rated familiarity in a life-science area</h3>
  ${table(VERDICT_HEAD, groupBy((r) => familiarityName(r.reviewerBackground.bestLifeScience), ["F3", "F2", "F1", "F0", "none rated"]))}
  <h3>By current role</h3>
  ${table(
    VERDICT_HEAD,
    [...new Set(reviews.map((r) => r.reviewerBackground.role))]
      .map((role) => verdictRow(names.role(role) || "(not answered)", reviews.filter((r) => r.reviewerBackground.role === role), reviews))
      .sort((a, b) => (b[2] as number) - (a[2] as number)),
  )}
  <p class="muted small">These are differences between groups of people who also reviewed different records, so a gap here is something to look into, not a finding. A few very active reviewers can account for a whole row: see the next table.</p>
  <h3>Reviewers with 10 or more reviews</h3>
  ${table(
    ["Person", "Background", "Reviews", "Said Yes", "No", "Cannot determine", "Median time on a record", "Median per user message", "Same as other reviewers"],
    busy.map(([id, group]) => {
      const row = verdictRow(data.people.get(id)!.pid, group, reviews);
      return [row[0], group[0].reviewerBackground.tier, ...row.slice(2)];
    }),
    2,
  )}`;

  /* ---- 7. Reviewers and authors ------------------------------------------ */
  const sessionReviews = reviews.filter((r) => r.view.kind === "session");
  const authors = `
  <h2 id="authors">7. Reviewers against what authors expected</h2>
  <p>Reviews of single sessions, set against what the session's author said about it before submitting. The author's answer is not a right answer; it is what they were trying to make.</p>
  <h3>Verdict by what the author expected a reviewer to decide</h3>
  ${crosstab(sessionReviews, (r) => label(r.labels, "expectReferral"), ["yes", "no", "unsure", ""], names.expected)}
  <h3>Verdict by the scenario the author said they were constructing</h3>
  ${crosstab(sessionReviews, (r) => label(r.labels, "scenario"), ["ordinary", "dual_use", "fictional_concerning", "exploratory", ""], names.scenario)}`;

  /* ---- 8. Matched sets ---------------------------------------------------- */
  const verdictsBySession = new Map<string, string[]>();
  for (const r of sessionReviews) {
    verdictsBySession.set(r.view.sessionId!, [...(verdictsBySession.get(r.view.sessionId!) ?? []), r.response.verdict]);
  }
  const pairs = data.related.filter((r) => !data.people.get(r.createdBy)?.leftOut);
  const show = (verdicts: string[]) => (verdicts.length ? verdicts.map(names.verdict).join(", ") : "not reviewed");
  const bothReviewed = pairs.filter(
    (r) => (verdictsBySession.get(r.sourceSessionId ?? "") ?? []).length && (verdictsBySession.get(r.targetSessionId ?? "") ?? []).length,
  );
  const moved = bothReviewed.filter(
    (r) => majority(verdictsBySession.get(r.sourceSessionId!)!) !== majority(verdictsBySession.get(r.targetSessionId!)!),
  );
  const matched = `
  <h2 id="matched">8. Matched sets</h2>
  <p>${pairs.length} related conversation${pairs.length === 1 ? " was" : "s were"} made: a second conversation that changes one thing about a first. ${bothReviewed.length} ${bothReviewed.length === 1 ? "pair has" : "pairs have"} reviews on both sides; on ${moved.length} of those the reviewers' overall verdict is different between the two.</p>
  ${table(
    ["Author", "What the author set out to change", "Original: verdicts", "Related: verdicts", "Verdict moved", "Comparisons"],
    pairs.map((r) => {
      const source = verdictsBySession.get(r.sourceSessionId ?? "") ?? [];
      const target = verdictsBySession.get(r.targetSessionId ?? "") ?? [];
      return [
        data.people.get(r.createdBy)?.pid ?? "",
        names.intent(r.intent),
        show(source),
        show(target),
        source.length && target.length ? (majority(source) !== majority(target) ? "yes" : "no") : "–",
        comparisons.filter((c) => c.related.id === r.id).length,
      ];
    }),
    5,
  )}
  <h3>What comparers said (${comparisons.length} comparison${comparisons.length === 1 ? "" : "s"})</h3>
  ${
    comparisons.length
      ? `${table(["Same scientific topic or task?", "Comparisons", ""], tally(comparisons, (c) => c.audit.topicTaskMatch, names.match))}
         ${table(["Technical scope", "Comparisons", ""], tally(comparisons, (c) => c.audit.scopeSimilarity ?? "", names.scope))}
         ${table(["Main difference", "Comparisons", ""], tally(comparisons, (c) => c.audit.mainDifference ?? "", names.difference))}`
      : `<p class="muted">None.</p>`
  }`;

  /* ---- 9. Folders read whole ------------------------------------------------ */
  const folderRows = works
    .filter((w) => w.episode.isFolder && w.reviews.length > 0)
    .map((w) => {
      const whole = w.reviews.filter((r) => r.view.kind === "linked").map((r) => r.response.verdict);
      const parts = w.sessions.map((s) => `${s.session.order}: ${show(verdictsBySession.get(s.session.id) ?? [])}`);
      return [w.author.pid, w.sessions.length, show(whole), parts.join(" · ")];
    });
  const folders = `
  <h2 id="folders">9. Folders: read whole, and session by session</h2>
  <p>A folder submitted as a whole is reviewed twice over: each session by itself, and all its sessions together in the order things happened. If something only shows when the sessions are read together, the first column of verdicts will differ from the second.</p>
  ${table(["Author", "Sessions", "Read whole: verdicts", "Each session by itself: verdicts"], folderRows, 1)}`;

  /* ---- 10. The other files, and the rules ----------------------------------- */
  const files = `
  <h2 id="files">10. The other files, and how the numbers were made</h2>
  <ul>
    <li><code>tables/</code>: the same data as rows, for a spreadsheet or for R or Python: <code>participants.csv</code>, <code>work.csv</code>, <code>sessions.csv</code>, <code>reviews.csv</code>, <code>review_assignments.csv</code>, <code>related_pairs.csv</code>, <code>comparisons.csv</code>. People are P001, P002 ...; no names, no email addresses, no conversation text.</li>
    <li><code>identified/contact-log.csv</code>: everyone in the analysis with their background and what they did, strongest background first, with empty columns for when you contacted them and what came of it.</li>
    <li><code>identified/reading-list.html</code> and <code>.csv</code>: the work with the most reasons to be read by an expert, with the reasons.</li>
    <li><code>identified/people.csv</code>: which person is which P-number, and who was left out and why.</li>
  </ul>
  <p>The <code>identified</code> folder has names, email addresses and conversations. Keep it to the organizers.</p>
  <h3>Reading-list points</h3>
  ${table(["Reason", "Points"], Object.entries(SHORTLIST_POINTS).map(([reason, points]) => [reason, points]))}
  <p class="muted small">All the rules used here (who counts as strong, what counts as a fast review, these points) are named constants at the top of the sections of <code>scripts/analysis/measure.ts</code>. Change one and run again.</p>`;

  return page(
    "ASTRAL: what the event produced",
    `<h1>ASTRAL: what the event produced</h1>
    <p class="muted">Made ${esc(bostonTime(made))} Boston time from one export. People are shown as P-numbers and there is no conversation text, but small groups can still point to a person: for the organizers until you have decided what may be shared.</p>
    <nav>
      <a href="#included">1. What is included</a><a href="#people">2. Who took part</a><a href="#made">3. What people made</a>
      <a href="#reviewing">4. Reviewing</a><a href="#agreement">5. Agreement</a><a href="#background">6. Reviewer background</a>
      <a href="#authors">7. Against authors</a><a href="#matched">8. Matched sets</a><a href="#folders">9. Folders</a><a href="#files">10. Files and rules</a>
    </nav>
    ${included}${people}${made_}${reviewing}${agreement}${backgroundSection}${authors}${matched}${folders}${files}
    <p class="muted small" style="margin-top:40px">${num(Object.values(data.read).reduce((a, b) => a + b, 0))} records read.</p>`,
  );
}
