ALTER TABLE "conversation" ADD COLUMN "provenance_changed_at" timestamp;--> statement-breakpoint
ALTER TABLE "episode_goal_revision" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "episode_goal_revision" ADD CONSTRAINT "episode_goal_revision_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A conversation that stands alone keeps its author's answers on its
-- episode, with a copy on its one session. The copy used to be made only
-- at submission, so a draft's could be missing or behind. From here on it
-- is refreshed with every change; this brings existing drafts level.
UPDATE "conversation" c
SET "author_labels" = coalesce(e."author_labels", '{}'::jsonb)
      || jsonb_build_object('provenance', coalesce(e."task_provenance", ''), 'goal', coalesce(e."goal_text", '')),
    "author_labels_version" = coalesce(e."author_labels_version", c."author_labels_version"),
    "author_labels_updated_at" = coalesce(e."author_labels_updated_at", c."author_labels_updated_at")
FROM "episode" e
WHERE e."id" = c."episode_id"
  AND e."is_folder" = false
  AND e."status" = 'draft'
  AND (e."author_labels" IS NOT NULL OR e."task_provenance" IS NOT NULL OR e."goal_text" IS NOT NULL);
