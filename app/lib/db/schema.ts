/* eslint-disable @typescript-eslint/no-unused-vars */
import { pgTable, check, text, timestamp, boolean, index, foreignKey, unique, uuid, integer, uniqueIndex, bigint, jsonb, date, smallint, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const whatsappInstances = pgTable("whatsapp_instances", {
	id: text().primaryKey().notNull(),
	label: text().notNull(),
	status: text().notNull(),
	lastKnownPhoneNumber: text("last_known_phone_number"),
	lastKnownChatId: text("last_known_chat_id"),
	lastReadyAt: timestamp("last_ready_at", { withTimezone: true, mode: 'string' }),
	lastQrAt: timestamp("last_qr_at", { withTimezone: true, mode: 'string' }),
	lastDisconnectAt: timestamp("last_disconnect_at", { withTimezone: true, mode: 'string' }),
	lastError: text("last_error"),
	assignedWorkerId: text("assigned_worker_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	retiredAt: timestamp("retired_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	check("whatsapp_instances_status_check", sql`status = ANY (ARRAY['starting'::text, 'qr_required'::text, 'connecting'::text, 'ready'::text, 'degraded'::text, 'disconnected'::text, 'auth_failed'::text])`),
]);

export const scheduledBlastRecipients = pgTable("scheduled_blast_recipients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scheduledBlastId: uuid("scheduled_blast_id").notNull(),
	recipientPhoneNumber: text("recipient_phone_number").notNull(),
	recipientName: text("recipient_name"),
	recipientGroupNames: text("recipient_group_names").array().default([""]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("scheduled_blast_recipients_blast_id_idx").using("btree", table.scheduledBlastId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.scheduledBlastId],
			foreignColumns: [scheduledBlasts.id],
			name: "scheduled_blast_recipients_scheduled_blast_id_fkey"
		}).onDelete("cascade"),
	unique("scheduled_blast_recipients_scheduled_blast_id_recipient_pho_key").on(table.scheduledBlastId, table.recipientPhoneNumber),
]);

export const apiClients = pgTable("api_clients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	keyPrefix: text("key_prefix").notNull(),
	keyHash: text("key_hash").notNull(),
	status: text().default('active').notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	maxRequestsPerMinute: integer("max_requests_per_minute").default(60).notNull(),
	maxPendingMessages: integer("max_pending_messages").default(100).notNull(),
}, (table) => [
	unique("api_clients_key_prefix_key").on(table.keyPrefix),
	unique("api_clients_key_hash_key").on(table.keyHash),
	check("api_clients_status_check", sql`status = ANY (ARRAY['active'::text, 'disabled'::text])`),
]);

export const blastMessageTemplates = pgTable("blast_message_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	description: text().default('').notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("blast_message_templates_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")).where(sql`(deleted_at IS NULL)`),
	index("blast_message_templates_title_idx").using("btree", sql`lower(title)`).where(sql`(deleted_at IS NULL)`),
	check("blast_message_templates_content_check", sql`(length(TRIM(BOTH FROM content)) >= 1) AND (length(TRIM(BOTH FROM content)) <= 4096)`),
	check("blast_message_templates_title_check", sql`(length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)`),
]);

export const botDispatchSettings = pgTable("bot_dispatch_settings", {
	id: text().default('default').primaryKey().notNull(),
	globalMessagesPerMinute: integer("global_messages_per_minute").default(24).notNull(),
	apiNotificationsPaused: boolean("api_notifications_paused").default(false).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	check("bot_dispatch_settings_global_messages_per_minute_check", sql`global_messages_per_minute > 0`),
]);

