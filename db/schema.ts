import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
  doublePrecision,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Better Auth core tables.
 * These column names and types are what Better Auth expects. The admin
 * plugin adds `role`, `banned`, `banReason`, `banExpires` to `user`.
 * We add our own application columns to `user` as well.
 * ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Better Auth admin plugin fields.
  role: text("role"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),

  // Astral application fields.
  isPaused: boolean("is_paused").notNull().default(false),
  dailyTokenBudget: bigint("daily_token_budget", { mode: "number" }),
  judgeRunsPerHour: integer("judge_runs_per_hour"),
  termsVersion: integer("terms_version"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  profileCompletedAt: timestamp("profile_completed_at"),

  // Set when the password has to be replaced before anything else can be
  // done: an organizer set a temporary one, or the one just used to sign in
  // would no longer be accepted (too short for the account's role, or too
  // easy to guess).
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  // Wrong passwords in a row, and until when sign-in is refused because of
  // them. Counted per account because everyone at the event shares one
  // network address, so a limit by address cannot tell a guesser from the
  // room.
  failedSignIns: integer("failed_sign_ins").notNull().default(0),
  lockedUntil: timestamp("locked_until"),

  // The version of the review policy whose instruction check this person
  // has passed. Reviewing needs it to match the policy in force.
  policyReadyVersion: integer("policy_ready_version"),
});

/**
 * Accounts whose work is test data: organizers and anyone trying the
 * platform before the event. Their work is kept, labelled in the export,
 * left out of the console's counts, and never given to a real participant
 * to review (testers review each other's).
 *
 * A table of its own, not a column on the account: signing in and every
 * page read the account, and none of that should depend on this.
 */
