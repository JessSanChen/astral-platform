/**
 * The files the analysis writes, other than the report.
 *
 *   tables/       one row per person, piece of work, session, review ...
 *                 People are P001, P002 ...; there are no names, no email
 *                 addresses and no conversation text in these.
 *   identified/   the contact log and the reading list. These have names,
 *                 email addresses and, in the reading list, conversations.
 *                 For organizers only.
 */
import {
  AUTHOR_ROLES,
  EXPECT_REFERRAL,
  SCENARIOS,
  TASK_KINDS,
  labelOf,
} from "@/lib/author-labels";
import { comparisonIntentLabel } from "@/lib/episode-options";
import { AI_USE, EXPERIENCE_BANDS, FOCUS_TAGS, ROLES, WORK_AREAS, domainLabel } from "@/lib/intake";
import {
  AIM_EVIDENCE,
  CONFIDENCE,
  MAIN_DIFFERENCE,
  MATCH,
  SCOPE_SIMILARITY,
  SUBJECT_SENSITIVITY,
  VERDICTS,
} from "@/lib/review-form";
import type { Dataset, Person } from "./load";
import {
  background,
  domainNames,
  familiarityName,
  majority,
  measureSession,
  type Background,
  type Comparison,
  type Review,
  type Work,
} from "./measure";
import { bostonDay, bostonTime, csv, duration, esc, num, page, type Cell } from "./write";

const label = (labels: Record<string, unknown> | null, key: string) =>
  typeof labels?.[key] === "string" ? (labels[key] as string) : "";
const labelList = (labels: Record<string, unknown> | null, key: string) =>
  Array.isArray(labels?.[key]) ? (labels[key] as string[]) : [];

/* ---- What each person did ------------------------------------------- */

export type Activity = {
  sessionsStarted: number;
  sessionsSubmitted: number;
  workSubmitted: number;
  foldersSubmitted: number;
  userMessages: number;
  userChars: number;
  reviews: number;
  comparisons: number;
  skipped: number;
  relatedConversations: number;
  nominations: string[];
  tokens: number;
};

export function activityOf(data: Dataset, reviews: Review[], comparisons: Comparison[]) {
  const all = new Map<string, Activity>();
  const of = (id: string) => {
    if (!all.has(id)) {
      all.set(id, {
        sessionsStarted: 0,
        sessionsSubmitted: 0,
        workSubmitted: 0,
        foldersSubmitted: 0,
        userMessages: 0,
        userChars: 0,
        reviews: 0,
        comparisons: 0,
        skipped: 0,
        relatedConversations: 0,
        nominations: [],
        tokens: 0,
      });
    }
    return all.get(id)!;
  };
  for (const session of data.sessions.values()) {
    const m = measureSession(session);
    if (m.userMessages === 0) continue;
    const a = of(session.userId);
    a.sessionsStarted++;
    if (session.status === "submitted") a.sessionsSubmitted++;
    a.userMessages += m.userMessages;
    a.userChars += m.userChars;
  }
  for (const episode of data.episodes.values()) {
    if (episode.status !== "submitted") continue;
    const a = of(episode.userId);
    a.workSubmitted++;
    if (episode.isFolder) a.foldersSubmitted++;
  }
  for (const r of reviews) of(r.reviewer.id).reviews++;
  for (const c of comparisons) of(c.reviewer.id).comparisons++;
  for (const a of data.assignments.values()) if (a.state === "skipped") of(a.reviewerId).skipped++;
  for (const r of data.related) of(r.createdBy).relatedConversations++;
  for (const n of data.nominations) of(n.userId).nominations.push(n.track);
  for (const [id, u] of data.usage) of(id).tokens = u.tokens;
  return of;
}

/* ---- De-identified tables ------------------------------------------- */

const workBand = (b: Background, key: string) => labelOf(EXPERIENCE_BANDS, b.work[key] ?? "");

