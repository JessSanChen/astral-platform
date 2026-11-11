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

export const nominationTrack = pgEnum("nomination_track", [
  "adversarial",
  "dual_use",
  "collaborative",
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
export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  affiliation: text("affiliation").notNull(),
  role: text("role").notNull(),
  highestDegree: text("highest_degree").notNull(),
  yearsExperience: text("years_experience").notNull(),
  primaryBackground: text("primary_background").notNull(),
  subdomains: text("subdomains").array().notNull().default([]),
  aiFamiliarity: text("ai_familiarity").notNull(),
  expertiseNote: text("expertise_note"),
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
  },
  (t) => [
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
 * Reviewers work through a small batch at a time, and a transcript in
 * someone's batch is off limits to everyone else, so two people never label
 * the same conversation. Abandoned claims are released back to the pool when
 * the reviewer asks for a fresh batch.
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
    claimedAt: timestamp("claimed_at").notNull().defaultNow(),
    releasedAt: timestamp("released_at"),
  },
  (t) => [
    index("review_claim_reviewer_idx").on(t.reviewerId, t.state),
    // At most one live claim per conversation. Enforced by the database
    // rather than by careful code, because two reviewers asking for a batch
    // at the same moment is exactly the case that careful code gets wrong.
    uniqueIndex("review_claim_active_uq")
      .on(t.conversationId)
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
    uniqueIndex("review_conversation_uq").on(t.conversationId),
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
