ALTER TABLE "related_version" ADD COLUMN "source_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "related_version" ADD COLUMN "target_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "related_version" ADD CONSTRAINT "related_version_source_conversation_id_conversation_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_version" ADD CONSTRAINT "related_version_target_conversation_id_conversation_id_fk" FOREIGN KEY ("target_conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A related version now links two single conversations. Links made
-- before this named only the two pieces of work; each of those was one
-- conversation, or a folder whose first session stands for it here.
UPDATE "related_version" rv
SET "source_conversation_id" = (
      SELECT c."id" FROM "conversation" c
      WHERE c."episode_id" = rv."source_episode_id"
      ORDER BY c."session_order" LIMIT 1),
    "target_conversation_id" = (
      SELECT c."id" FROM "conversation" c
      WHERE c."episode_id" = rv."target_episode_id"
      ORDER BY c."session_order" LIMIT 1)
WHERE rv."source_conversation_id" IS NULL OR rv."target_conversation_id" IS NULL;