export function tables(
  data: Dataset,
  reviews: Review[],
  comparisons: Comparison[],
  works: Work[],
): Record<string, string> {
  const activity = activityOf(data, reviews, comparisons);
  const pid = (userId: string) => data.people.get(userId)?.pid ?? "";
  const kept = [...data.people.values()].filter((p) => !p.leftOut).sort((a, b) => a.pid.localeCompare(b.pid));

  const participants = csv(
    [
      "person", "account_made_on", "intake_completed", "passed_instruction_check", "role",
      "background_tier", "background_score", "familiarity_points", "experience_points", "career_stage_points",
      "best_life_science_familiarity", "best_other_technical_familiarity", "areas", "areas_rated",
      ...WORK_AREAS.map((w) => `experience_${w.key}`),
      "focus_ai_safety", "focus_biosecurity", "ai_assistant_use",
      "sessions_started", "sessions_submitted", "work_submitted", "folders_submitted", "user_messages",
      "user_characters", "transcript_reviews", "comparisons", "skipped", "related_conversations", "nominations", "tokens",
    ],
    kept.map((p) => {
      const b = background(p);
      const a = activity(p.id);
      return [
        p.pid, bostonDay(p.createdAt), p.intakeCompleted, p.passedInstructionCheck, b.role,
        b.tier, b.score, Math.max(0, b.bestLifeScience), b.experiencePoints, b.seniorityPoints,
        familiarityName(b.bestLifeScience), familiarityName(b.bestOtherTechnical), b.domains.join(";"),
        Object.entries(b.familiarity).map(([d, f]) => `${d}=${f}`).join(";"),
        ...WORK_AREAS.map((w) => b.work[w.key] ?? ""),
        b.focusTags.includes("ai_safety"), b.focusTags.includes("biosecurity"), b.aiUse,
        a.sessionsStarted, a.sessionsSubmitted, a.workSubmitted, a.foldersSubmitted, a.userMessages,
        a.userChars, a.reviews, a.comparisons, a.skipped, a.relatedConversations, a.nominations.join(";"), a.tokens,
      ];
    }),
  );

  const work = csv(
    [
      "work_id", "author", "author_background_tier", "kind", "state", "sessions", "user_messages", "user_characters",
      "assistant_characters", "minutes", "failed_replies", "models", "scenarios", "author_expected_referral",
      "has_related_conversation", "reviews", "verdicts_yes", "verdicts_no", "verdicts_cannot_determine",
      "reviewers_disagree", "reading_list_score", "reading_list_reasons",
    ],
    works.map((w) => [
      w.episode.id, w.author.pid, w.authorBackground.tier, w.episode.isFolder ? "folder" : "conversation", w.state,
      w.sessions.length, w.userMessages, w.userChars, w.assistantChars, w.minutes, w.failedReplies, w.models.join(";"),
      w.scenarios.join(";"), w.expectedReferral.join(";"), w.related, w.reviews.length,
      w.verdicts.filter((v) => v === "yes").length, w.verdicts.filter((v) => v === "no").length,
      w.verdicts.filter((v) => v === "indeterminate").length, w.disagreement, w.score,
      w.reasons.map((r) => r.why).join("; "),
    ]),
  );

  const verdictsBySession = new Map<string, string[]>();
  for (const r of reviews) {
    if (r.view.kind !== "session" || !r.view.sessionId) continue;
    verdictsBySession.set(r.view.sessionId, [...(verdictsBySession.get(r.view.sessionId) ?? []), r.response.verdict]);
  }
  const viewed = new Set([...data.views.values()].map((v) => v.sessionId).filter(Boolean));
  const sessions = csv(
    [
      "session_id", "work_id", "author", "in_a_folder", "order_in_folder", "status", "model", "submitted_at_utc",
      "author_role_taken", "author_task_kinds", "author_scenario", "author_expected_referral", "author_confidence",
      "task_real_or_invented", "user_messages", "assistant_messages", "user_characters", "assistant_characters",
      "minutes", "failed_replies", "author_pasted_characters", "author_copies_of_replies", "has_reviewer_view",
      "reviews", "verdicts", "majority_verdict",
    ],
    works.flatMap((w) =>
      w.sessions.map((s) => {
        const verdicts = verdictsBySession.get(s.session.id) ?? [];
        const l = s.session.labels;
        return [
          s.session.id, w.episode.id, w.author.pid, w.episode.isFolder, s.session.order, s.session.status,
          s.session.modelId, s.session.submittedAt?.toISOString() ?? "",
          label(l, "role"), labelList(l, "taskKinds").join(";"), label(l, "scenario"), label(l, "expectReferral"),
          label(l, "expectConfidence"), label(l, "provenance"), s.userMessages, s.assistantMessages, s.userChars,
          s.assistantChars, s.minutes, s.failedReplies, s.authorPasteChars, s.authorCopiesOfReplies,
          viewed.has(s.session.id), verdicts.length, verdicts.join(";"), majority(verdicts),
        ] as Cell[];
      }),
    ),
  );

  const reviewTable = csv(
    [
      "review_id", "view_id", "view_kind", "work_id", "session_id", "reviewer", "author",
      "reviewer_background_tier", "reviewer_best_life_science_familiarity", "reviewer_role",
      "verdict", "first_verdict", "times_changed", "confidence", "evidence", "user_messages_pointed_to",
      "subject_sensitivity", "aim_evidence", "uncertainty_reasons", "explanation_characters",
      "seconds_on_record", "user_messages_in_record", "user_characters_in_record", "seconds_per_user_message",
      "fast", "trivial_record", "author_scenario", "author_expected_referral", "form_version",
      "instructions_version", "submitted_at_utc",
    ],
    reviews.map((r) => [
      r.response.id, r.view.id, r.view.kind, r.episode.id, r.view.sessionId ?? "", r.reviewer.pid, r.author.pid,
      r.reviewerBackground.tier, familiarityName(r.reviewerBackground.bestLifeScience), r.reviewerBackground.role,
      r.response.verdict, r.firstVerdict, r.response.revisionCount, r.response.confidence, r.response.evidenceMode,
      r.response.evidenceTurns.length, r.response.subjectSensitivity, r.response.aimEvidence,
      r.response.uncertaintyReasons.join(";"), r.response.rationale.length, r.seconds, r.userMessages, r.userChars,
      r.secondsPerUserMessage, r.fast, r.trivialRecord, label(r.labels, "scenario"), label(r.labels, "expectReferral"),
      r.response.formVersion, r.response.instructionVersion, r.response.submittedAt.toISOString(),
    ]),
  );

  const assignments = csv(
    ["assignment_id", "reviewer", "kind", "state", "skip_reason", "view_id", "related_pair_id", "handed_out_at_utc", "finished_at_utc"],
    [...data.assignments.values()]
      .filter((a) => !data.people.get(a.reviewerId)?.leftOut)
      .map((a) => [
        a.id, pid(a.reviewerId), a.purpose === "pair_audit" ? "comparison" : "transcript review", a.state,
        a.skipReason ?? "", a.viewId ?? "", a.relatedVersionId ?? "", a.reservedAt.toISOString(),
        a.finishedAt?.toISOString() ?? "",
      ]),
  );

  const pairs = csv(
    [
      "related_pair_id", "author", "what_the_author_set_out_to_change", "original_session_id", "related_session_id",
      "original_verdicts", "related_verdicts", "original_majority", "related_majority", "comparisons",
    ],
    data.related
      .filter((r) => !data.people.get(r.createdBy)?.leftOut)
      .map((r) => {
        const source = verdictsBySession.get(r.sourceSessionId ?? "") ?? [];
        const target = verdictsBySession.get(r.targetSessionId ?? "") ?? [];
        return [
          r.id, pid(r.createdBy), r.intent, r.sourceSessionId ?? "", r.targetSessionId ?? "", source.join(";"),
          target.join(";"), majority(source), majority(target),
          comparisons.filter((c) => c.related.id === r.id).length,
        ];
      }),
  );

  const comparisonTable = csv(
    [
      "comparison_id", "related_pair_id", "reviewer", "author", "what_the_author_set_out_to_change",
      "same_topic_or_task", "technical_scope", "main_difference", "note_characters", "seconds_on_pair", "times_changed",
    ],
    comparisons.map((c) => [
      c.audit.id, c.related.id, c.reviewer.pid, c.author.pid, c.related.intent, c.audit.topicTaskMatch,
      c.audit.scopeSimilarity ?? "", c.audit.mainDifference ?? "", c.audit.note.length, c.seconds, c.audit.revisionCount,
    ]),
  );

  return {
    "participants.csv": participants,
    "work.csv": work,
    "sessions.csv": sessions,
    "reviews.csv": reviewTable,
    "review_assignments.csv": assignments,
    "related_pairs.csv": pairs,
    "comparisons.csv": comparisonTable,
  };
}

