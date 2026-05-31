ALTER TABLE "content_assets" ADD COLUMN "source_type" text DEFAULT 'file' NOT NULL;
--> statement-breakpoint
ALTER TABLE "content_assets" ADD COLUMN "source_url" text;
--> statement-breakpoint
ALTER TABLE "content_assets" ALTER COLUMN "storage_bucket" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "content_assets" ALTER COLUMN "storage_path" DROP NOT NULL;