export const adminAppUsers = pgTable("admin_app_users", {
	ssoSub: text("sso_sub").primaryKey().notNull(),
	email: text(),
	name: text(),
	roles: text().array().default([""]).notNull(),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const contentAssetProjects = pgTable("content_asset_projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	createdBy: text("created_by").notNull(),
	createdByEmail: text("created_by_email"),
	projectName: text("project_name").notNull(),
	notes: text(),
}, (table) => [
	index("content_asset_projects_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("content_asset_projects_project_name_key").using("btree", table.projectName.asc().nullsLast().op("text_ops")),
]);

export const contentTags = pgTable("content_tags", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	uniqueIndex("content_tags_name_lower_idx").using("btree", sql`lower(btrim(name))`),
]);

export const contentAssets = pgTable("content_assets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	sourceType: text("source_type").default('file').notNull(),
	sourceUrl: text("source_url"),
	uploader: text().notNull(),
	uploaderEmail: text("uploader_email"),
	projectName: text("project_name").notNull(),
	originalFilename: text("original_filename").notNull(),
	storageBucket: text("storage_bucket").default('content-assets'),
	storagePath: text("storage_path"),
	mimeType: text("mime_type").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	fileSize: bigint("file_size", { mode: "number" }).default(0).notNull(),
	notes: text(),
	projectId: uuid("project_id"),
}, (table) => [
	index("content_assets_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("content_assets_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	index("content_assets_project_name_idx").using("btree", table.projectName.asc().nullsLast().op("text_ops")),
	uniqueIndex("content_assets_storage_object_key").using("btree", table.storageBucket.asc().nullsLast().op("text_ops"), table.storagePath.asc().nullsLast().op("text_ops")),
	index("content_assets_uploader_idx").using("btree", table.uploader.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [contentAssetProjects.id],
			name: "content_assets_project_id_fkey"
		}).onDelete("set null"),
]);

export const csvContacts = pgTable("csv_contacts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	noTelp: text("no_telp").notNull(),
	nama: text().notNull(),
	jenisKelamin: text("jenis_kelamin").notNull(),
	jabatan: text(),
	sourceFile: text("source_file"),
	importedAt: timestamp("imported_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	groupName: text("group_name"),
	groupNames: text("group_names").array().default([""]).notNull(),
}, (table) => [
	index("idx_csv_contacts_group_name").using("btree", table.groupName.asc().nullsLast().op("text_ops")),
	index("idx_csv_contacts_group_names").using("gin", table.groupNames.asc().nullsLast().op("array_ops")),
	index("idx_csv_contacts_imported_at").using("btree", table.importedAt.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("idx_csv_contacts_no_telp").using("btree", table.noTelp.asc().nullsLast().op("text_ops")),
]);

export const tickets = pgTable("tickets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	subject: text().notNull(),
	description: text(),
	status: text().default('Open'),
	userEmail: text("user_email"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	channel: text().default('web'),
	phoneNumber: text("phone_number"),
	whatsappChatId: text("whatsapp_chat_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	whatsappInstanceId: text("whatsapp_instance_id"),
}, (table) => [
	index("tickets_channel_idx").using("btree", table.channel.asc().nullsLast().op("text_ops")),
	index("tickets_phone_number_idx").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops")),
	index("tickets_whatsapp_chat_id_idx").using("btree", table.whatsappChatId.asc().nullsLast().op("text_ops")),
	index("tickets_whatsapp_instance_id_idx").using("btree", table.whatsappInstanceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.whatsappInstanceId],
			foreignColumns: [whatsappInstances.id],
			name: "tickets_whatsapp_instance_id_fkey"
		}).onDelete("set null"),
]);

