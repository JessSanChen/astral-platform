DROP TABLE "profile_revision" CASCADE;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "author_labels" jsonb;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "author_labels_version" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "author_labels_updated_at" timestamp;--> statement-breakpoint
-- A profile edit goes back to simply replacing the answers (the table
-- dropped above kept every earlier set; the organizer preferred not to).
--
-- Every session now carries the author's answers about it. Work that was
-- already labelled had them on its episode only: copy them onto its
-- sessions, with whether the task was real and the goal note beside them.
UPDATE "conversation" c
SET "author_labels" = e."author_labels"
      || jsonb_build_object('provenance', coalesce(e."task_provenance", ''), 'goal', coalesce(e."goal_text", '')),
    "author_labels_version" = e."author_labels_version",
    "author_labels_updated_at" = e."author_labels_updated_at"
FROM "episode" e
WHERE e."id" = c."episode_id" AND e."author_labels" IS NOT NULL;