export const testerAccount = pgTable("tester_account", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  markedAt: timestamp("marked_at").notNull().defaultNow(),
  // The organizer who marked them.
  markedBy: text("marked_by"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  impersonatedBy: text("impersonated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Astral domain tables.
 * ------------------------------------------------------------------ */

export const transcriptType = pgEnum("transcript_type", [
  "benign",
  "dual_use",
  "adversarial",
]);

export const modelBehaviour = pgEnum("model_behaviour", [
  "fully_complied",
  "partially_complied",
  "refused",
  "deflected",
]);

export const conversationStatus = pgEnum("conversation_status", [
  "draft",
  "submitted",
]);

export const messageRole = pgEnum("message_role", ["user", "assistant"]);

export const judgeKind = pgEnum("judge_kind", ["llm", "llama_guard"]);

export const usageKind = pgEnum("usage_kind", ["chat", "judge"]);

export const reviewClaimState = pgEnum("review_claim_state", [
  "claimed",
  "reviewed",
  "released",
]);

export const reviewerIntent = pgEnum("reviewer_intent", [
  "benign",
  "dual_use",
  "adversarial",
  "unclear",
]);

// The first three are tracks that no longer exist. The database goes on
// accepting them because entries were made in them; nothing offers them.
export const nominationTrack = pgEnum("nomination_track", [
  "adversarial",
  "dual_use",
  "collaborative",
  "ai_risk_finding",
  "comparative",
  "multi_session",
]);

export const reviewerActor = pgEnum("reviewer_actor", [
  "academic_researcher",
  "industry_scientist",
  "student",
  "clinician",
  "biosecurity_professional",
  "curious_public",
  "regulatory_evader",
  "lone_malicious_actor",
  "organised_group",
  "nation_state",
  "unclear",
]);

// Participant profile. One row per user.
//
// The columns from `affiliation` to `subdomainsOther` are the questions asked
// before the v1.1 specification. They are no longer asked and are kept, now
// optional, for the profiles that were made with them. What is asked now is
// in `intake`, one JSON value described by lib/intake.ts, with the version
// of the form that produced it.
export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  affiliation: text("affiliation"),
  role: text("role"),
  highestDegree: text("highest_degree"),
  yearsExperience: text("years_experience"),
  primaryBackground: text("primary_background"),
  subdomains: text("subdomains").array().notNull().default([]),
  aiFamiliarity: text("ai_familiarity"),
  expertiseNote: text("expertise_note"),
  roleOther: text("role_other"),
  highestDegreeOther: text("highest_degree_other"),
  primaryBackgroundOther: text("primary_background_other"),
  subdomainsOther: text("subdomains_other"),

  intake: jsonb("intake"),
  intakeVersion: text("intake_version"),
  // A01. Agreement to take part and to restricted research use are both
  // required, so they are recorded as the moment they were given. Public
  // release is a separate, optional yes or no; null means not answered,
  // which is treated as no.
  participationAgreedAt: timestamp("participation_agreed_at"),
  researchUseAgreedAt: timestamp("research_use_agreed_at"),
  publicReleasePermission: text("public_release_permission"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Terms and conditions versions. Acceptance is recorded on the user row.
export const termsVersion = pgTable("terms_version", {
  version: integer("version").primaryKey(),
  body: text("body").notNull(),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
});

// Singleton settings row (id is always 1).
export const eventSettings = pgTable("event_settings", {
  id: integer("id").primaryKey().default(1),
  eventCode: text("event_code").notNull(),
  defaultDailyTokenBudget: bigint("default_daily_token_budget", {
    mode: "number",
  })
    .notNull()
    .default(5_000_000),
  defaultJudgeRunsPerHour: integer("default_judge_runs_per_hour")
    .notNull()
    .default(40),
  chatRequestsPerMinute: integer("chat_requests_per_minute")
    .notNull()
    .default(20),
  // How many transcripts a reviewer gets at once. Five to start; changed
  // here rather than in code so it can be tuned on the day.
  reviewBatchSize: integer("review_batch_size").notNull().default(5),
  // How many different people may review the same transcript. More than
  // one lets the reviews be compared with each other, at the cost of fewer
  // transcripts being reviewed at all.
  maxReviewsPerTranscript: integer("max_reviews_per_transcript")
    .notNull()
    .default(2),
  // v1.1. How many completed primary reviews each view is aiming for.
  reviewsPerView: integer("reviews_per_view").notNull().default(3),
  // Whether a new submission can be reviewed straight away by anyone, as a
  // General item, or waits for an organizer to say who is able to review
  // it. On by default: restricting who may review something is the
  // exception, done per submission from the console.
  autoReleaseSubmissions: boolean("auto_release_submissions").notNull().default(true),
  // How long a reviewer may sit on an item before someone else can be
  // given it.
  reviewReservationMinutes: integer("review_reservation_minutes").notNull().default(45),
  // Whether participants can create related versions and enter prizes yet.
  comparisonActivityOpen: boolean("comparison_activity_open").notNull().default(true),
  // Nominations close at this time, or at once when the flag is set. Both
  // exist because an organizer may need to close early, or extend.
  nominationsCloseAt: timestamp("nominations_close_at"),
  nominationsLocked: boolean("nominations_locked").notNull().default(false),
  chatPaused: boolean("chat_paused").notNull().default(false),
  allowModelFallback: boolean("allow_model_fallback").notNull().default(false),
  // [{ id, displayName, family, sort, enabled }]
  enabledModels: jsonb("enabled_models").notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversation = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    modelId: text("model_id").notNull(),
    // No longer set. Participants could once write a "scenario" here, which
    // was sent to the model as its system prompt. The name invited people to
    // describe their own role-play or intent, not realising the model would
    // read it, and so shape the conversation they were trying to observe.
    // Every conversation now starts from the model's default behaviour. The
    // column stays because conversations that had one were had with it, and
    // the record of them is not complete without it.
    scenario: text("scenario"),
    status: conversationStatus("status").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    firstSubmittedAt: timestamp("first_submitted_at"),
    lastSubmittedAt: timestamp("last_submitted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at"),
    // Set once another participant has reviewed this transcript. From then on
    // the author cannot change it, because a review describes a conversation
    // as it stood when it was read.
    lockedAt: timestamp("locked_at"),
    // v1.1. The episode (a standalone conversation, or a folder of them)
    // this session belongs to, and its place in it. Null only for
    // conversations older than episodes that the migration could not place.
    episodeId: uuid("episode_id"),
    // What the author says about this one session: the same questions as
    // for a conversation that stands alone. For a session in a folder they
    // start from the folder's answers and can differ from them. For a
    // conversation that stands alone they are a copy of the answers kept
    // on its episode, brought up to date with every change, so every
    // session reads the same way in the export. See lib/author-labels.ts.
    authorLabels: jsonb("author_labels"),
    authorLabelsVersion: text("author_labels_version"),
    authorLabelsUpdatedAt: timestamp("author_labels_updated_at"),
    // For a session in a folder: when its real-or-invented answer was
    // last changed. A conversation that stands alone keeps this on its
    // episode (provenance_changed_at).
    provenanceChangedAt: timestamp("provenance_changed_at"),
    sessionOrder: integer("session_order").notNull().default(1),
  },
  (t) => [
    index("conversation_episode_idx").on(t.episodeId, t.sessionOrder),
    index("conversation_user_idx").on(t.userId, t.createdAt),
    index("conversation_status_idx").on(t.status, t.lastSubmittedAt),
  ],
);

export const message = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    role: messageRole("role").notNull(),
    content: text("content").notNull().default(""),
    parts: jsonb("parts"),

    // Assistant-message provenance from OpenRouter.
    modelId: text("model_id"),
    provider: text("provider"),
    generationId: text("generation_id"),
    finishReason: text("finish_reason"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    costUsd: doublePrecision("cost_usd"),
    latencyMs: integer("latency_ms"),

    rawRequest: jsonb("raw_request"),
    rawResponse: jsonb("raw_response"),
    error: jsonb("error"),

    // Regenerated assistant messages point to their replacement.
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_conversation_idx").on(t.conversationId, t.seq),
    uniqueIndex("message_conversation_seq_uq").on(t.conversationId, t.seq),
  ],
);

export const transcriptLabels = pgTable("transcript_labels", {
  conversationId: uuid("conversation_id")
    .primaryKey()
    .references(() => conversation.id, { onDelete: "cascade" }),
  type: transcriptType("type"),
  rolePreset: text("role_preset"),
  roleText: text("role_text"),
  goalText: text("goal_text"),
  modelBehaviour: modelBehaviour("model_behaviour"),
  domainTags: text("domain_tags").array().notNull().default([]),
  // What the author meant by the "Other" topic.
  domainOther: text("domain_other"),
  // The turns the author points to as showing what their labels say, as the
  // numbers shown beside each message: 1 is the first message. A submission
  // also marks the messages themselves, so the numbers never have to be
  // matched up again afterwards.
  evidenceTurns: integer("evidence_turns").array().notNull().default([]),
  // No longer set. A single "where did it turn" message, replaced by
  // evidenceTurns. Kept for the labels that were made with it.
  keyTurnMessageId: uuid("key_turn_message_id"),
  // Participant disagreement flag, e.g. "refusal was wrong" / "compliance was dangerous".
  challengeFlag: text("challenge_flag"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const submission = pgTable(
  "submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("submission_conversation_version_uq").on(
      t.conversationId,
      t.version,
    ),
  ],
);

export const judgeConfig = pgTable("judge_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: judgeKind("kind").notNull(),
  modelId: text("model_id").notNull(),
  promptTemplate: text("prompt_template"),
  outputSchema: jsonb("output_schema"),
  enabled: boolean("enabled").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const judgeRun = pgTable(
  "judge_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    judgeConfigId: uuid("judge_config_id")
      .notNull()
      .references(() => judgeConfig.id),
    inputHash: text("input_hash"),
    // How many turns the conversation held when this was run, so a result
    // can say which point in the conversation it judged.
    turnCount: integer("turn_count"),
    rawOutput: text("raw_output"),
    parsed: jsonb("parsed"),
    verdict: text("verdict"),
    status: text("status").notNull().default("ok"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("judge_run_user_idx").on(t.userId, t.createdAt)],
);

export const usageEvent = pgTable(
  "usage_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id"),
    messageId: uuid("message_id"),
    kind: usageKind("kind").notNull(),
    modelId: text("model_id"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("usage_event_user_time_idx").on(t.userId, t.createdAt)],
);

/**
 * A transcript handed to one reviewer.
 *
 * Reviewers work through a small batch at a time. A transcript can be held
 * or reviewed by a limited number of people (event_settings
 * .maxReviewsPerTranscript), and never twice by the same person. Abandoned
 * claims are released back to the pool when the reviewer asks for a fresh
 * batch.
 */
export const reviewClaim = pgTable(
  "review_claim",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    state: reviewClaimState("state").notNull().default("claimed"),
    // Which of the transcript's review places this claim occupies, from 1
    // up to the limit.
    slot: integer("slot").notNull().default(1),
    claimedAt: timestamp("claimed_at").notNull().defaultNow(),
    releasedAt: timestamp("released_at"),
  },
  (t) => [
    index("review_claim_reviewer_idx").on(t.reviewerId, t.state),
    // Each place on a transcript can be held once. Enforced by the database
    // rather than by careful code, because two reviewers asking for a batch
    // at the same moment is exactly the case that careful code gets wrong:
    // both would count one reviewer so far and both would take the second
    // place. Here they both ask for place 2 and one of them is refused.
    uniqueIndex("review_claim_slot_uq")
      .on(t.conversationId, t.slot)
      .where(sql`state <> 'released'`),
    // And nobody holds the same transcript twice.
    uniqueIndex("review_claim_reviewer_uq")
      .on(t.conversationId, t.reviewerId)
      .where(sql`state <> 'released'`),
  ],
);

/** One participant's independent judgement of someone else's transcript. */
export const review = pgTable(
  "review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Which submitted version was read, so a review always refers to a known
    // state of the conversation.
    reviewedVersion: integer("reviewed_version"),
    intent: reviewerIntent("intent").notNull(),
    misusePresent: boolean("misuse_present").notNull(),
    actor: reviewerActor("actor").notNull(),
    goalText: text("goal_text").notNull(),
    confidence: integer("confidence").notNull(),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    submissionCount: integer("submission_count").notNull().default(1),
  },
  (t) => [
    // One review per reviewer per transcript. A transcript can have several
    // reviews, from different people.
    uniqueIndex("review_conversation_reviewer_uq").on(
      t.conversationId,
      t.reviewerId,
    ),
    index("review_conversation_idx").on(t.conversationId),
    index("review_reviewer_idx").on(t.reviewerId, t.updatedAt),
  ],
);

/**
 * A participant putting their own work forward for a prize track.
 *
 * One per participant per track, updated rather than duplicated, so the
 * organizers read a single current entry from each person.
 */
export const nomination = pgTable(
  "nomination",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    track: nominationTrack("track").notNull(),
    headline: text("headline").notNull(),
    details: text("details").notNull(),
    slidesUrl: text("slides_url"),
    // Free text, but the form offers participant names as you type, so
    // collaborators can be matched up afterwards without forcing an exact
    // choice on someone in a hurry.
    collaborators: text("collaborators"),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    submissionCount: integer("submission_count").notNull().default(1),
  },
  (t) => [
    uniqueIndex("nomination_user_track_uq").on(t.userId, t.track),
    index("nomination_track_idx").on(t.track, t.updatedAt),
  ],
);

/**
 * A copy, cut or paste made while working on a conversation.
 *
 * Kept because it changes how a transcript should be read: a prompt pasted
 * in whole was written somewhere else, possibly by another model, and a
 * reply copied out went somewhere. Neither is visible in the messages.
 *
 * The text is kept up to a limit; `charCount` is the full length.
 */
export const clipboardEvent = pgTable(
  "clipboard_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "cascade",
    }),
    // "copy", "cut" or "paste".
    kind: text("kind").notNull(),
    // Where on the page: "composer", "message", "labels", "review", "other".
    surface: text("surface").notNull(),
    // For a message: its number as shown beside it, and whose it was.
    turn: integer("turn"),
    role: text("role"),
    charCount: integer("char_count").notNull(),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("clipboard_event_conversation_idx").on(t.conversationId, t.createdAt),
    index("clipboard_event_user_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * What organizers did, and a few things the system did on its own account,
 * such as locking a sign-in after repeated wrong passwords.
 *
 * Organizer accounts can set passwords, promote people and download
 * everything. If one is misused, this is how anyone finds out what was done
 * with it. The names are copied in at the time, so the record still reads
 * properly after an account is deleted.
 */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    targetUserId: text("target_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    targetLabel: text("target_label"),
    detail: text("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_event_created_idx").on(t.createdAt)],
);

