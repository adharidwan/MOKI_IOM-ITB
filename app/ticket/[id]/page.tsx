// src/app/ticket/[id]/page.tsx
import Link from "next/link";
import {
  Card,
  CardContent,
  Typography,
  Divider,
  Stack,
  Button,
  Alert,
} from "@mui/material";
import ReplyBox from "../../components/ReplyBox";
import CloseTicketButton from "../../components/CloseTicketButton";
import { getTicketById } from "../../lib/api";
import { Reply } from "../../lib/types";
import { closeTicket, submitTicketReply } from "./actions";

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
  const isClosed = ticket.status === "Closed";
  const sendReplyAction = submitTicketReply.bind(null, id);
  const closeTicketAction = closeTicket.bind(null, id);

  return (
    <Stack spacing={3} sx={{ mt:5, p: 4, backgroundColor: "#EDF7BD", minHeight: "70vh", width: "80%", alignSelf: "center", borderRadius: 2, mx: "auto" }}>
      <Card elevation={3}>
        <CardContent>
          <Typography variant="h5">{ticket.subject}</Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {id} | From: {ticket.phone_number || ticket.user_email || "-"} | Status: {ticket.status}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Typography variant="body1">{ticket.description}</Typography>
        </CardContent>
      </Card>

      {ticket.replies.map((reply: Reply) => (
        <Card key={reply.id} variant="outlined" sx={{ ml: 4 }}>
          <CardContent>
            <Typography variant="subtitle2" color="primary">
              {reply.author} {reply.delivery_status === "failed" ? "(send failed)" : ""}
            </Typography>
            <Typography variant="body2">{reply.content}</Typography>
          </CardContent>
        </Card>
      ))}

      <CloseTicketButton closeTicketAction={closeTicketAction} isClosed={isClosed} />

      {isClosed ? (
        <Alert severity="info">Replies are disabled for closed tickets.</Alert>
      ) : (
        <ReplyBox sendReplyAction={sendReplyAction} />
      )}

      <Link href="/ticket" style={{ textDecoration: "none", width: "fit-content" }}>
        <Button
          variant="outlined"
          sx={{
            color: "black", // Text color
            borderColor: "black", // Outline color
            backgroundColor: "transparent", // Transparent inside
            "&:hover": {
              borderColor: "#e0e0e0", // Light grey on hover
              backgroundColor: "rgba(255, 255, 255, 0.08)", // Faint white tint on hover
            },
          }}
        >
          Go Back
        </Button>
      </Link>
    </Stack>
  );
}
