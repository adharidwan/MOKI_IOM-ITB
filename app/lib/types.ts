export type TicketStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface Ticket {
  id: string;
  subject: string;
  description: string | null;
  status: TicketStatus;
  user_email: string | null;
  channel: string | null;
  phone_number: string | null;
  whatsapp_chat_id: string | null;
  whatsapp_instance_id: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Reply {
  id: string;
  ticket_id: string;
  author: string;
  content: string;
  sender_type: 'customer' | 'admin' | 'system';
  delivery_status: 'pending' | 'queued' | 'retrying' | 'sent' | 'failed' | 'not_applicable';
  delivery_attempts: number;
  next_retry_at: string | null;
  last_delivery_error: string | null;
  whatsapp_message_id: string | null;
  delivered_at: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_mime_type: string | null;
  media_file_name: string | null;
  media_size_bytes: number | null;
  media_signed_url: string | null;
  created_at: string;
}

export interface TicketWithReplies extends Ticket {
  replies: Reply[];
}

export interface CsvContact {
  id: string;
  no_telp: string;
  nama: string;
  jenis_kelamin: string;
  jabatan: string | null;
  group_names: string[];
  source_file: string | null;
  imported_at: string;
  created_at: string;
}

export type ContentRecordingPlatform = 'youtube' | 'x' | 'Instagram' | 'Website';

export type ContentRecordingType = 'video' | 'short' | 'reel' | 'post' | 'tweet' | 'article' | 'other';

export interface ContentTag {
  id: string;
  name: string;
  created_at?: string;
}

export interface ContentRecording {
  id: string;
  title: string;
  platform: ContentRecordingPlatform;
  caption: string | null;
  description: string | null;
  content_type: ContentRecordingType | null;
  upload_date: string;
  link: string;
  source_post_id: string | null;
  thumbnail_url: string | null;
  media_urls: string[];
  tags: ContentTag[];
  created_at: string;
  updated_at: string;
}

export interface ContentAsset {
  id: string;
  created_at: string;
  updated_at: string;
  uploader: string;
  uploader_email: string | null;
  project_id: string | null;
  project_name: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  notes: string | null;
  tags: ContentTag[];
  signed_url: string | null;
}

export interface ContentAssetProject {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  created_by_email: string | null;
  project_name: string;
  notes: string | null;
  asset_count: number;
  image_count: number;
  video_count: number;
  total_file_size: number;
  latest_asset_at: string | null;
  tags: ContentTag[];
  preview_asset: ContentAsset | null;
}
