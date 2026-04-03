'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const TOAST_CONFIG: Record<string, { severity: 'success' | 'error'; message: string }> = {
  updated: { severity: 'success', message: 'Data phone list berhasil diupdate.' },
  grouped: { severity: 'success', message: 'Group berhasil diterapkan ke kontak terpilih.' },
  blast_sent: { severity: 'success', message: 'Blast segment berhasil dikirim ke antrian.' },
  blast_empty: { severity: 'error', message: 'Tidak ada kontak yang cocok dengan segment terpilih.' },
  deleted: { severity: 'success', message: 'Data phone list berhasil dihapus.' },
  deleted_bulk: { severity: 'success', message: 'Data phone list terpilih berhasil dihapus.' },
  error: { severity: 'error', message: 'Aksi gagal diproses. Silakan coba lagi.' },
};

export default function PhoneListToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const toastKey = searchParams.get('toast') || '';
  const toastConfig = useMemo(() => TOAST_CONFIG[toastKey], [toastKey]);
  const [open, setOpen] = useState(Boolean(toastConfig));

  useEffect(() => {
    setOpen(Boolean(toastConfig));
  }, [toastConfig]);

  const clearToastQuery = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('toast');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleClose = (_event?: unknown, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }

    setOpen(false);
    clearToastQuery();
  };

  if (!toastConfig) {
    return null;
  }

  return (
    <Snackbar
      open={open}
      autoHideDuration={1000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert onClose={handleClose} severity={toastConfig.severity} variant="filled" sx={{ width: '100%' }}>
        {toastConfig.message}
      </Alert>
    </Snackbar>
  );
}
