CREATE TABLE "review_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"purpose" text NOT NULL,
	"version" integer NOT NULL,
	"previous" jsonb NOT NULL,
	"replaced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "review_assignment_family_uq";--> statement-breakpoint
ALTER TABLE "pair_audit" ADD COLUMN "revised_at" timestamp;--> statement-breakpoint
ALTER TABLE "pair_audit" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_response" ADD COLUMN "revised_at" timestamp;--> statement-breakpoint
ALTER TABLE "review_response" ADD COLUMN "revision_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_revision" ADD CONSTRAINT "review_revision_assignment_id_review_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_revision" ADD CONSTRAINT "review_revision_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_revision_assignment_idx" ON "review_revision" USING btree ("assignment_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "review_assignment_family_uq" ON "review_assignment" USING btree ("reviewer_id","family_id") WHERE state <> 'expired';