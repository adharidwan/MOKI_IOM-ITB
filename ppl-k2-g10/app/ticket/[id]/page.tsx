// src/app/ticket/[id]/page.tsx
import Link from "next/link";
import {
  Card,
  CardContent,
  Typography,
  Divider,
  Stack,
  Button,
} from "@mui/material";
import ReplyBox from "../../components/ReplyBox";
import { getTicketById } from "../../lib/api";

// 1. Update the type: params is now a Promise
type Props = {
  params: Promise<{ id: string }>;
};

export default async function TicketDetail({ params }: Props) {
  // 2. Await the params object before using it
  const resolvedParams = await params;
  const id = resolvedParams.id;

  // 3. Now fetch the data
  const ticket = await getTicketById(id);

  return (
    <Stack spacing={3} sx={{ p: 4 }}>
      <Card elevation={3}>
        <CardContent>
          <Typography variant="h5">{ticket.subject}</Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {id} | From: {ticket.userEmail} | Status: {ticket.status}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body1">{ticket.description}</Typography>
        </CardContent>
      </Card>

      {ticket.replies.map((reply: any) => (
        <Card key={reply.id} variant="outlined" sx={{ ml: 4 }}>
          <CardContent>
            <Typography variant="subtitle2" color="primary">
              {reply.author}
            </Typography>
            <Typography variant="body2">{reply.content}</Typography>
          </CardContent>
        </Card>
      ))}

      <ReplyBox ticketId={id} />
      <Link href="/ticket" style={{ textDecoration: "none" }}>
        <Button variant="outlined">Go Back</Button>
      </Link>
    </Stack>
  );
}
