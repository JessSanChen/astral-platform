ALTER TABLE "episode" ADD COLUMN "author_labels" jsonb;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "author_labels_version" text;--> statement-breakpoint
ALTER TABLE "episode" ADD COLUMN "author_labels_updated_at" timestamp;