/* ------------------------------------------------------------------ *
 * v1.1: episodes, related versions, review views and assignments.
 *
 * Names follow the specification (docs/spec). A "session" there is a row
 * of `conversation` here; nothing was renamed, so that everything written
 * before v1.1 still reads the same.
 * ------------------------------------------------------------------ */

/**
 * One task: a standalone conversation, or a folder holding several
 * independent sessions. Submitted once, as a whole.
 */
export const episode = pgTable(
  "episode",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Conversation"),
    // Shown as a folder. A standalone conversation becomes one when a
    // second session is added.
    isFolder: boolean("is_folder").notNull().default(false),
    modelId: text("model_id").notNull(),

    // "real" or "invented". Null only for work older than the question.
    taskProvenance: text("task_provenance"),
    provenanceChangedAt: timestamp("provenance_changed_at"),
    // Which starting-point suggestion was picked, if any.
    activityTemplate: text("activity_template"),

    // An optional private note. Never sent to the model, never shown to a
    // reviewer. Every saved change is also kept in episode_goal_revision.
    goalText: text("goal_text"),
    goalUpdatedAt: timestamp("goal_updated_at"),
    // What the author says about the work: the role they took, the kind of
    // task, the scenario, and what they expect a reviewer to decide. Asked
    // before submitting, required, and never shown to a reviewer. The
    // questions and choices are in lib/author-labels.ts.
    authorLabels: jsonb("author_labels"),
    authorLabelsVersion: text("author_labels_version"),
    authorLabelsUpdatedAt: timestamp("author_labels_updated_at"),

    // "original_live", or "related_live" for one made with Create related
    // version. Every episode in a family shares sourceFamilyId; an original
    // is the first member of its own.
    creationMethod: text("creation_method").notNull().default("original_live"),
    sourceFamilyId: uuid("source_family_id").notNull(),

    status: conversationStatus("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at"),

    // Set by organizers: who is able to review it, and whether it may be
    // handed out. Nothing about the author or a scanner sets these.
    reviewLevel: text("review_level"),
    eligibleDomains: text("eligible_domains").array().notNull().default([]),
    assignmentState: text("assignment_state").notNull().default("pending"),

    // Put forward for a prize by its author.
    prizeEntryAt: timestamp("prize_entry_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("episode_user_idx").on(t.userId, t.createdAt),
    index("episode_family_idx").on(t.sourceFamilyId),
    index("episode_state_idx").on(t.status, t.assignmentState),
  ],
);

