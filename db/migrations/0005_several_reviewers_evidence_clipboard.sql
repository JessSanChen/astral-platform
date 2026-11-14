CREATE TABLE "clipboard_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"surface" text NOT NULL,
	"turn" integer,
	"role" text,
	"char_count" integer NOT NULL,
	"content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "review_conversation_uq";--> statement-breakpoint
DROP INDEX "review_claim_active_uq";--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "max_reviews_per_transcript" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "role_other" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "highest_degree_other" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "primary_background_other" text;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "subdomains_other" text;--> statement-breakpoint
ALTER TABLE "review_claim" ADD COLUMN "slot" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "transcript_labels" ADD COLUMN "domain_other" text;--> statement-breakpoint
ALTER TABLE "transcript_labels" ADD COLUMN "evidence_turns" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clipboard_event" ADD CONSTRAINT "clipboard_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clipboard_event" ADD CONSTRAINT "clipboard_event_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clipboard_event_conversation_idx" ON "clipboard_event" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "clipboard_event_user_idx" ON "clipboard_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_conversation_reviewer_uq" ON "review" USING btree ("conversation_id","reviewer_id");--> statement-breakpoint
CREATE INDEX "review_conversation_idx" ON "review" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_claim_slot_uq" ON "review_claim" USING btree ("conversation_id","slot") WHERE state <> 'released';--> statement-breakpoint
CREATE UNIQUE INDEX "review_claim_reviewer_uq" ON "review_claim" USING btree ("conversation_id","reviewer_id") WHERE state <> 'released';