export const scheduledBlasts = pgTable("scheduled_blasts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	messageTemplate: text("message_template").notNull(),
	sourceType: text("source_type").notNull(),
	sourceConfig: jsonb("source_config").default({}).notNull(),
	scheduleType: text("schedule_type").notNull(),
	recurrenceType: text("recurrence_type"),
	timezone: text().default('Asia/Jakarta').notNull(),
	runAt: timestamp("run_at", { withTimezone: true, mode: 'string' }),
	nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: 'string' }),
	lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: 'string' }),
	status: text().default('active').notNull(),
	saveToGroup: boolean("save_to_group").default(false).notNull(),
	saveGroupName: text("save_group_name"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	deletedAt: timestamp("deleted_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("scheduled_blasts_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("scheduled_blasts_due_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.nextRunAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(deleted_at IS NULL)`),
	check("scheduled_blasts_once_run_at_check", sql`((schedule_type = 'once'::text) AND (run_at IS NOT NULL) AND (recurrence_type IS NULL)) OR ((schedule_type = 'recurring'::text) AND (recurrence_type IS NOT NULL))`),
	check("scheduled_blasts_recurrence_type_check", sql`recurrence_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text])`),
	check("scheduled_blasts_save_group_name_check", sql`(save_to_group = false) OR ((save_to_group = true) AND (save_group_name IS NOT NULL) AND (length(TRIM(BOTH FROM save_group_name)) > 0))`),
	check("scheduled_blasts_schedule_type_check", sql`schedule_type = ANY (ARRAY['once'::text, 'recurring'::text])`),
	check("scheduled_blasts_source_type_check", sql`source_type = ANY (ARRAY['manual'::text, 'csv'::text, 'contact'::text, 'group'::text])`),
	check("scheduled_blasts_status_check", sql`status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])`),
]);

export const scheduledBlastRuns = pgTable("scheduled_blast_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scheduledBlastId: uuid("scheduled_blast_id").notNull(),
	scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: 'string' }).notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	status: text().default('running').notNull(),
	batchId: text("batch_id"),
	totalRecipients: integer("total_recipients").default(0).notNull(),
	acceptedCount: integer("accepted_count").default(0).notNull(),
	failedCount: integer("failed_count").default(0).notNull(),
	trackedMessageIds: text("tracked_message_ids").array().default([""]).notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("scheduled_blast_runs_blast_created_at_idx").using("btree", table.scheduledBlastId.asc().nullsLast().op("uuid_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.scheduledBlastId],
			foreignColumns: [scheduledBlasts.id],
			name: "scheduled_blast_runs_scheduled_blast_id_fkey"
		}).onDelete("cascade"),
	check("scheduled_blast_runs_accepted_count_check", sql`accepted_count >= 0`),
	check("scheduled_blast_runs_failed_count_check", sql`failed_count >= 0`),
	check("scheduled_blast_runs_status_check", sql`status = ANY (ARRAY['running'::text, 'queued'::text, 'partial'::text, 'failed'::text, 'skipped'::text])`),
	check("scheduled_blast_runs_total_recipients_check", sql`total_recipients >= 0`),
]);

export const replies = pgTable("replies", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	ticketId: uuid("ticket_id"),
	author: text().notNull(),
	content: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	senderType: text("sender_type").default('admin'),
	deliveryStatus: text("delivery_status").default('not_applicable'),
	deliveryAttempts: integer("delivery_attempts").default(0),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }),
	lastDeliveryError: text("last_delivery_error"),
	whatsappMessageId: text("whatsapp_message_id"),
	deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'string' }),
	mediaBucket: text("media_bucket"),
	mediaPath: text("media_path"),
	mediaMimeType: text("media_mime_type"),
	mediaFileName: text("media_file_name"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	mediaSizeBytes: bigint("media_size_bytes", { mode: "number" }),
}, (table) => [
	index("replies_delivery_status_idx").using("btree", table.deliveryStatus.asc().nullsLast().op("text_ops"), table.nextRetryAt.asc().nullsLast().op("timestamptz_ops")),
	index("replies_ticket_created_at_idx").using("btree", table.ticketId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.ticketId],
			foreignColumns: [tickets.id],
			name: "replies_ticket_id_fkey"
		}).onDelete("cascade"),
]);

export const contentRecordings = pgTable("content_recordings", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text(),
	platform: text().notNull(),
	uploadDate: date("upload_date").notNull(),
	link: text().notNull(),
	sourcePostId: text("source_post_id"),
	thumbnailUrl: text("thumbnail_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	caption: text(),
	description: text(),
	contentType: text("content_type"),
	mediaUrls: text("media_urls").array(),
}, (table) => [
	index("content_recordings_caption_trgm_idx").using("gin", table.caption.asc().nullsLast().op("gin_trgm_ops")),
	index("content_recordings_content_type_idx").using("btree", table.contentType.asc().nullsLast().op("text_ops")),
	index("content_recordings_created_at_idx").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("content_recordings_description_trgm_idx").using("gin", table.description.asc().nullsLast().op("gin_trgm_ops")),
	index("content_recordings_link_trgm_idx").using("gin", table.link.asc().nullsLast().op("gin_trgm_ops")),
	index("content_recordings_platform_idx").using("btree", table.platform.asc().nullsLast().op("text_ops")),
	index("content_recordings_title_trgm_idx").using("gin", table.title.asc().nullsLast().op("gin_trgm_ops")),
	index("content_recordings_upload_date_idx").using("btree", table.uploadDate.desc().nullsFirst().op("date_ops")),
	unique("content_recordings_link_key").on(table.link),
	check("content_recordings_platform_check", sql`platform = ANY (ARRAY['youtube'::text, 'x'::text, 'Instagram'::text])`),
]);

