"use client";

import React, { useActionState } from "react";
import { Alert, Box, TextField, Button, Stack } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

interface ReplyActionState {
  error: string | null;
  success: boolean;
}

const initialReplyActionState: ReplyActionState = {
  error: null,
  success: false,
};

interface ReplyBoxProps {
  sendReplyAction: (
    state: ReplyActionState,
    formData: FormData,
  ) => Promise<ReplyActionState>;
}

export default function ReplyBox({ sendReplyAction }: ReplyBoxProps) {
  const [state, formAction, isPending] = useActionState(
    sendReplyAction,
    initialReplyActionState,
  );

  return (
    <Box sx={{ mt: 4, borderTop: "1px solid #eee" }}>
      <Stack spacing={2} component="form" action={formAction}>
        {state.error ? <Alert severity="error">{state.error}</Alert> : null}
        {state.success ? (
          <Alert severity="success">
            Reply queued. The bot will send it to WhatsApp and retry if it fails.
          </Alert>
        ) : null}
        <TextField
          label="Write a reply..."
          multiline
          rows={4}
          fullWidth
          required
          name="content"
          disabled={isPending}
          sx = {{ backgroundColor: "#f9f9f9", mb: 2 }}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end"}}>
          <Button
            variant="contained"
            endIcon={<SendIcon />}
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Queueing..." : "Send Reply"}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