/* ---- Identified: who is who ------------------------------------------ */

export function peopleKey(data: Dataset) {
  return csv(
    ["person", "name", "email", "organizer", "marked_as_tester", "account_made_boston", "in_the_analysis", "why_left_out"],
    [...data.people.values()]
      .sort((a, b) => a.pid.localeCompare(b.pid))
      .map((p) => [p.pid, p.name, p.email, p.isOrganizer, p.isTester, bostonTime(p.createdAt), !p.leftOut, p.leftOut]),
  );
}

/* ---- Identified: the contact log -------------------------------------- */

const yesNo = (v: boolean) => (v ? "yes" : "");

export function contactLog(data: Dataset, reviews: Review[], comparisons: Comparison[], site: string) {
  const activity = activityOf(data, reviews, comparisons);
  const rows = [...data.people.values()]
    .filter((p) => !p.leftOut)
    .map((p) => ({ p, b: background(p), a: activity(p.id) }))
    .sort(
      (x, y) =>
        (y.b.score ?? -1) - (x.b.score ?? -1) ||
        y.a.userMessages + y.a.reviews - (x.a.userMessages + x.a.reviews) ||
        x.p.name.localeCompare(y.p.name),
    );
  return {
    count: rows.length,
    strong: rows.filter((r) => r.b.tier === "Strong").length,
    solid: rows.filter((r) => r.b.tier === "Solid").length,
    text: csv(
      [
        // Yours to fill in.
        "Priority", "Contacted on", "Contacted by", "How", "Reply", "Next step", "Notes",
        // From the event.
        "Name", "Email", "Background", "Score (0-10)", "Current role", "Best life-science familiarity",
        "In which areas", "All areas named", "Wet-lab experience", "Clinical experience",
        "Public-health or field experience", "Computational research experience",
        "Software, AI or research engineering experience", "Best other technical familiarity",
        "AI safety", "Biosecurity", "Uses AI assistants", "Work submitted", "Sessions submitted",
        "User messages written", "Transcript reviews", "Comparisons", "Related conversations made",
        "Prize entries", "Permission for public release", "Their page in the console", "Person",
      ],
      rows.map(({ p, b, a }) => [
        "", "", "", "", "", "", "",
        p.name, p.email, b.tier, b.score, b.role === "other" && b.roleOther ? `Other: ${b.roleOther}` : labelOf(ROLES, b.role),
        familiarityName(b.bestLifeScience), domainNames(b.bestLifeScienceAreas), domainNames(b.domains),
        workBand(b, "wet_lab"), workBand(b, "clinical"), workBand(b, "public_health_field"),
        workBand(b, "computational_research"), workBand(b, "research_engineering"),
        familiarityName(b.bestOtherTechnical), yesNo(b.focusTags.includes("ai_safety")),
        yesNo(b.focusTags.includes("biosecurity")), labelOf(AI_USE, b.aiUse), a.workSubmitted, a.sessionsSubmitted,
        a.userMessages, a.reviews, a.comparisons, a.relatedConversations, a.nominations.join("; "), p.publicRelease,
        `${site}/admin/participants/${p.id}`, p.pid,
      ]),
    ),
  };
}