export const outboundMessages = pgTable("outbound_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clientId: uuid("client_id"),
	idempotencyKey: text("idempotency_key"),
	requestFingerprint: text("request_fingerprint"),
	recipientPhoneNumber: text("recipient_phone_number").notNull(),
	recipientChatId: text("recipient_chat_id"),
	content: text().notNull(),
	clientReference: text("client_reference"),
	deliveryStatus: text("delivery_status").default('queued').notNull(),
	deliveryAttempts: integer("delivery_attempts").default(0).notNull(),
	nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: 'string' }),
	lastDeliveryError: text("last_delivery_error"),
	whatsappMessageId: text("whatsapp_message_id"),
	deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
	sourceType: text("source_type").notNull(),
	sourceId: text("source_id").notNull(),
	ticketId: uuid("ticket_id"),
	priority: smallint().default(100).notNull(),
	whatsappInstanceId: text("whatsapp_instance_id").notNull(),
	mediaBucket: text("media_bucket"),
	mediaPath: text("media_path"),
	mediaMimeType: text("media_mime_type"),
	mediaFileName: text("media_file_name"),
}, (table) => [
	index("outbound_messages_client_idempotency_created_at_idx").using("btree", table.clientId.asc().nullsLast().op("uuid_ops"), table.idempotencyKey.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("outbound_messages_client_source_created_at_idx").using("btree", table.clientId.asc().nullsLast().op("uuid_ops"), table.sourceType.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("outbound_messages_client_source_delivery_status_idx").using("btree", table.clientId.asc().nullsLast().op("uuid_ops"), table.sourceType.asc().nullsLast().op("text_ops"), table.deliveryStatus.asc().nullsLast().op("text_ops")),
	index("outbound_messages_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("outbound_messages_delivery_status_idx").using("btree", table.deliveryStatus.asc().nullsLast().op("text_ops")),
	index("outbound_messages_due_work_idx").using("btree", table.deliveryStatus.asc().nullsLast().op("text_ops"), table.nextRetryAt.asc().nullsLast().op("timestamptz_ops"), table.priority.asc().nullsLast().op("int2_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("outbound_messages_instance_status_created_at_idx").using("btree", table.whatsappInstanceId.asc().nullsLast().op("text_ops"), table.deliveryStatus.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("outbound_messages_next_retry_at_idx").using("btree", table.nextRetryAt.asc().nullsLast().op("timestamptz_ops")),
	uniqueIndex("outbound_messages_source_type_source_id_unique_idx").using("btree", table.sourceType.asc().nullsLast().op("text_ops"), table.sourceId.asc().nullsLast().op("text_ops")),
	index("outbound_messages_whatsapp_instance_id_idx").using("btree", table.whatsappInstanceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [apiClients.id],
			name: "outbound_messages_client_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.ticketId],
			foreignColumns: [tickets.id],
			name: "outbound_messages_ticket_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.whatsappInstanceId],
			foreignColumns: [whatsappInstances.id],
			name: "outbound_messages_whatsapp_instance_id_fkey"
		}).onDelete("restrict"),
	check("outbound_messages_api_notification_client_check", sql`((source_type = 'api_notification'::text) AND (client_id IS NOT NULL) AND (idempotency_key IS NOT NULL) AND (request_fingerprint IS NOT NULL)) OR ((source_type = 'ticket_reply'::text) AND (client_id IS NULL) AND (idempotency_key IS NULL) AND (request_fingerprint IS NULL)) OR ((source_type = 'blast'::text) AND (client_id IS NULL) AND (idempotency_key IS NULL) AND (request_fingerprint IS NULL))`),
	check("outbound_messages_delivery_attempts_check", sql`delivery_attempts >= 0`),
	check("outbound_messages_delivery_status_check", sql`delivery_status = ANY (ARRAY['queued'::text, 'retrying'::text, 'sent'::text, 'failed'::text])`),
	check("outbound_messages_source_type_check", sql`source_type = ANY (ARRAY['api_notification'::text, 'ticket_reply'::text, 'blast'::text])`),
]);

export const whatsappInstanceEvents = pgTable("whatsapp_instance_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	whatsappInstanceId: text("whatsapp_instance_id").notNull(),
	eventType: text("event_type").notNull(),
	message: text(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("whatsapp_instance_events_instance_created_at_idx").using("btree", table.whatsappInstanceId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.whatsappInstanceId],
			foreignColumns: [whatsappInstances.id],
			name: "whatsapp_instance_events_whatsapp_instance_id_fkey"
		}).onDelete("cascade"),
	check("whatsapp_instance_events_event_type_check", sql`event_type = ANY (ARRAY['qr_issued'::text, 'ready'::text, 'disconnected'::text, 'auth_failed'::text, 'worker_stale'::text, 'reconnect_started'::text])`),
]);

export const contentAssetProjectTags = pgTable("content_asset_project_tags", {
	contentAssetProjectId: uuid("content_asset_project_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("content_asset_project_tags_tag_id_idx").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.contentAssetProjectId],
			foreignColumns: [contentAssetProjects.id],
			name: "content_asset_project_tags_content_asset_project_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [contentTags.id],
			name: "content_asset_project_tags_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.contentAssetProjectId, table.tagId], name: "content_asset_project_tags_pkey"}),
]);

export const contentAssetTags = pgTable("content_asset_tags", {
	contentAssetId: uuid("content_asset_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("content_asset_tags_tag_id_idx").using("btree", table.tagId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.contentAssetId],
			foreignColumns: [contentAssets.id],
			name: "content_asset_tags_content_asset_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [contentTags.id],
			name: "content_asset_tags_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.contentAssetId, table.tagId], name: "content_asset_tags_pkey"}),
]);

export const contentRecordingTags = pgTable("content_recording_tags", {
	contentRecordingId: uuid("content_recording_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`timezone('utc'::text, now())`).notNull(),
}, (table) => [
	index("content_recording_tags_tag_id_idx").using("btree", table.tagId.asc().nullsLast().op("uuid_ops"), table.contentRecordingId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.contentRecordingId],
			foreignColumns: [contentRecordings.id],
			name: "content_recording_tags_content_recording_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [contentTags.id],
			name: "content_recording_tags_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.contentRecordingId, table.tagId], name: "content_recording_tags_pkey"}),
]);

export const adminFeaturePermissions = pgTable("admin_feature_permissions", {
	ssoSub: text("sso_sub").notNull(),
	featureKey: text("feature_key").notNull(),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	grantedBySub: text("granted_by_sub"),
}, (table) => [
	index("admin_feature_permissions_feature_key_idx").using("btree", table.featureKey.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ssoSub],
			foreignColumns: [adminAppUsers.ssoSub],
			name: "admin_feature_permissions_sso_sub_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.ssoSub, table.featureKey], name: "admin_feature_permissions_pkey"}),
]);

export const whatsappContacts = pgTable("whatsapp_contacts", {
	phoneNumber: text("phone_number").notNull(),
	chatId: text("chat_id").notNull(),
	invalidMessageCount: integer("invalid_message_count").default(0).notNull(),
	lastMessagePreview: text("last_message_preview"),
	lastHelpSentAt: timestamp("last_help_sent_at", { withTimezone: true, mode: 'string' }),
	lastInboundAt: timestamp("last_inbound_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastTicketId: uuid("last_ticket_id"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	whatsappInstanceId: text("whatsapp_instance_id").notNull(),
}, (table) => [
	index("whatsapp_contacts_phone_number_idx").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.lastTicketId],
			foreignColumns: [tickets.id],
			name: "whatsapp_contacts_last_ticket_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.whatsappInstanceId],
			foreignColumns: [whatsappInstances.id],
			name: "whatsapp_contacts_whatsapp_instance_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.phoneNumber, table.whatsappInstanceId], name: "whatsapp_contacts_pkey"}),
]);
