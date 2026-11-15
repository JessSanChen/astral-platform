ALTER TABLE "pair_audit" ALTER COLUMN "sensitivity_match" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_audit" ALTER COLUMN "intended_change_realized" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_audit" ALTER COLUMN "comparison_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pair_audit" ADD COLUMN "scope_similarity" text;--> statement-breakpoint
ALTER TABLE "pair_audit" ADD COLUMN "main_difference" text;