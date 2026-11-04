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
    .default(3_000_000),
  defaultJudgeRunsPerHour: integer("default_judge_runs_per_hour")
    .notNull()
    .default(20),
  chatRequestsPerMinute: integer("chat_requests_per_minute")
    .notNull()
    .default(10),
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
    scenario: text("scenario"),
    status: conversationStatus("status").notNull().default("draft"),
    currentVersion: integer("current_version").notNull().default(0),
    firstSubmittedAt: timestamp("first_submitted_at"),
    lastSubmittedAt: timestamp("last_submitted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at"),
  },
  (t) => [index("conversation_user_idx").on(t.userId, t.createdAt)],
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
