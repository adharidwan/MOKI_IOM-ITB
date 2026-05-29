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
const DOWNLOAD_FRAME_NAME = 'content-recording-download-frame';

function ensureDownloadFrame(): HTMLIFrameElement {
  const existingFrame = document.querySelector<HTMLIFrameElement>(`iframe[name="${DOWNLOAD_FRAME_NAME}"]`);
  if (existingFrame) {
    return existingFrame;
  }

  const frame = document.createElement('iframe');
  frame.name = DOWNLOAD_FRAME_NAME;
  frame.hidden = true;
  document.body.appendChild(frame);

  return frame;
}

function triggerBrowserDownload(url: string) {
  const frame = ensureDownloadFrame();
  const link = document.createElement('a');

  link.href = url;
  link.target = frame.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
      triggerBrowserDownload(`/api/admin/content-recordings/${input.id}/download`);
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
