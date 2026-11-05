CREATE TYPE "public"."nomination_track" AS ENUM('adversarial', 'dual_use', 'collaborative');--> statement-breakpoint
CREATE TABLE "nomination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"track" "nomination_track" NOT NULL,
	"headline" text NOT NULL,
	"details" text NOT NULL,
	"slides_url" text,
	"collaborators" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"submission_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "nominations_close_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_settings" ADD COLUMN "nominations_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "nomination_user_track_uq" ON "nomination" USING btree ("user_id","track");--> statement-breakpoint
CREATE INDEX "nomination_track_idx" ON "nomination" USING btree ("track","updated_at");