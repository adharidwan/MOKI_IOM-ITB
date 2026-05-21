import { relations } from "drizzle-orm/relations";
import { scheduledBlasts, scheduledBlastRecipients, contentAssetProjects, contentAssets, whatsappInstances, tickets, scheduledBlastRuns, replies, apiClients, outboundMessages, whatsappInstanceEvents, contentAssetProjectTags, contentTags, contentAssetTags, contentRecordings, contentRecordingTags, adminAppUsers, adminFeaturePermissions, whatsappContacts } from "./schema";

export const scheduledBlastRecipientsRelations = relations(scheduledBlastRecipients, ({one}) => ({
	scheduledBlast: one(scheduledBlasts, {
		fields: [scheduledBlastRecipients.scheduledBlastId],
		references: [scheduledBlasts.id]
	}),
}));

export const scheduledBlastsRelations = relations(scheduledBlasts, ({many}) => ({
	scheduledBlastRecipients: many(scheduledBlastRecipients),
	scheduledBlastRuns: many(scheduledBlastRuns),
}));

export const contentAssetsRelations = relations(contentAssets, ({one, many}) => ({
	contentAssetProject: one(contentAssetProjects, {
		fields: [contentAssets.projectId],
		references: [contentAssetProjects.id]
	}),
	contentAssetTags: many(contentAssetTags),
}));

export const contentAssetProjectsRelations = relations(contentAssetProjects, ({many}) => ({
	contentAssets: many(contentAssets),
	contentAssetProjectTags: many(contentAssetProjectTags),
}));

export const ticketsRelations = relations(tickets, ({one, many}) => ({
	whatsappInstance: one(whatsappInstances, {
		fields: [tickets.whatsappInstanceId],
		references: [whatsappInstances.id]
	}),
	replies: many(replies),
	outboundMessages: many(outboundMessages),
	whatsappContacts: many(whatsappContacts),
}));

export const whatsappInstancesRelations = relations(whatsappInstances, ({many}) => ({
	tickets: many(tickets),
	outboundMessages: many(outboundMessages),
	whatsappInstanceEvents: many(whatsappInstanceEvents),
	whatsappContacts: many(whatsappContacts),
}));

export const scheduledBlastRunsRelations = relations(scheduledBlastRuns, ({one}) => ({
	scheduledBlast: one(scheduledBlasts, {
		fields: [scheduledBlastRuns.scheduledBlastId],
		references: [scheduledBlasts.id]
	}),
}));

export const repliesRelations = relations(replies, ({one}) => ({
	ticket: one(tickets, {
		fields: [replies.ticketId],
		references: [tickets.id]
	}),
}));

export const outboundMessagesRelations = relations(outboundMessages, ({one}) => ({
	apiClient: one(apiClients, {
		fields: [outboundMessages.clientId],
		references: [apiClients.id]
	}),
	ticket: one(tickets, {
		fields: [outboundMessages.ticketId],
		references: [tickets.id]
	}),
	whatsappInstance: one(whatsappInstances, {
		fields: [outboundMessages.whatsappInstanceId],
		references: [whatsappInstances.id]
	}),
}));

export const apiClientsRelations = relations(apiClients, ({many}) => ({
	outboundMessages: many(outboundMessages),
}));

export const whatsappInstanceEventsRelations = relations(whatsappInstanceEvents, ({one}) => ({
	whatsappInstance: one(whatsappInstances, {
		fields: [whatsappInstanceEvents.whatsappInstanceId],
		references: [whatsappInstances.id]
	}),
}));

export const contentAssetProjectTagsRelations = relations(contentAssetProjectTags, ({one}) => ({
	contentAssetProject: one(contentAssetProjects, {
		fields: [contentAssetProjectTags.contentAssetProjectId],
		references: [contentAssetProjects.id]
	}),
	contentTag: one(contentTags, {
		fields: [contentAssetProjectTags.tagId],
		references: [contentTags.id]
	}),
}));

export const contentTagsRelations = relations(contentTags, ({many}) => ({
	contentAssetProjectTags: many(contentAssetProjectTags),
	contentAssetTags: many(contentAssetTags),
	contentRecordingTags: many(contentRecordingTags),
}));

export const contentAssetTagsRelations = relations(contentAssetTags, ({one}) => ({
	contentAsset: one(contentAssets, {
		fields: [contentAssetTags.contentAssetId],
		references: [contentAssets.id]
	}),
	contentTag: one(contentTags, {
		fields: [contentAssetTags.tagId],
		references: [contentTags.id]
	}),
}));

export const contentRecordingTagsRelations = relations(contentRecordingTags, ({one}) => ({
	contentRecording: one(contentRecordings, {
		fields: [contentRecordingTags.contentRecordingId],
		references: [contentRecordings.id]
	}),
	contentTag: one(contentTags, {
		fields: [contentRecordingTags.tagId],
		references: [contentTags.id]
	}),
}));

export const contentRecordingsRelations = relations(contentRecordings, ({many}) => ({
	contentRecordingTags: many(contentRecordingTags),
}));

export const adminFeaturePermissionsRelations = relations(adminFeaturePermissions, ({one}) => ({
	adminAppUser: one(adminAppUsers, {
		fields: [adminFeaturePermissions.ssoSub],
		references: [adminAppUsers.ssoSub]
	}),
}));

export const adminAppUsersRelations = relations(adminAppUsers, ({many}) => ({
	adminFeaturePermissions: many(adminFeaturePermissions),
}));

export const whatsappContactsRelations = relations(whatsappContacts, ({one}) => ({
	ticket: one(tickets, {
		fields: [whatsappContacts.lastTicketId],
		references: [tickets.id]
	}),
	whatsappInstance: one(whatsappInstances, {
		fields: [whatsappContacts.whatsappInstanceId],
		references: [whatsappInstances.id]
	}),
}));