/* ---- Identified: the reading list -------------------------------------- */

const REPLY_SHOWN = 700;

function transcriptOf(work: Work) {
  return work.sessions
    .map((s) => {
      const live = s.session.messages.filter((m) => !m.superseded);
      const turns = live
        .map((m, i) => {
          const user = m.role === "user";
          const text = m.content ?? "";
          const body =
            !user && text.length > REPLY_SHOWN
              ? `${esc(text.slice(0, REPLY_SHOWN))}<details><summary>the rest of this reply (${num(text.length - REPLY_SHOWN)} more characters)</summary>${esc(text.slice(REPLY_SHOWN))}</details>`
              : text.trim()
                ? esc(text)
                : `<span class="muted">${m.failed ? "No reply: the request failed or was blocked." : "No reply text was returned."}</span>`;
          return `<div class="turn ${user ? "user" : "assistant"}"><div class="who">${i + 1}. ${user ? "User" : `Assistant${m.modelId ? ` · ${esc(m.modelId)}` : ""}`}</div><div class="text">${body}</div></div>`;
        })
        .join("\n");
      const l = s.session.labels;
      const said = [
        label(l, "scenario") && `scenario: ${labelOf(SCENARIOS, label(l, "scenario"))}`,
        label(l, "role") && `role taken: ${labelOf(AUTHOR_ROLES, label(l, "role"))}`,
        labelList(l, "taskKinds").length && `task: ${labelList(l, "taskKinds").map((k) => labelOf(TASK_KINDS, k)).join(", ")}`,
        label(l, "expectReferral") && `expected referral: ${labelOf(EXPECT_REFERRAL, label(l, "expectReferral"))}`,
      ].filter(Boolean);
      return `<details><summary>${work.episode.isFolder ? `Session ${s.session.order}: ` : ""}${esc(s.session.title || "Conversation")} · ${s.userMessages} user messages · ${esc(s.session.modelId ?? "")} · ${esc(s.session.status)}</summary>
        ${said.length ? `<p class="muted small">The author said: ${esc(said.join(" · "))}</p>` : ""}
        ${turns}
      </details>`;
    })
    .join("\n");
}