/** Every saved version of an episode's goal note, with when it was saved. */
export const episodeGoalRevision = pgTable(
  "episode_goal_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    // Set when the goal is one session's, in a folder. Empty when it is
    // the goal of the whole episode: a conversation's, or a folder's own.
    conversationId: uuid("conversation_id").references(() => conversation.id, {
      onDelete: "cascade",
    }),
    goalText: text("goal_text"),
    // Whether any message had been sent when this was saved: in the
    // session, for a session's goal; anywhere in the episode otherwise.
    // A goal written afterwards is context, not a plan made in advance.
    afterWorkBegan: boolean("after_work_began").notNull(),
    savedAt: timestamp("saved_at").notNull().defaultNow(),
  },
  (t) => [index("episode_goal_revision_idx").on(t.episodeId, t.savedAt)],
);

/**
 * A link from a submitted episode to a new one made as an alternative to
 * it. Complete once the new one is submitted too.
 */
export const relatedVersion = pgTable(
  "related_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceEpisodeId: uuid("source_episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    targetEpisodeId: uuid("target_episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    // The link itself is between two single conversations: the session
    // the related version was made from, and the conversation that was
    // started. Either may sit in a folder; the folder is not what is
    // related. The episode columns above say which pieces of work those
    // conversations belong to.
    sourceConversationId: uuid("source_conversation_id").references(() => conversation.id, {
      onDelete: "cascade",
    }),
    targetConversationId: uuid("target_conversation_id").references(() => conversation.id, {
      onDelete: "cascade",
    }),
    familyId: uuid("family_id").notNull(),
    // What the author set out to explore (lib/episode-options.ts), not a
    // finding about what they did.
    comparisonIntent: text("comparison_intent").notNull(),
    intendedDifference: text("intended_difference").notNull(),
    // Set when the author changes either answer after creating the version,
    // which they may do until it is submitted. Null means they stand as
    // first given.
    intentRevisedAt: timestamp("intent_revised_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("related_version_target_uq").on(t.targetEpisodeId),
    index("related_version_source_idx").on(t.sourceEpisodeId),
  ],
);

/**
 * Exactly what a reviewer is shown: one session, or all of a folder's
 * sessions together. Written when the episode is submitted and never
 * changed, so a judgement always refers to known text.
 */
export const reviewView = pgTable(
  "review_view",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episode.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    // "session" or "linked".
    kind: text("kind").notNull(),
    conversationId: uuid("conversation_id"),
    // { turns: [{ n, session, role, content, messageId, at, status }] }
    content: jsonb("content").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("review_view_episode_idx").on(t.episodeId),
    index("review_view_family_idx").on(t.familyId),
  ],
);

