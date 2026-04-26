'use client';

import { useActionState } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';

import { adminPalette } from '../lib/adminPalette';

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

export default function CloseTicketButton({ closeTicketAction, isClosed }: CloseTicketButtonProps) {
  const [state, formAction, isPending] = useActionState(closeTicketAction, initialCloseTicketState);

  return (
    <Stack spacing={1.25} component="form" action={formAction}>
      <Box>
        <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: adminPalette.textPrimary }}>
          Status tiket
        </Typography>
        <Typography sx={{ mt: 0.45, fontSize: '0.82rem', lineHeight: 1.6, color: adminPalette.textMuted }}>
          Tutup tiket jika penanganan sudah final dan tidak perlu balasan lanjutan.
        </Typography>
      </Box>

      {state.error ? <Alert severity="error" sx={{ borderRadius: 2.5 }}>{state.error}</Alert> : null}
      {state.success ? <Alert severity="success" sx={{ borderRadius: 2.5 }}>Tiket berhasil ditutup.</Alert> : null}

      {isClosed ? (
        <Alert severity="info" sx={{ borderRadius: 2.5 }}>
          Tiket ini sudah berada pada status closed.
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            type="submit"
            color="error"
            variant="contained"
            disabled={isPending}
            sx={{
              minHeight: 38,
              borderRadius: 2,
              px: 2.2,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
            }}
          >
            {isPending ? 'Menutup tiket...' : 'Tutup tiket'}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
