'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Alert, Box, Button, Collapse, IconButton, Stack } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import { adminPalette } from '../lib/adminPalette';
import { useSso } from './SsoProvider';

interface AdminNotificationEvent {
  id: string;
  title: string;
  message: string;
  occurredAt: string;
  href: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

interface NotificationResponse {
  events?: AdminNotificationEvent[];
  cursor?: string;
}

const POLL_INTERVAL_MS = 30_000;
const INITIAL_LOOKBACK_MS = 5 * 60 * 1000;
const AUTO_DISMISS_MS = 5_000;
const MAX_VISIBLE_NOTIFICATIONS = 5;
const STORAGE_CURSOR_KEY = 'iom4-admin-notification-cursor';
const SEVERITY_ACCENT: Record<AdminNotificationEvent['severity'], string> = {
  info: adminPalette.sidebarAccent,
  success: adminPalette.successBorder,
  warning: adminPalette.warningBorder,
  error: adminPalette.dangerBorder,
};

export default function AdminNotificationCenter() {
  const pathname = usePathname();
  const router = useRouter();
  const { roles, features } = useSso();
  const [queue, setQueue] = useState<AdminNotificationEvent[]>([]);
  const [hasCursor, setHasCursor] = useState(false);
  const cursorRef = useRef<string | null>(null);
  const pollingRef = useRef(false);
  const canReceiveNotifications =
    roles.includes('admin') ||
    features.some((feature) => feature === 'ticket' || feature === 'blast' || feature === 'whatsapp');

  useEffect(() => {
    if (!canReceiveNotifications || pathname === '/sso/login') {
      return;
    }

    const storedCursor = window.localStorage.getItem(STORAGE_CURSOR_KEY);
    const initialCursor = storedCursor || new Date(Date.now() - INITIAL_LOOKBACK_MS).toISOString();
    window.localStorage.setItem(STORAGE_CURSOR_KEY, initialCursor);
    cursorRef.current = initialCursor;
    setHasCursor(true);
  }, [canReceiveNotifications, pathname]);

  const pollNotifications = useCallback(async () => {
    const currentCursor = cursorRef.current;

    if (!currentCursor || !canReceiveNotifications || pathname === '/sso/login' || pollingRef.current) {
      return;
    }

    pollingRef.current = true;

    try {
      const response = await fetch(`/api/admin/notifications?since=${encodeURIComponent(currentCursor)}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json().catch(() => null)) as NotificationResponse | null;
      const nextCursor = typeof payload?.cursor === 'string' ? payload.cursor : new Date().toISOString();
      const nextEvents = Array.isArray(payload?.events) ? payload.events : [];

      if (nextEvents.length) {
        setQueue((currentQueue) => {
          const existingIds = new Set(currentQueue.map((event) => event.id));
          return [
            ...currentQueue,
            ...nextEvents.filter((event) => !existingIds.has(event.id)),
          ];
        });

        if (pathname.startsWith('/ticket') || pathname.startsWith('/whatsapp') || pathname.startsWith('/blastmessage')) {
          router.refresh();
        }
      }

      window.localStorage.setItem(STORAGE_CURSOR_KEY, nextCursor);
      cursorRef.current = nextCursor;
    } finally {
      pollingRef.current = false;
    }
  }, [canReceiveNotifications, pathname, router]);

  useEffect(() => {
    if (!hasCursor || !canReceiveNotifications || pathname === '/sso/login') {
      return;
    }

    void pollNotifications();
    const intervalId = window.setInterval(() => {
      void pollNotifications();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [canReceiveNotifications, hasCursor, pathname, pollNotifications]);

  const removeNotification = (eventId: string) => {
    setQueue((currentQueue) => currentQueue.filter((event) => event.id !== eventId));
  };

  useEffect(() => {
    if (!queue.length) {
      return;
    }

    const timeoutIds = queue.map((event) =>
      window.setTimeout(() => {
        removeNotification(event.id);
      }, AUTO_DISMISS_MS),
    );

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [queue]);

  if (!queue.length) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 76,
        right: { xs: 16, sm: 24 },
        zIndex: (theme) => theme.zIndex.snackbar,
        width: 'min(430px, calc(100vw - 32px))',
        pointerEvents: 'none',
      }}
    >
      <Stack spacing={1} sx={{ pointerEvents: 'auto' }}>
        {queue.slice(0, MAX_VISIBLE_NOTIFICATIONS).map((event) => (
          <Collapse key={event.id} in timeout={180}>
            <Alert
              severity={event.severity}
              variant="filled"
              icon={false}
              action={
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      removeNotification(event.id);
                      router.push(event.href);
                    }}
                    sx={{
                      borderRadius: 1.5,
                      color: '#ffffff',
                      fontWeight: 800,
                      textTransform: 'none',
                      '&:hover': {
                        backgroundColor: 'rgba(255,255,255,0.14)',
                      },
                    }}
                  >
                    Buka
                  </Button>
                  <IconButton
                    size="small"
                    aria-label="Tutup notifikasi"
                    onClick={() => removeNotification(event.id)}
                    sx={{
                      color: adminPalette.sidebarRailText,
                      '&:hover': {
                        backgroundColor: 'rgba(255,255,255,0.12)',
                      },
                    }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Stack>
              }
              sx={{
                width: '100%',
                borderRadius: 2,
                border: `1px solid rgba(255,255,255,0.18)`,
                borderLeft: `5px solid ${SEVERITY_ACCENT[event.severity]}`,
                backgroundColor: `${adminPalette.sidebarRail} !important`,
                color: adminPalette.sidebarRailText,
                boxShadow: '0 18px 40px rgba(0, 43, 115, 0.28)',
                '& .MuiAlert-message': {
                  minWidth: 0,
                  pr: 0.5,
                  color: 'inherit',
                },
                '& .MuiAlert-action': {
                  alignItems: 'center',
                  color: 'inherit',
                },
              }}
            >
              <strong>{event.title}</strong>
              <br />
              {event.message}
            </Alert>
          </Collapse>
        ))}
      </Stack>
    </Box>
  );
}