export function readingList(works: Work[], top: number, site: string, made: Date) {
  const text = csv(
    [
      "Rank", "Score", "Read it?", "Your notes", "Why it is on the list", "Author", "Email", "Author background",
      "Author score (0-10)", "Title", "Kind", "State", "Sessions", "User messages", "User characters", "Minutes",
      "Models", "Reviews", "Yes", "No", "Cannot determine", "Author's page in the console", "Work id",
    ],
    works.map((w, i) => [
      i + 1, w.score, "", "", w.reasons.map((r) => r.why).join("; "), w.author.name, w.author.email,
      w.authorBackground.tier, w.authorBackground.score, w.episode.title,
      w.episode.isFolder ? "folder" : "conversation", w.state, w.sessions.length, w.userMessages, w.userChars,
      Math.round(w.minutes), w.models.join("; "), w.reviews.length,
      w.verdicts.filter((v) => v === "yes").length, w.verdicts.filter((v) => v === "no").length,
      w.verdicts.filter((v) => v === "indeterminate").length, `${site}/admin/participants/${w.author.id}`, w.episode.id,
    ]),
  );

  // The highest scores overall, and the highest among authors with a strong
  // background, who are the ones most worth reading and can be crowded out
  // of the first list by long conversations from anyone.
  const ranked = works.map((w, i) => ({ w, rank: i + 1 }));
  const overall = new Set(ranked.slice(0, top).map((x) => x.w.episode.id));
  const strong = ranked.filter((x) => x.w.authorBackground.tier === "Strong");
  const strongTop = new Set(strong.slice(0, top).map((x) => x.w.episode.id));
  const shown = ranked.filter((x) => overall.has(x.w.episode.id) || strongTop.has(x.w.episode.id));

  const cards = shown
    .map(({ w, rank }) => {
      const i = rank - 1;
      const b = w.authorBackground;
      const flags = [overall.has(w.episode.id) ? "overall" : "", strongTop.has(w.episode.id) ? "strong" : ""].join(" ");
      const reviewLines = w.reviews
        .map(
          (r) =>
            `<li><strong>${esc(labelOf(VERDICTS, r.response.verdict))}</strong> (${esc(labelOf(CONFIDENCE, r.response.confidence).toLowerCase())} confidence; ${esc(r.response.subjectSensitivity)}: ${esc(labelOf(SUBJECT_SENSITIVITY, r.response.subjectSensitivity))}; ${esc(r.response.aimEvidence)}: ${esc(labelOf(AIM_EVIDENCE, r.response.aimEvidence))}), ${esc(r.reviewer.name)}${r.view.kind === "linked" ? ", reading the whole folder" : ""}${r.response.rationale ? `<br><span class="muted">${esc(r.response.rationale)}</span>` : ""}</li>`,
        )
        .join("");
      return `<section class="card" id="w${i + 1}" data-flags="${flags}"${overall.has(w.episode.id) ? "" : " hidden"}>
        <h2>${i + 1}. ${esc(w.episode.title || "Untitled")} <span class="muted">· score ${w.score}</span></h2>
        <p><a href="${esc(`${site}/admin/participants/${w.author.id}`)}">${esc(w.author.name)}</a> · ${esc(w.author.email)} · ${esc(b.tier)}${b.score !== null ? ` (${b.score}/10)` : ""} · ${esc(labelOf(ROLES, b.role))}${b.bestLifeScience >= 0 ? ` · ${familiarityName(b.bestLifeScience)} in ${esc(domainNames(b.bestLifeScienceAreas))}` : ""}</p>
        <p class="muted small">${w.episode.isFolder ? `Folder of ${w.sessions.length} sessions` : "One conversation"} · ${esc(w.state)} · ${w.userMessages} user messages (${num(w.userChars)} characters) · ${Math.round(w.minutes)} minutes · ${esc(w.models.join(", "))}</p>
        <p>${w.reasons.map((r) => `<span class="tag points">+${r.points} ${esc(r.why)}</span>`).join("")}</p>
        ${w.reviews.length ? `<h3>What reviewers said</h3><ul>${reviewLines}</ul>` : `<p class="muted small">Not reviewed.</p>`}
        ${transcriptOf(w)}
      </section>`;
    })
    .join("\n");

  const html = page(
    "Reading list",
    `<h1>Reading list</h1>
    <p class="muted">Made ${esc(bostonTime(made))} Boston time · for organizers only: this page has names, email addresses and conversations.</p>
    <p>The pieces of work, of ${works.length}, with the most reasons to be read by someone who knows the subject. Nothing here has read the text: the score is from who wrote it, how much they wrote, and what reviewers and the author said about it. Each reason is shown with its points, and the number before a title is its place among all the work. Every piece of work, with its score, is in <code>reading-list.csv</code>, which has columns for your own notes.</p>
    <div class="filters" role="group" aria-label="Show">
      <span class="muted">Show</span>
      <button data-show="overall" aria-pressed="true">Highest scores (${overall.size})</button>
      <button data-show="strong" aria-pressed="false">By authors with a strong background (${strongTop.size})</button>
    </div>
    <p class="muted small">Assistant replies are folded after ${REPLY_SHOWN} characters. Open a session to read it.</p>
    ${cards}
    <script>
      const buttons = document.querySelectorAll(".filters button");
      buttons.forEach((button) => button.addEventListener("click", () => {
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
        document.querySelectorAll("[data-flags]").forEach((el) => {
          el.hidden = !el.dataset.flags.split(" ").includes(button.dataset.show);
        });
      }));
    </script>`,
  );
  return { text, html };
}

/* ---- Labels used by the report --------------------------------------- */

export const names = {
  role: (v: string) => labelOf(ROLES, v),
  aiUse: (v: string) => labelOf(AI_USE, v),
  focus: (v: string) => labelOf(FOCUS_TAGS, v),
  band: (v: string) => labelOf(EXPERIENCE_BANDS, v),
  domain: domainLabel,
  verdict: (v: string) => labelOf(VERDICTS, v),
  confidence: (v: string) => labelOf(CONFIDENCE, v),
  scenario: (v: string) => labelOf(SCENARIOS, v),
  expected: (v: string) => labelOf(EXPECT_REFERRAL, v),
  authorRole: (v: string) => labelOf(AUTHOR_ROLES, v),
  taskKind: (v: string) => labelOf(TASK_KINDS, v),
  intent: comparisonIntentLabel,
  match: (v: string) => labelOf(MATCH, v),
  scope: (v: string) => labelOf(SCOPE_SIMILARITY, v),
  difference: (v: string) => labelOf(MAIN_DIFFERENCE, v),
};

export { duration, type Person };
