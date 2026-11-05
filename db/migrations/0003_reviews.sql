CREATE TYPE "public"."review_claim_state" AS ENUM('claimed', 'reviewed', 'released');--> statement-breakpoint
CREATE TYPE "public"."reviewer_actor" AS ENUM('academic_researcher', 'industry_scientist', 'student', 'clinician', 'biosecurity_professional', 'curious_public', 'regulatory_evader', 'lone_malicious_actor', 'organised_group', 'nation_state', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."reviewer_intent" AS ENUM('benign', 'dual_use', 'adversarial', 'unclear');--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"reviewed_version" integer,
	"intent" "reviewer_intent" NOT NULL,
	"misuse_present" boolean NOT NULL,
	"actor" "reviewer_actor" NOT NULL,
	"goal_text" text NOT NULL,
	"confidence" integer NOT NULL,
	"notes" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"submission_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_claim" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"state" "review_claim_state" DEFAULT 'claimed' NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "review_batch_size" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claim" ADD CONSTRAINT "review_claim_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_claim" ADD CONSTRAINT "review_claim_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_conversation_uq" ON "review" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "review_reviewer_idx" ON "review" USING btree ("reviewer_id","updated_at");--> statement-breakpoint
CREATE INDEX "review_claim_reviewer_idx" ON "review_claim" USING btree ("reviewer_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "review_claim_active_uq" ON "review_claim" USING btree ("conversation_id") WHERE state <> 'released';--> statement-breakpoint
CREATE INDEX "conversation_status_idx" ON "conversation" USING btree ("status","last_submitted_at");