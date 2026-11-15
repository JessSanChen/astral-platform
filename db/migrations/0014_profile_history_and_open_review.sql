CREATE TABLE "profile_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text,
	"intake" jsonb,
	"intake_version" text,
	"public_release_permission" text,
	"source" text NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_revision" ADD CONSTRAINT "profile_revision_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_revision_user_idx" ON "profile_revision" USING btree ("user_id","saved_at");--> statement-breakpoint
-- The history starts from what is there now, so nobody's first answers are
-- missing from it.
INSERT INTO "profile_revision" ("user_id", "name", "intake", "intake_version", "public_release_permission", "source", "saved_at")
SELECT p."user_id", u."name", p."intake", p."intake_version", p."public_release_permission", 'onboarding', p."updated_at"
FROM "profile" p JOIN "user" u ON u."id" = p."user_id"
WHERE p."intake" IS NOT NULL;--> statement-breakpoint
-- Organizers no longer decide who is able to review what. Every submitted
-- piece of work that was waiting, or was limited to people with subject
-- knowledge, becomes available to every reviewer. Ones that were held or
-- withdrawn stay as they are: those were decisions about the work itself.
UPDATE "episode"
SET "review_level" = 'general', "eligible_domains" = '{}',
    "assignment_state" = CASE WHEN "assignment_state" = 'pending' THEN 'ready' ELSE "assignment_state" END
WHERE "status" = 'submitted';
