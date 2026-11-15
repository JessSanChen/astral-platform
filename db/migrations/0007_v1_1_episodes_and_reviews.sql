CREATE TABLE "episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Conversation' NOT NULL,
	"is_folder" boolean DEFAULT false NOT NULL,
	"model_id" text NOT NULL,
	"task_provenance" text,
	"provenance_changed_at" timestamp,
	"activity_template" text,
	"goal_text" text,
	"goal_updated_at" timestamp,
	"creation_method" text DEFAULT 'original_live' NOT NULL,
	"source_family_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"review_level" text,
	"eligible_domains" text[] DEFAULT '{}' NOT NULL,
	"assignment_state" text DEFAULT 'pending' NOT NULL,
	"prize_entry_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episode_goal_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"goal_text" text,
	"after_work_began" boolean NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pair_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"related_version_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"topic_task_match" text NOT NULL,
	"sensitivity_match" text NOT NULL,
	"intended_change_realized" text NOT NULL,
	"unintended_differences" text[] DEFAULT '{}' NOT NULL,
	"unintended_other" text,
	"comparison_type" text NOT NULL,
	"audit_note" text,
	"form_version" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "related_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_episode_id" uuid NOT NULL,
	"target_episode_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"comparison_intent" text NOT NULL,
	"intended_difference" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewer_id" text NOT NULL,
	"purpose" text NOT NULL,
	"view_id" uuid,
	"related_version_id" uuid,
	"family_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"slot" integer DEFAULT 1 NOT NULL,
	"routing" jsonb,
	"skip_reason" text,
	"skip_note" text,
	"reserved_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "review_policy" (
	"version" integer PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_response" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"view_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"verdict" text NOT NULL,
	"policy_basis" text NOT NULL,
	"confidence" text NOT NULL,
	"evidence_mode" text NOT NULL,
	"evidence_turns" integer[] DEFAULT '{}' NOT NULL,
	"rationale" text NOT NULL,
	"uncertainty_reasons" text[] DEFAULT '{}' NOT NULL,
	"uncertainty_other" text,
	"subject_sensitivity" text NOT NULL,
	"aim_evidence" text NOT NULL,
	"policy_version" integer NOT NULL,
	"form_version" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_view" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"conversation_id" uuid,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "affiliation" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "highest_degree" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "years_experience" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "primary_background" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "ai_familiarity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "episode_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "session_order" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "reviews_per_view" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "auto_release_submissions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "review_reservation_minutes" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "comparison_activity_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "intake" jsonb;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "intake_version" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "participation_agreed_at" timestamp;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "research_use_agreed_at" timestamp;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "public_release_permission" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "policy_ready_version" integer;--> statement-breakpoint
ALTER TABLE "episode" ADD CONSTRAINT "episode_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_goal_revision" ADD CONSTRAINT "episode_goal_revision_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_audit" ADD CONSTRAINT "pair_audit_assignment_id_review_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_audit" ADD CONSTRAINT "pair_audit_related_version_id_related_version_id_fk" FOREIGN KEY ("related_version_id") REFERENCES "public"."related_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_audit" ADD CONSTRAINT "pair_audit_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_version" ADD CONSTRAINT "related_version_source_episode_id_episode_id_fk" FOREIGN KEY ("source_episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_version" ADD CONSTRAINT "related_version_target_episode_id_episode_id_fk" FOREIGN KEY ("target_episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_version" ADD CONSTRAINT "related_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_view_id_review_view_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."review_view"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_related_version_id_related_version_id_fk" FOREIGN KEY ("related_version_id") REFERENCES "public"."related_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_assignment_id_review_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_view_id_review_view_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."review_view"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_view" ADD CONSTRAINT "review_view_episode_id_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episode"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_user_idx" ON "episode" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "episode_family_idx" ON "episode" USING btree ("source_family_id");--> statement-breakpoint
CREATE INDEX "episode_state_idx" ON "episode" USING btree ("status","assignment_state");--> statement-breakpoint
CREATE INDEX "episode_goal_revision_idx" ON "episode_goal_revision" USING btree ("episode_id","saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pair_audit_assignment_uq" ON "pair_audit" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "related_version_target_uq" ON "related_version" USING btree ("target_episode_id");--> statement-breakpoint
CREATE INDEX "related_version_source_idx" ON "related_version" USING btree ("source_episode_id");--> statement-breakpoint
CREATE INDEX "review_assignment_view_idx" ON "review_assignment" USING btree ("view_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignment_one_active_uq" ON "review_assignment" USING btree ("reviewer_id") WHERE state = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignment_family_uq" ON "review_assignment" USING btree ("reviewer_id","family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignment_slot_uq" ON "review_assignment" USING btree ("view_id","slot") WHERE state in ('active', 'completed') and purpose = 'primary';--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignment_pair_uq" ON "review_assignment" USING btree ("related_version_id") WHERE state in ('active', 'completed') and purpose = 'pair_audit';--> statement-breakpoint
CREATE UNIQUE INDEX "review_response_assignment_uq" ON "review_response" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "review_response_view_idx" ON "review_response" USING btree ("view_id");--> statement-breakpoint
CREATE INDEX "review_view_episode_idx" ON "review_view" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "review_view_family_idx" ON "review_view" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "conversation_episode_idx" ON "conversation" USING btree ("episode_id","session_order");--> statement-breakpoint
-- Written by hand, below the generated statements.
--
-- Every conversation that already exists becomes an episode of its own,
-- holding that one session. The episode takes the conversation's id, so
-- nothing needs looking up to connect them, and is the first member of
-- its own family.
INSERT INTO "episode" ("id", "user_id", "title", "model_id", "source_family_id", "status", "submitted_at", "created_at", "updated_at")
SELECT c."id", c."user_id", c."title", c."model_id", c."id", c."status", c."last_submitted_at", c."created_at", c."updated_at"
FROM "conversation" c
WHERE c."episode_id" IS NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "conversation" SET "episode_id" = "id" WHERE "episode_id" IS NULL;--> statement-breakpoint
-- The questions asked on joining have been replaced (specification v1.1,
-- form A), including what people agree to. Everyone answers the new ones
-- the next time they open the site. Nothing they answered before is
-- removed.
UPDATE "user" SET "profile_completed_at" = NULL, "terms_accepted_at" = NULL, "terms_version" = NULL;
