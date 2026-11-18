/**
 * Reads an export file (Organize → Settings → "Download everything") into
 * memory, keeping what the analysis uses and dropping the bulk it does not:
 * the provider's raw requests and responses, and the frozen copies of
 * submissions.
 *
 * The file is read a line at a time, so its size is not a problem; a line
 * is one record, and each record says what it is in its `record` field.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type IntakeAnswers = {
  role?: string;
  roleOther?: string;
  work?: Record<string, string>;
  aiUse?: string;
  focusTags?: string[];
  familiarity?: Record<string, string>;
  backgroundDomains?: string[];
  backgroundResponse?: string;
  otherDomainText?: string;
};

export type Person = {
  id: string;
  /** P001, P002 ... in the order accounts were made. Used wherever a name must not appear. */
  pid: string;
  name: string;
  email: string;
  isOrganizer: boolean;
  isTester: boolean;
  createdAt: Date;
  intake: IntakeAnswers | null;
  intakeCompleted: boolean;
  passedInstructionCheck: boolean;
  publicRelease: string;
  /** Why this account's work is left out of the analysis; empty when it is kept. */
  leftOut: string;
};

export type Message = {
  turn: number | null;
  role: string;
  content: string;
  modelId: string | null;
  finishReason: string | null;
  failed: boolean;
  at: Date;
  inSubmitted: boolean;
  superseded: boolean;
};

export type Clip = { by: string; kind: string; surface: string; role: string | null; chars: number };

export type Session = {
  id: string;
  episodeId: string;
  order: number;
  userId: string;
  status: string;
  title: string;
  modelId: string | null;
  labels: Record<string, unknown> | null;
  createdAt: Date;
  submittedAt: Date | null;
  messages: Message[];
  clips: Clip[];
  scannerVerdicts: string[];
};

export type Episode = {
  id: string;
  userId: string;
  title: string;
  isFolder: boolean;
  status: string;
  submittedAt: Date | null;
  labels: Record<string, unknown> | null;
  creationMethod: string;
  familyId: string;
  assignmentState: string;
  createdAt: Date;
};

export type Turn = { n: number; role: string; content: string; session: string | null; failed?: boolean };

export type View = {
  id: string;
  episodeId: string;
  kind: string;
  sessionId: string | null;
  turns: Turn[];
  sessionLetters: string[];
};

export type Assignment = {
  id: string;
  reviewerId: string;
  purpose: string;
  viewId: string | null;
  relatedVersionId: string | null;
  state: string;
  skipReason: string | null;
  reservedAt: Date;
  finishedAt: Date | null;
};

export type ReviewResponse = {
  id: string;
  assignmentId: string;
  viewId: string;
  reviewerId: string;
  verdict: string;
  confidence: string;
  evidenceMode: string;
  evidenceTurns: number[];
  rationale: string;
  uncertaintyReasons: string[];
  subjectSensitivity: string;
  aimEvidence: string;
  formVersion: string;
  instructionVersion: number;
  submittedAt: Date;
  revisionCount: number;
};

export type PairAudit = {
  id: string;
  assignmentId: string;
  relatedVersionId: string;
  reviewerId: string;
  topicTaskMatch: string;
  scopeSimilarity: string | null;
  mainDifference: string | null;
  note: string;
  formVersion: string;
  submittedAt: Date;
  revisionCount: number;
};

export type Revision = {
  assignmentId: string;
  purpose: string;
  version: number;
  previous: Record<string, unknown>;
};

export type Related = {
  id: string;
  sourceEpisodeId: string;
  targetEpisodeId: string;
  sourceSessionId: string | null;
  targetSessionId: string | null;
  intent: string;
  intendedDifference: string;
  createdBy: string;
};

export type Nomination = { userId: string; track: string; headline: string; submittedAt: Date };

