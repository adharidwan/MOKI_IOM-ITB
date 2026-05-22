CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE TABLE "whatsapp_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"last_known_phone_number" text,
	"last_known_chat_id" text,
	"last_ready_at" timestamp with time zone,
	"last_qr_at" timestamp with time zone,
	"last_disconnect_at" timestamp with time zone,
	"last_error" text,
	"assigned_worker_id" text,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "whatsapp_instances_status_check" CHECK (status = ANY (ARRAY['starting'::text, 'qr_required'::text, 'connecting'::text, 'ready'::text, 'degraded'::text, 'disconnected'::text, 'auth_failed'::text]))
);
--> statement-breakpoint
CREATE TABLE "scheduled_blast_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_blast_id" uuid NOT NULL,
	"recipient_phone_number" text NOT NULL,
	"recipient_name" text,
	"recipient_group_names" text[] DEFAULT '{""}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "scheduled_blast_recipients_scheduled_blast_id_recipient_pho_key" UNIQUE("scheduled_blast_id","recipient_phone_number")
);
--> statement-breakpoint
CREATE TABLE "api_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"max_requests_per_minute" integer DEFAULT 60 NOT NULL,
	"max_pending_messages" integer DEFAULT 100 NOT NULL,
	CONSTRAINT "api_clients_key_prefix_key" UNIQUE("key_prefix"),
	CONSTRAINT "api_clients_key_hash_key" UNIQUE("key_hash"),
	CONSTRAINT "api_clients_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]))
);
--> statement-breakpoint
CREATE TABLE "blast_message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "blast_message_templates_content_check" CHECK ((length(TRIM(BOTH FROM content)) >= 1) AND (length(TRIM(BOTH FROM content)) <= 4096)),
	CONSTRAINT "blast_message_templates_title_check" CHECK ((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120))
);
--> statement-breakpoint
CREATE TABLE "bot_dispatch_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"global_messages_per_minute" integer DEFAULT 24 NOT NULL,
	"api_notifications_paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "bot_dispatch_settings_global_messages_per_minute_check" CHECK (global_messages_per_minute > 0)
);
--> statement-breakpoint
CREATE TABLE "admin_app_users" (
	"sso_sub" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"roles" text[] DEFAULT '{""}' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_asset_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"created_by" text NOT NULL,
	"created_by_email" text,
	"project_name" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "content_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"uploader" text NOT NULL,
	"uploader_email" text,
	"project_name" text NOT NULL,
	"original_filename" text NOT NULL,
	"storage_bucket" text DEFAULT 'content-assets' NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"project_id" uuid
);
--> statement-breakpoint
CREATE TABLE "csv_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"no_telp" text NOT NULL,
	"nama" text NOT NULL,
	"jenis_kelamin" text NOT NULL,
	"jabatan" text,
	"source_file" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"group_name" text,
	"group_names" text[] DEFAULT '{""}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'Open',
	"user_email" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"channel" text DEFAULT 'web',
	"phone_number" text,
	"whatsapp_chat_id" text,
	"updated_at" timestamp with time zone DEFAULT now(),
	"whatsapp_instance_id" text
);
--> statement-breakpoint
CREATE TABLE "scheduled_blasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"message_template" text NOT NULL,
	"source_type" text NOT NULL,
	"source_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule_type" text NOT NULL,
	"recurrence_type" text,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"save_to_group" boolean DEFAULT false NOT NULL,
	"save_group_name" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "scheduled_blasts_once_run_at_check" CHECK (((schedule_type = 'once'::text) AND (run_at IS NOT NULL) AND (recurrence_type IS NULL)) OR ((schedule_type = 'recurring'::text) AND (recurrence_type IS NOT NULL))),
	CONSTRAINT "scheduled_blasts_recurrence_type_check" CHECK (recurrence_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])),
	CONSTRAINT "scheduled_blasts_save_group_name_check" CHECK ((save_to_group = false) OR ((save_to_group = true) AND (save_group_name IS NOT NULL) AND (length(TRIM(BOTH FROM save_group_name)) > 0))),
	CONSTRAINT "scheduled_blasts_schedule_type_check" CHECK (schedule_type = ANY (ARRAY['once'::text, 'recurring'::text])),
	CONSTRAINT "scheduled_blasts_source_type_check" CHECK (source_type = ANY (ARRAY['manual'::text, 'csv'::text, 'contact'::text, 'group'::text])),
	CONSTRAINT "scheduled_blasts_status_check" CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "scheduled_blast_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheduled_blast_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"batch_id" text,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"tracked_message_ids" text[] DEFAULT '{""}' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "scheduled_blast_runs_accepted_count_check" CHECK (accepted_count >= 0),
	CONSTRAINT "scheduled_blast_runs_failed_count_check" CHECK (failed_count >= 0),
	CONSTRAINT "scheduled_blast_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'queued'::text, 'partial'::text, 'failed'::text, 'skipped'::text])),
	CONSTRAINT "scheduled_blast_runs_total_recipients_check" CHECK (total_recipients >= 0)
);
--> statement-breakpoint
CREATE TABLE "replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"author" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"sender_type" text DEFAULT 'admin',
	"delivery_status" text DEFAULT 'not_applicable',
	"delivery_attempts" integer DEFAULT 0,
	"next_retry_at" timestamp with time zone,
	"last_delivery_error" text,
	"whatsapp_message_id" text,
	"delivered_at" timestamp with time zone,
	"media_bucket" text,
	"media_path" text,
	"media_mime_type" text,
	"media_file_name" text,
	"media_size_bytes" bigint
);
--> statement-breakpoint
CREATE TABLE "content_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"platform" text NOT NULL,
	"upload_date" date NOT NULL,
	"link" text NOT NULL,
	"source_post_id" text,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"caption" text,
	"description" text,
	"content_type" text,
	"media_urls" text[],
	CONSTRAINT "content_recordings_link_key" UNIQUE("link"),
	CONSTRAINT "content_recordings_platform_check" CHECK (platform = ANY (ARRAY['youtube'::text, 'x'::text, 'Instagram'::text]))
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"idempotency_key" text,
	"request_fingerprint" text,
	"recipient_phone_number" text NOT NULL,
	"recipient_chat_id" text,
	"content" text NOT NULL,
	"client_reference" text,
	"delivery_status" text DEFAULT 'queued' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"last_delivery_error" text,
	"whatsapp_message_id" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"ticket_id" uuid,
	"priority" smallint DEFAULT 100 NOT NULL,
	"whatsapp_instance_id" text NOT NULL,
	"media_bucket" text,
	"media_path" text,
	"media_mime_type" text,
	"media_file_name" text,
	CONSTRAINT "outbound_messages_api_notification_client_check" CHECK (((source_type = 'api_notification'::text) AND (client_id IS NOT NULL) AND (idempotency_key IS NOT NULL) AND (request_fingerprint IS NOT NULL)) OR ((source_type = 'ticket_reply'::text) AND (client_id IS NULL) AND (idempotency_key IS NULL) AND (request_fingerprint IS NULL)) OR ((source_type = 'blast'::text) AND (client_id IS NULL) AND (idempotency_key IS NULL) AND (request_fingerprint IS NULL))),
	CONSTRAINT "outbound_messages_delivery_attempts_check" CHECK (delivery_attempts >= 0),
	CONSTRAINT "outbound_messages_delivery_status_check" CHECK (delivery_status = ANY (ARRAY['queued'::text, 'retrying'::text, 'sent'::text, 'failed'::text])),
	CONSTRAINT "outbound_messages_source_type_check" CHECK (source_type = ANY (ARRAY['api_notification'::text, 'ticket_reply'::text, 'blast'::text]))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_instance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"whatsapp_instance_id" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "whatsapp_instance_events_event_type_check" CHECK (event_type = ANY (ARRAY['qr_issued'::text, 'ready'::text, 'disconnected'::text, 'auth_failed'::text, 'worker_stale'::text, 'reconnect_started'::text]))
);
--> statement-breakpoint
CREATE TABLE "content_asset_project_tags" (
	"content_asset_project_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "content_asset_project_tags_pkey" PRIMARY KEY("content_asset_project_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "content_asset_tags" (
	"content_asset_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "content_asset_tags_pkey" PRIMARY KEY("content_asset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "content_recording_tags" (
	"content_recording_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
	CONSTRAINT "content_recording_tags_pkey" PRIMARY KEY("content_recording_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "admin_feature_permissions" (
	"sso_sub" text NOT NULL,
	"feature_key" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_sub" text,
	CONSTRAINT "admin_feature_permissions_pkey" PRIMARY KEY("sso_sub","feature_key")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"phone_number" text NOT NULL,
	"chat_id" text NOT NULL,
	"invalid_message_count" integer DEFAULT 0 NOT NULL,
	"last_message_preview" text,
	"last_help_sent_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone DEFAULT now(),
	"last_ticket_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now(),
	"whatsapp_instance_id" text NOT NULL,
	CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY("phone_number","whatsapp_instance_id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_blast_recipients" ADD CONSTRAINT "scheduled_blast_recipients_scheduled_blast_id_fkey" FOREIGN KEY ("scheduled_blast_id") REFERENCES "public"."scheduled_blasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."content_asset_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_whatsapp_instance_id_fkey" FOREIGN KEY ("whatsapp_instance_id") REFERENCES "public"."whatsapp_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_blast_runs" ADD CONSTRAINT "scheduled_blast_runs_scheduled_blast_id_fkey" FOREIGN KEY ("scheduled_blast_id") REFERENCES "public"."scheduled_blasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replies" ADD CONSTRAINT "replies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."api_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_whatsapp_instance_id_fkey" FOREIGN KEY ("whatsapp_instance_id") REFERENCES "public"."whatsapp_instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_instance_events" ADD CONSTRAINT "whatsapp_instance_events_whatsapp_instance_id_fkey" FOREIGN KEY ("whatsapp_instance_id") REFERENCES "public"."whatsapp_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_project_tags" ADD CONSTRAINT "content_asset_project_tags_content_asset_project_id_fkey" FOREIGN KEY ("content_asset_project_id") REFERENCES "public"."content_asset_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_project_tags" ADD CONSTRAINT "content_asset_project_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."content_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_tags" ADD CONSTRAINT "content_asset_tags_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "public"."content_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_asset_tags" ADD CONSTRAINT "content_asset_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."content_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_recording_tags" ADD CONSTRAINT "content_recording_tags_content_recording_id_fkey" FOREIGN KEY ("content_recording_id") REFERENCES "public"."content_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_recording_tags" ADD CONSTRAINT "content_recording_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."content_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feature_permissions" ADD CONSTRAINT "admin_feature_permissions_sso_sub_fkey" FOREIGN KEY ("sso_sub") REFERENCES "public"."admin_app_users"("sso_sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_last_ticket_id_fkey" FOREIGN KEY ("last_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_whatsapp_instance_id_fkey" FOREIGN KEY ("whatsapp_instance_id") REFERENCES "public"."whatsapp_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_blast_recipients_blast_id_idx" ON "scheduled_blast_recipients" USING btree ("scheduled_blast_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "blast_message_templates_created_at_idx" ON "blast_message_templates" USING btree ("created_at" timestamptz_ops) WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "blast_message_templates_title_idx" ON "blast_message_templates" USING btree (lower(title) text_ops) WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "content_asset_projects_created_at_idx" ON "content_asset_projects" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "content_asset_projects_project_name_key" ON "content_asset_projects" USING btree ("project_name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "content_tags_name_lower_idx" ON "content_tags" USING btree (lower(btrim(name)) text_ops);--> statement-breakpoint
CREATE INDEX "content_assets_created_at_idx" ON "content_assets" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "content_assets_project_id_idx" ON "content_assets" USING btree ("project_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "content_assets_project_name_idx" ON "content_assets" USING btree ("project_name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "content_assets_storage_object_key" ON "content_assets" USING btree ("storage_bucket" text_ops,"storage_path" text_ops);--> statement-breakpoint
CREATE INDEX "content_assets_uploader_idx" ON "content_assets" USING btree ("uploader" text_ops);--> statement-breakpoint
CREATE INDEX "idx_csv_contacts_group_name" ON "csv_contacts" USING btree ("group_name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_csv_contacts_group_names" ON "csv_contacts" USING gin ("group_names" array_ops);--> statement-breakpoint
CREATE INDEX "idx_csv_contacts_imported_at" ON "csv_contacts" USING btree ("imported_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_csv_contacts_no_telp" ON "csv_contacts" USING btree ("no_telp" text_ops);--> statement-breakpoint
CREATE INDEX "tickets_channel_idx" ON "tickets" USING btree ("channel" text_ops);--> statement-breakpoint
CREATE INDEX "tickets_phone_number_idx" ON "tickets" USING btree ("phone_number" text_ops);--> statement-breakpoint
CREATE INDEX "tickets_whatsapp_chat_id_idx" ON "tickets" USING btree ("whatsapp_chat_id" text_ops);--> statement-breakpoint
CREATE INDEX "tickets_whatsapp_instance_id_idx" ON "tickets" USING btree ("whatsapp_instance_id" text_ops);--> statement-breakpoint
CREATE INDEX "scheduled_blasts_created_at_idx" ON "scheduled_blasts" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "scheduled_blasts_due_idx" ON "scheduled_blasts" USING btree ("status" text_ops,"next_run_at" timestamptz_ops) WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "scheduled_blast_runs_blast_created_at_idx" ON "scheduled_blast_runs" USING btree ("scheduled_blast_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "replies_delivery_status_idx" ON "replies" USING btree ("delivery_status" text_ops,"next_retry_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "replies_ticket_created_at_idx" ON "replies" USING btree ("ticket_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_caption_trgm_idx" ON "content_recordings" USING gin ("caption" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_content_type_idx" ON "content_recordings" USING btree ("content_type" text_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_created_at_idx" ON "content_recordings" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_description_trgm_idx" ON "content_recordings" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_link_trgm_idx" ON "content_recordings" USING gin ("link" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_platform_idx" ON "content_recordings" USING btree ("platform" text_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_title_trgm_idx" ON "content_recordings" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "content_recordings_upload_date_idx" ON "content_recordings" USING btree ("upload_date" date_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_client_idempotency_created_at_idx" ON "outbound_messages" USING btree ("client_id" uuid_ops,"idempotency_key" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_client_source_created_at_idx" ON "outbound_messages" USING btree ("client_id" uuid_ops,"source_type" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_client_source_delivery_status_idx" ON "outbound_messages" USING btree ("client_id" uuid_ops,"source_type" text_ops,"delivery_status" text_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_created_at_idx" ON "outbound_messages" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_delivery_status_idx" ON "outbound_messages" USING btree ("delivery_status" text_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_due_work_idx" ON "outbound_messages" USING btree ("delivery_status" text_ops,"next_retry_at" timestamptz_ops,"priority" int2_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_instance_status_created_at_idx" ON "outbound_messages" USING btree ("whatsapp_instance_id" text_ops,"delivery_status" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_next_retry_at_idx" ON "outbound_messages" USING btree ("next_retry_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_messages_source_type_source_id_unique_idx" ON "outbound_messages" USING btree ("source_type" text_ops,"source_id" text_ops);--> statement-breakpoint
CREATE INDEX "outbound_messages_whatsapp_instance_id_idx" ON "outbound_messages" USING btree ("whatsapp_instance_id" text_ops);--> statement-breakpoint
CREATE INDEX "whatsapp_instance_events_instance_created_at_idx" ON "whatsapp_instance_events" USING btree ("whatsapp_instance_id" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "content_asset_project_tags_tag_id_idx" ON "content_asset_project_tags" USING btree ("tag_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "content_asset_tags_tag_id_idx" ON "content_asset_tags" USING btree ("tag_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "content_recording_tags_tag_id_idx" ON "content_recording_tags" USING btree ("tag_id" uuid_ops,"content_recording_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "admin_feature_permissions_feature_key_idx" ON "admin_feature_permissions" USING btree ("feature_key" text_ops);--> statement-breakpoint
CREATE INDEX "whatsapp_contacts_phone_number_idx" ON "whatsapp_contacts" USING btree ("phone_number" text_ops);
