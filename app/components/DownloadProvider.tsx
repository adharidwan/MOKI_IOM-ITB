'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, IconButton, Snackbar, Tooltip } from '@mui/material';

interface ContentRecordingDownloadInput {
  id: string;
  fallbackFileName: string;
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

function resolveDownloadFileName(contentDisposition: string, fallbackFileName: string): string {
  const encodedFileName = contentDisposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  const quotedFileName = contentDisposition.match(/filename="([^"]+)"/)?.[1];

  return encodedFileName
    ? decodeURIComponent(encodedFileName)
    : quotedFileName || fallbackFileName;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function DownloadProvider({ children }: { children: ReactNode }) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [message, setMessage] = useState<DownloadMessage>(null);

  const cancelDownload = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setActiveDownloadId(null);
    setMessage({ severity: 'info', text: 'Download media dibatalkan.' });
  }, []);

  const startContentRecordingDownload = useCallback(async (input: ContentRecordingDownloadInput) => {
    if (abortControllerRef.current || activeDownloadId) {
      setMessage({ severity: 'warning', text: 'Tunggu download yang sedang berjalan selesai terlebih dahulu.' });
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setActiveDownloadId(input.id);
    setMessage({ severity: 'info', text: 'Menyiapkan download media...' });

    try {
      const response = await fetch(`/api/admin/content-recordings/${input.id}/download`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Gagal download media.');
      }

      const blob = await response.blob();
      const fileName = resolveDownloadFileName(
        response.headers.get('Content-Disposition') || '',
        input.fallbackFileName,
      );

      triggerBrowserDownload(blob, fileName);
      setMessage({ severity: 'success', text: 'Download media dimulai.' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setMessage({
        severity: 'error',
        text: error instanceof Error ? error.message : 'Gagal download media.',
      });
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        setActiveDownloadId(null);
      }
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