export type Dataset = {
  file: string;
  /** False when the file has no closing line: the download was cut short. */
  complete: boolean;
  /** How many of each record the export says it wrote. */
  declared: Record<string, number>;
  /** How many of each record were read. */
  read: Record<string, number>;
  people: Map<string, Person>;
  episodes: Map<string, Episode>;
  sessions: Map<string, Session>;
  views: Map<string, View>;
  assignments: Map<string, Assignment>;
  responses: ReviewResponse[];
  pairAudits: PairAudit[];
  revisions: Revision[];
  related: Related[];
  nominations: Nomination[];
  /** Tokens and cost of chat requests, by account. */
  usage: Map<string, { tokens: number; cost: number }>;
};

type Line = Record<string, unknown> & { record?: string };

const text = (v: unknown) => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const number = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const date = (v: unknown) => new Date(typeof v === "string" || typeof v === "number" ? v : 0);
const dateOrNull = (v: unknown) => (typeof v === "string" && v ? new Date(v) : null);
const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const object = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export async function loadExport(file: string): Promise<Dataset> {
  const data: Dataset = {
    file,
    complete: false,
    declared: {},
    read: {},
    people: new Map(),
    episodes: new Map(),
    sessions: new Map(),
    views: new Map(),
    assignments: new Map(),
    responses: [],
    pairAudits: [],
    revisions: [],
    related: [],
    nominations: [],
    usage: new Map(),
  };

  const lines = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const raw of lines) {
    lineNumber++;
    if (!raw.trim()) continue;
    let r: Line;
    try {
      r = JSON.parse(raw) as Line;
    } catch {
      throw new Error(
        `Line ${lineNumber} of ${file} is not a complete record. The download was probably cut short: download the export again.`,
      );
    }
    const kind = text(r.record);
    if (kind !== "end") data.read[kind] = (data.read[kind] ?? 0) + 1;

    switch (kind) {
      case "participant_intake": {
        const id = text(r.user_id);
        data.people.set(id, {
          id,
          pid: "",
          name: text(r.name),
          email: text(r.email),
          isOrganizer: r.is_organizer === true,
          isTester: r.is_tester === true,
          createdAt: date(r.created_at),
          intake: object(r.intake) as IntakeAnswers | null,
          intakeCompleted: Boolean(r.intake_completed_at),
          passedInstructionCheck: number(r.policy_ready_version) > 0,
          publicRelease: r.public_release_permission == null ? "" : String(r.public_release_permission),
          leftOut: "",
        });
        break;
      }
      case "episode": {
        const id = text(r.episode_id);
        data.episodes.set(id, {
          id,
          userId: text(r.user_id),
          title: text(r.title),
          isFolder: r.is_folder === true,
          status: text(r.status),
          submittedAt: dateOrNull(r.submitted_at),
          labels: object(r.author_labels),
          creationMethod: text(r.creation_method),
          familyId: text(r.source_family_id),
          assignmentState: text(r.assignment_state),
          createdAt: date(r.created_at),
        });
        break;
      }
      case "session": {
        const id = text(r.session_id);
        data.sessions.set(id, {
          id,
          episodeId: text(r.episode_id),
          order: number(r.session_order) || 1,
          userId: text(r.user_id),
          status: text(r.status),
          title: text(r.title),
          modelId: textOrNull(r.model_id),
          labels: object(r.author_labels),
          createdAt: date(r.created_at),
          submittedAt: dateOrNull(r.submitted_at),
          messages: list<Record<string, unknown>>(r.messages).map((m) => ({
            turn: typeof m.turn === "number" ? m.turn : null,
            role: text(m.role),
            content: text(m.content),
            modelId: textOrNull(m.model_id),
            finishReason: textOrNull(m.finish_reason),
            failed: Boolean(m.error),
            at: date(m.created_at),
            inSubmitted: m.in_submitted_version === true,
            superseded: m.superseded === true,
          })),
          clips: list<Record<string, unknown>>(r.clipboard_events).map((c) => ({
            by: text(c.by),
            kind: text(c.kind),
            surface: text(c.surface),
            role: textOrNull(c.role),
            chars: number(c.char_count),
          })),
          scannerVerdicts: list<Record<string, unknown>>(r.scanner_runs)
            .map((j) => text(j.verdict))
            .filter(Boolean),
        });
        break;
      }
      case "review_view": {
        const id = text(r.view_id);
        const content = object(r.content) ?? {};
        data.views.set(id, {
          id,
          episodeId: text(r.episode_id),
          kind: text(r.kind),
          sessionId: textOrNull(r.session_id),
          turns: list<Record<string, unknown>>(content.turns).map((t) => ({
            n: number(t.n),
            role: text(t.role),
            content: text(t.content),
            session: textOrNull(t.session),
            failed: t.failed === true,
          })),
          sessionLetters: list<string>(content.sessions),
        });
        break;
      }
      case "review_assignment": {
        const id = text(r.assignment_id);
        data.assignments.set(id, {
          id,
          reviewerId: text(r.reviewer_id),
          purpose: text(r.purpose),
          viewId: textOrNull(r.view_id),
          relatedVersionId: textOrNull(r.related_version_id),
          state: text(r.state),
          skipReason: textOrNull(r.skip_reason),
          reservedAt: date(r.reserved_at),
          finishedAt: dateOrNull(r.finished_at),
        });
        break;
      }
      case "review_response":
        data.responses.push({
          id: text(r.id),
          assignmentId: text(r.assignment_id),
          viewId: text(r.view_id),
          reviewerId: text(r.reviewer_id),
          verdict: text(r.verdict),
          confidence: text(r.confidence),
          evidenceMode: text(r.evidence_mode),
          evidenceTurns: list<number>(r.evidence_turns),
          rationale: text(r.rationale),
          uncertaintyReasons: list<string>(r.uncertainty_reasons),
          subjectSensitivity: text(r.subject_sensitivity),
          aimEvidence: text(r.aim_evidence),
          formVersion: text(r.form_version),
          instructionVersion: number(r.review_instruction_version ?? r.policy_version),
          submittedAt: date(r.submitted_at),
          revisionCount: number(r.revision_count),
        });
        break;
      case "pair_audit":
        data.pairAudits.push({
          id: text(r.id),
          assignmentId: text(r.assignment_id),
          relatedVersionId: text(r.related_version_id),
          reviewerId: text(r.reviewer_id),
          topicTaskMatch: text(r.topic_task_match),
          scopeSimilarity: textOrNull(r.scope_similarity),
          mainDifference: textOrNull(r.main_difference),
          note: text(r.audit_note),
          formVersion: text(r.form_version),
          submittedAt: date(r.submitted_at),
          revisionCount: number(r.revision_count),
        });
        break;
      case "review_revision":
        data.revisions.push({
          assignmentId: text(r.assignment_id),
          purpose: text(r.purpose),
          version: number(r.version),
          previous: object(r.previous) ?? {},
        });
        break;
      case "related_version":
        data.related.push({
          id: text(r.id),
          sourceEpisodeId: text(r.source_episode_id),
          targetEpisodeId: text(r.target_episode_id),
          sourceSessionId: textOrNull(r.source_conversation_id),
          targetSessionId: textOrNull(r.target_conversation_id),
          intent: text(r.comparison_intent),
          intendedDifference: text(r.intended_difference),
          createdBy: text(r.created_by),
        });
        break;
      case "nomination":
        data.nominations.push({
          userId: text(r.user_id),
          track: text(r.track),
          headline: text(r.headline),
          submittedAt: date(r.submitted_at),
        });
        break;
      case "usage_event": {
        const id = text(r.user_id);
        const sofar = data.usage.get(id) ?? { tokens: 0, cost: 0 };
        sofar.tokens += number(r.prompt_tokens) + number(r.completion_tokens);
        sofar.cost += number(r.cost_usd);
        data.usage.set(id, sofar);
        break;
      }
      case "end":
        data.complete = true;
        data.declared = (object(r.counts) ?? {}) as Record<string, number>;
        break;
      default:
        // Records the analysis does not use: the review instructions, goal
        // notes, organizers' actions, loose clipboard events, and what was
        // collected with the forms from before v1.1.
        break;
    }
  }

  // P-numbers in the order accounts were made, so they are the same every
  // time the same export is read.
  [...data.people.values()]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .forEach((p, i) => {
      p.pid = `P${String(i + 1).padStart(3, "0")}`;
    });

  return data;
}
