CREATE TABLE "tester_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"marked_at" timestamp DEFAULT now() NOT NULL,
	"marked_by" text
);
--> statement-breakpoint
ALTER TABLE "tester_account" ADD CONSTRAINT "tester_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;