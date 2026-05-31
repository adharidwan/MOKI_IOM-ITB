'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, IconButton, Snackbar, Tooltip } from '@mui/material';

interface ContentRecordingDownloadInput {
  id: string;
}

interface DownloadManagerContextValue {
  activeDownloadId: string | null;
  cancelDownload: () => void;
  startContentRecordingDownload: (input: ContentRecordingDownloadInput) => Promise<void>;
}

type DownloadMessage = {
  severity: 'success' | 'info' | 'warning' | 'error';
  text: string;
} | null;

const DownloadManagerContext = createContext<DownloadManagerContextValue | null>(null);

function getFileNameFromContentDisposition(value: string | null): string {
  if (!value) {
    return 'media-download';
  }

  const encodedFileName = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFileName) {
    try {
      return decodeURIComponent(encodedFileName);
    } catch {
      return encodedFileName;
    }
  }

  return value.match(/filename="([^"]+)"/i)?.[1] || 'media-download';
}

async function getDownloadErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error || 'Gagal download media.';
  } catch {
    return 'Gagal download media.';
  }
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DownloadProvider({ children }: { children: ReactNode }) {
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [message, setMessage] = useState<DownloadMessage>(null);

  const cancelDownload = useCallback(() => {
    setActiveDownloadId(null);
    setMessage({ severity: 'info', text: 'Download media sudah dikirim ke browser.' });
  }, []);

  const startContentRecordingDownload = useCallback(async (input: ContentRecordingDownloadInput) => {
    if (activeDownloadId) {
      setMessage({ severity: 'warning', text: 'Tunggu download yang sedang berjalan selesai terlebih dahulu.' });
      return;
    }

    setActiveDownloadId(input.id);
    setMessage({ severity: 'info', text: 'Menyiapkan download media...' });

    try {
      const response = await fetch(`/api/admin/content-recordings/${input.id}/download`);
      if (!response.ok) {
        throw new Error(await getDownloadErrorMessage(response));
      }

      const blob = await response.blob();
      const fileName = getFileNameFromContentDisposition(response.headers.get('Content-Disposition'));
      triggerBlobDownload(blob, fileName);
      setMessage({ severity: 'success', text: 'Download media dimulai.' });
    } catch (error) {
      setMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : 'Gagal download media.',
      });
    } finally {
      setActiveDownloadId(null);
    }
  }, [activeDownloadId]);

  const contextValue = useMemo<DownloadManagerContextValue>(
    () => ({
      activeDownloadId,
      cancelDownload,
      startContentRecordingDownload,
    }),
    [activeDownloadId, cancelDownload, startContentRecordingDownload],
  );

  return (
    <DownloadManagerContext.Provider value={contextValue}>
      {children}
      <Snackbar
        open={Boolean(message)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        autoHideDuration={message?.severity === 'info' && activeDownloadId ? null : 5000}
        onClose={(_, reason) => {
          if (reason !== 'clickaway' && !activeDownloadId) {
            setMessage(null);
          }
        }}
      >
        <Alert
          severity={message?.severity || 'info'}
          action={activeDownloadId ? (
            <Tooltip title="Batalkan download" placement="left" arrow>
              <IconButton
                aria-label="Batalkan download"
                color="inherit"
                size="small"
                onClick={cancelDownload}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined}
          sx={{ minWidth: 320 }}
        >
          {message?.text || ''}
        </Alert>
      </Snackbar>
    </DownloadManagerContext.Provider>
  );
}

export function useDownloadManager(): DownloadManagerContextValue {
  const context = useContext(DownloadManagerContext);

  if (!context) {
    throw new Error('useDownloadManager must be used within DownloadProvider.');
  }

  return context;
}
