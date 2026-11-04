ALTER TABLE "event_settings" ALTER COLUMN "default_daily_token_budget" SET DEFAULT 5000000;--> statement-breakpoint
ALTER TABLE "event_settings" ALTER COLUMN "default_judge_runs_per_hour" SET DEFAULT 40;--> statement-breakpoint
ALTER TABLE "event_settings" ALTER COLUMN "chat_requests_per_minute" SET DEFAULT 20;