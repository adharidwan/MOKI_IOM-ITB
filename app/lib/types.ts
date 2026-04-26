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

export type ContentRecordingPlatform = 'youtube' | 'x' | 'Instagram';

export interface ContentRecording {
  id: string;
  title: string;
  platform: ContentRecordingPlatform;
  upload_date: string;
  link: string;
  source_post_id: string | null;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}