/**
 * One person given one thing to judge: a view to review, or a pair of
 * related versions to compare.
 *
 * The row is also the record that they were shown it. It is never deleted
 * when they skip or run out of time, because having seen one member of a
 * family is what rules them out of judging the others.
 */
export const reviewAssignment = pgTable(
  "review_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // "primary" or "pair_audit".
    purpose: text("purpose").notNull(),
    viewId: uuid("view_id").references(() => reviewView.id, { onDelete: "cascade" }),
    relatedVersionId: uuid("related_version_id").references(() => relatedVersion.id, {
      onDelete: "cascade",
    }),
    familyId: uuid("family_id").notNull(),
    // "active", "completed", "skipped" or "expired".
    state: text("state").notNull().default("active"),
    // Which of the view's places this holds while active or completed.
    slot: integer("slot").notNull().default(1),
    // The reviewer's self-reported familiarity at the moment of assignment,
    // and the level the item asked for.
    routing: jsonb("routing"),
    skipReason: text("skip_reason"),
    skipNote: text("skip_note"),
    reservedAt: timestamp("reserved_at").notNull().defaultNow(),
    // Kept moving while the reviewer is working, so that leaving a tab
    // open is not the same as still being there.
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    index("review_assignment_view_idx").on(t.viewId, t.state),
    // One thing of each kind at a time per person (a transcript review and
    // a comparison can both be in progress), enforced here so that two
    // tabs asking together cannot both be given something.
    uniqueIndex("review_assignment_one_active_uq")
      .on(t.reviewerId, t.purpose)
      .where(sql`state = 'active'`),
    // And one look at a family, however it ended: reviewed, compared,
    // skipped or still in progress. One that only ran out of time, with
    // nothing recorded, does not count, so it can come back to the same
    // person.
    uniqueIndex("review_assignment_family_uq")
      .on(t.reviewerId, t.familyId)
      .where(sql`state <> 'expired'`),
    // Each place on a view is held once.
    uniqueIndex("review_assignment_slot_uq")
      .on(t.viewId, t.slot)
      .where(sql`state in ('active', 'completed') and purpose = 'primary'`),
    uniqueIndex("review_assignment_pair_uq")
      .on(t.relatedVersionId)
      .where(sql`state in ('active', 'completed') and purpose = 'pair_audit'`),
  ],
);

