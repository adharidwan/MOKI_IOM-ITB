'use client';

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from 'react';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import { Alert, Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';

import { adminPalette } from '../lib/adminPalette';

interface ReplyActionState {
  error: string | null;
  success: boolean;
}

const initialReplyActionState: ReplyActionState = {
  error: null,
  success: false,
};
const MAX_TICKET_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

interface ReplyBoxProps {
  sendReplyAction: (
    state: ReplyActionState,
    formData: FormData,
  ) => Promise<ReplyActionState>;
}

export default function ReplyBox({ sendReplyAction }: ReplyBoxProps) {
  const [imageName, setImageName] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const formRef = useRef<HTMLFormElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
  }, [imagePreviewUrl]);

  const clearImageSelection = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }

    setImageName('');
    setImagePreviewUrl('');
    setImageError('');
  };

  const [state, formAction, isPending] = useActionState(async (prevState: ReplyActionState, formData: FormData) => {
    const result = await sendReplyAction(prevState, formData);

    if (result.success) {
      formRef.current?.reset();
      clearImageSelection();
    }

    return result;
  }, initialReplyActionState);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];

    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }

    if (!file) {
      setImageName('');
      setImagePreviewUrl('');
      setImageError('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      event.currentTarget.value = '';
      setImageName('');
      setImagePreviewUrl('');
      setImageError('Lampiran harus berupa image.');
      return;
    }

    if (file.size > MAX_TICKET_IMAGE_SIZE_BYTES) {
      event.currentTarget.value = '';
      setImageName('');
      setImagePreviewUrl('');
      setImageError('Ukuran image maksimal 10 MB.');
      return;
    }

    setImageName(file.name);
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageError('');
  };

  return (
    <Stack ref={formRef} spacing={1.25} component="form" action={formAction}>
      <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
        Tulis balasan untuk pelanggan. Jika tiket terhubung ke WhatsApp, sistem akan mengantrekan pengiriman dan retry otomatis bila diperlukan.
      </Typography>

      {state.error ? <Alert severity="error" sx={{ borderRadius: 2.5 }}>{state.error}</Alert> : null}
      {imageError ? <Alert severity="error" sx={{ borderRadius: 2.5 }}>{imageError}</Alert> : null}
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
        name="content"
        disabled={isPending}
        placeholder="Tulis balasan yang akan dikirim ke pelanggan. Kosongkan jika hanya mengirim image."
        sx={{ '& .MuiOutlinedInput-root': { backgroundColor: adminPalette.surfaceSoft } }}
      />

      <input
        ref={imageInputRef}
        type="file"
        name="image"
        accept="image/*"
        hidden
        disabled={isPending}
        onChange={handleImageChange}
      />

      {imagePreviewUrl ? (
        <Box sx={{ border: `1px solid ${adminPalette.border}`, borderRadius: 2.5, overflow: 'hidden', backgroundColor: adminPalette.surfaceSoft }}>
          <Box component="img" src={imagePreviewUrl} alt="Preview image balasan" sx={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'contain' }} />
          <Typography sx={{ px: 1.2, py: 0.8, fontSize: '0.8rem', color: adminPalette.textMuted, fontWeight: 700 }}>
            {imageName}
          </Typography>
        </Box>
      ) : null}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Tooltip title={imageName ? 'Ganti image' : 'Tambahkan image'}>
          <span>
            <IconButton
              type="button"
              disabled={isPending}
              onClick={() => imageInputRef.current?.click()}
              aria-label={imageName ? 'Ganti image balasan' : 'Tambahkan image balasan'}
              sx={{ border: `1px solid ${adminPalette.border}`, color: adminPalette.brandDark }}
            >
              <ImageRoundedIcon />
            </IconButton>
          </span>
        </Tooltip>
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
