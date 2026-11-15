ALTER TABLE "event_settings" ALTER COLUMN "auto_release_submissions" SET DEFAULT true;--> statement-breakpoint
-- Review eligibility is simpler by default: a new submission goes straight
-- to any reviewer who has passed the instruction check, as a General item.
-- Organizers can still restrict one (Routine, Specialist) or hold it back
-- from Organize -> Submissions, and can turn this off in Settings.
UPDATE "event_settings" SET "auto_release_submissions" = true;--> statement-breakpoint
-- What was already waiting with no level set goes out the same way.
UPDATE "episode"
SET "review_level" = 'general', "assignment_state" = 'ready'
WHERE "status" = 'submitted' AND "assignment_state" = 'pending' AND "review_level" IS NULL
  AND EXISTS (SELECT 1 FROM "review_view" v WHERE v."episode_id" = "episode"."id");