/** Form C: one reviewer's final answer about one view. */
export const reviewResponse = pgTable(
  "review_response",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => reviewAssignment.id, { onDelete: "cascade" }),
    viewId: uuid("view_id")
      .notNull()
      .references(() => reviewView.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verdict: text("verdict").notNull(),
    policyBasis: text("policy_basis").notNull(),
    confidence: text("confidence").notNull(),
    evidenceMode: text("evidence_mode").notNull(),
    evidenceTurns: integer("evidence_turns").array().notNull().default([]),
    rationale: text("rationale").notNull(),
    uncertaintyReasons: text("uncertainty_reasons").array().notNull().default([]),
    uncertaintyOther: text("uncertainty_other"),
    subjectSensitivity: text("subject_sensitivity").notNull(),
    aimEvidence: text("aim_evidence").notNull(),
    policyVersion: integer("policy_version").notNull(),
    formVersion: text("form_version").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    // A reviewer may come back and change their answers. These columns
    // hold the answers as they now stand; every earlier version is kept
    // in review_revision. Null and zero mean never changed.
    revisedAt: timestamp("revised_at"),
    revisionCount: integer("revision_count").notNull().default(0),
  },
  (t) => [
    // A reload or a second click cannot make a second vote.
    uniqueIndex("review_response_assignment_uq").on(t.assignmentId),
    index("review_response_view_idx").on(t.viewId),
  ],
);

