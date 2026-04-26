'use client';

import { useActionState } from 'react';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';

import { adminPalette } from '../lib/adminPalette';

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
  const [state, formAction, isPending] = useActionState(sendReplyAction, initialReplyActionState);

  return (
    <Stack spacing={1.25} component="form" action={formAction}>
      <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
        Tulis balasan untuk pelanggan. Jika tiket terhubung ke WhatsApp, sistem akan mengantrekan pengiriman dan retry otomatis bila diperlukan.
      </Typography>

      {state.error ? <Alert severity="error" sx={{ borderRadius: 2.5 }}>{state.error}</Alert> : null}
      {state.success ? (
        <Alert severity="success" sx={{ borderRadius: 2.5 }}>
          Balasan berhasil masuk ke antrean pengiriman.
        </Alert>
      ) : null}

      <TextField
        label="Isi balasan"
        multiline
        minRows={5}
        fullWidth
        required
        name="content"
        disabled={isPending}
        placeholder="Tulis balasan yang akan dikirim ke pelanggan."
        sx={{ '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surfaceSoft } }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          endIcon={<SendRoundedIcon />}
          type="submit"
          disabled={isPending}
          sx={{
            minHeight: 38,
            borderRadius: 2,
            px: 2.2,
            backgroundColor: adminPalette.brand,
            textTransform: 'none',
            fontWeight: 700,
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: adminPalette.brandDark,
              boxShadow: 'none',
            },
          }}
        >
          {isPending ? 'Mengantrekan...' : 'Kirim balasan'}
        </Button>
      </Box>
    </Stack>
  );
}
