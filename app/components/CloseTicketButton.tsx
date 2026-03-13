"use client";

import { useActionState } from "react";
import { Alert, Box, Button, Stack } from "@mui/material";

interface CloseTicketActionState {
  error: string | null;
  success: boolean;
}

const initialCloseTicketState: CloseTicketActionState = {
  error: null,
  success: false,
};

interface CloseTicketButtonProps {
  closeTicketAction: (
    state: CloseTicketActionState,
    formData: FormData,
  ) => Promise<CloseTicketActionState>;
  isClosed: boolean;
}

export default function CloseTicketButton({
  closeTicketAction,
  isClosed,
}: CloseTicketButtonProps) {
  const [state, formAction, isPending] = useActionState(
    closeTicketAction,
    initialCloseTicketState,
  );

  if (isClosed) {
    return <Alert severity="info">This ticket is already closed.</Alert>;
  }

  return (
    <Stack spacing={1.5} component="form" action={formAction}>
      {state.error ? <Alert severity="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert severity="success">Ticket closed successfully.</Alert>
      ) : null}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button type="submit" color="error" variant="contained" disabled={isPending}>
          {isPending ? "Closing..." : "Close Ticket"}
        </Button>
      </Box>
    </Stack>
  );
}