/** Form D: one person's judgement of how well a pair of versions match. */
export const pairAudit = pgTable(
  "pair_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => reviewAssignment.id, { onDelete: "cascade" }),
    relatedVersionId: uuid("related_version_id")
      .notNull()
      .references(() => relatedVersion.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    topicTaskMatch: text("topic_task_match").notNull(),
    // Form D-2.0: how similar the technical scope is, and what the main
    // substantive difference between the two is.
    scopeSimilarity: text("scope_similarity"),
    mainDifference: text("main_difference"),
    // Asked by forms before D-2.0 and no longer; empty on later answers.
    sensitivityMatch: text("sensitivity_match"),
    intendedChangeRealized: text("intended_change_realized"),
    unintendedDifferences: text("unintended_differences").array().notNull().default([]),
    unintendedOther: text("unintended_other"),
    comparisonType: text("comparison_type"),
    auditNote: text("audit_note"),
    formVersion: text("form_version").notNull(),
    submittedAt: timestamp("submitted_at").notNull().defaultNow(),
    // As on review_response: the answers as they now stand, with earlier
    // versions in review_revision.
    revisedAt: timestamp("revised_at"),
    revisionCount: integer("revision_count").notNull().default(0),
  },
  (t) => [uniqueIndex("pair_audit_assignment_uq").on(t.assignmentId)],
);

/**
 * An earlier version of a review or a comparison, kept when its author
 * changes their answers. `previous` is the whole row as it stood, so the
 * first, independent answer is never lost: analysis can use the first
 * version, the last, or the change between them.
 */
export const reviewRevision = pgTable(
  "review_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => reviewAssignment.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // "primary" (a transcript review) or "pair_audit" (a comparison).
    purpose: text("purpose").notNull(),
    // 1 for the first answer given, 2 for the next, and so on.
    version: integer("version").notNull(),
    previous: jsonb("previous").notNull(),
    replacedAt: timestamp("replaced_at").notNull().defaultNow(),
  },
  (t) => [index("review_revision_assignment_idx").on(t.assignmentId, t.version)],
);

/**
 * The reference policy reviewers apply, in versions like the terms. The
 * rules are the choices offered for "which criterion supports your answer".
 */
export const reviewPolicy = pgTable("review_policy", {
  version: integer("version").primaryKey(),
  body: text("body").notNull(),
  // [{ id, label, verdicts: ["yes" | "no" | "indeterminate", ...] }]
  rules: jsonb("rules").notNull().default([]),
  publishedAt: timestamp("published_at").notNull().defaultNow(),
});
