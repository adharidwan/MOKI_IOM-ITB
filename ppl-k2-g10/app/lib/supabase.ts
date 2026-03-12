import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: 'Open' | 'Closed' | 'In Progress';
  user_email: string;
  created_at: string;
}

export interface Reply {
  id: string;
  ticket_id: string;
  author: string;
  content: string;
  created_at: string;
}

export interface TicketWithReplies extends Ticket {
  replies: Reply[];
}
