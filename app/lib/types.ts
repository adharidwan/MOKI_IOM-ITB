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
  display_id: number | null;
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
  project_name: string;
  original_filename: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  notes: string | null;
  signed_url: string | null;
}
