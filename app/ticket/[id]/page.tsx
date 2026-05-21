import Link from 'next/link';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

import AdminFeatureShell from '../../components/AdminFeatureShell';
import CloseTicketButton from '../../components/CloseTicketButton';
import ReplyBox from '../../components/ReplyBox';
import { requireFeatureAccess } from '../../lib/access-control';
import { adminPalette } from '../../lib/adminPalette';
import { getTicketById } from '../../lib/api';
import type { Reply, TicketStatus } from '../../lib/types';
import { closeTicket, submitTicketReply } from './actions';

type Props = {
  params: Promise<{ id: string }>;
};

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

function formatDate(value: string | null) {
  if (!value) {
    return '-';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return dateFormatter.format(parsedDate);
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        px: { xs: 0, sm: 1.4 },
        py: 0.1,
        borderLeft: { sm: `1px solid ${adminPalette.border}` },
        '&:first-of-type': {
          pl: 0,
          borderLeft: 'none',
        },
      }}
    >
      <Typography
        sx={{
          fontSize: '0.63rem',
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: adminPalette.textMuted,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.4,
          fontSize: { xs: '1rem', sm: '1.12rem' },
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          color: adminPalette.brandDark,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function getStatusTone(status: TicketStatus) {
  if (status === 'Open') {
    return {
      backgroundColor: adminPalette.warningBg,
      borderColor: adminPalette.warningBorder,
      color: adminPalette.warningText,
    };
  }

  if (status === 'In Progress') {
    return {
      backgroundColor: adminPalette.brandSoft,
      borderColor: adminPalette.brandSoftStrong,
      color: adminPalette.brandDark,
    };
  }

  if (status === 'Resolved') {
    return {
      backgroundColor: adminPalette.successBg,
      borderColor: adminPalette.successBorder,
      color: adminPalette.successText,
    };
  }

  return {
    backgroundColor: adminPalette.surfaceSoft,
    borderColor: adminPalette.border,
    color: adminPalette.textSecondary,
  };
}

function getReplyTone(reply: Reply) {
  if (reply.sender_type === 'admin') {
    return {
      backgroundColor: adminPalette.brandSoft,
      borderColor: adminPalette.brandSoftStrong,
      color: adminPalette.textPrimary,
      alignSelf: 'flex-end' as const,
    };
  }

  if (reply.sender_type === 'system') {
    return {
      backgroundColor: adminPalette.surfaceSoft,
      borderColor: adminPalette.border,
      color: adminPalette.textSecondary,
      alignSelf: 'center' as const,
    };
  }

  return {
    backgroundColor: adminPalette.surface,
    borderColor: adminPalette.border,
    color: adminPalette.textPrimary,
    alignSelf: 'flex-start' as const,
  };
}

export default async function TicketDetail({ params }: Props) {
  await requireFeatureAccess('ticket');
  const resolvedParams = await params;
  const id = resolvedParams.id;
  const ticket = await getTicketById(id);
  const isClosed = ticket.status === 'Closed';
  const sendReplyAction = submitTicketReply.bind(null, id);
  const closeTicketAction = closeTicket.bind(null, id);
  const statusTone = getStatusTone(ticket.status);
  const replies = [...ticket.replies].sort((left, right) => left.created_at.localeCompare(right.created_at));

  return (
    <AdminFeatureShell
      currentPath="/ticket"
      badge="Ticket Detail"
      title={ticket.subject}
      description="Ringkasan tiket, histori percakapan, dan tindakan admin ditampilkan dalam satu ruang kerja agar penanganan lebih cepat dibaca."
      actions={
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Link href="/ticket" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBackRoundedIcon />}
              sx={{
                minHeight: 36,
                borderRadius: 2,
                borderColor: adminPalette.borderStrong,
                color: adminPalette.textSecondary,
                backgroundColor: adminPalette.surface,
                textTransform: 'none',
                fontWeight: 700,
                '&:hover': {
                  borderColor: adminPalette.brandSoftStrong,
                  backgroundColor: adminPalette.brandSoft,
                },
              }}
            >
              Kembali ke daftar tiket
            </Button>
          </Link>
        </Stack>
      }
    >
      <Stack spacing={1.25}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: `1px solid ${adminPalette.border}`,
            backgroundColor: adminPalette.surface,
            boxShadow: 'none',
          }}
        >
          <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: adminPalette.brand }}>
                  Ticket Detail
                </Typography>
                <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.3rem', md: '1.55rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                  Detail percakapan dan tindak lanjut
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  label={ticket.status}
                  size="small"
                  sx={{ backgroundColor: statusTone.backgroundColor, color: statusTone.color, border: `1px solid ${statusTone.borderColor}`, fontWeight: 700 }}
                />
                <Chip label={`ID ${ticket.id}`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                {ticket.channel ? <Chip label={ticket.channel} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} /> : null}
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Percakapan" value={replies.length} />
              <MetricTile label="Dibuat" value={formatDate(ticket.created_at)} />
              <MetricTile label="Update terakhir" value={formatDate(ticket.updated_at || ticket.created_at)} />
            </Stack>
          </Stack>
        </Paper>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.45fr) minmax(320px, 0.75fr)' },
            gap: 1.25,
            alignItems: 'start',
          }}
        >
            <Paper
              elevation={0}
              sx={{
                overflow: 'hidden',
                borderRadius: 2.5,
                border: `1px solid ${adminPalette.border}`,
                backgroundColor: adminPalette.surface,
                boxShadow: 'none',
              }}
            >
              <Stack spacing={1} sx={{ px: { xs: 1.25, md: 1.5 }, py: 1.2, borderBottom: `1px solid ${adminPalette.border}` }}>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Percakapan tiket</Typography>
                <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textMuted }}>
                  Histori pesan ditampilkan berurutan agar konteks penanganan tetap mudah ditelusuri.
                </Typography>
              </Stack>

              <Stack spacing={1.25} sx={{ p: { xs: 1.25, md: 1.5 } }}>
                <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                  <Stack spacing={1}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                      <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: adminPalette.textPrimary }}>Deskripsi awal tiket</Typography>
                      <Typography sx={{ fontSize: '0.8rem', color: adminPalette.textMuted }}>{formatDate(ticket.created_at)}</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: '0.94rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: adminPalette.textPrimary }}>
                      {ticket.description || 'Tidak ada deskripsi tambahan pada tiket ini.'}
                    </Typography>
                  </Stack>
                </Paper>

                {replies.length > 0 ? (
                  replies.map((reply) => {
                    const tone = getReplyTone(reply);

                    return (
                      <Paper
                        key={reply.id}
                        elevation={0}
                        sx={{
                          width: { xs: '100%', md: 'min(85%, 760px)' },
                          p: 1.5,
                          borderRadius: 2.5,
                          border: `1px solid ${tone.borderColor}`,
                          backgroundColor: tone.backgroundColor,
                          alignSelf: tone.alignSelf,
                          boxShadow: 'none',
                        }}
                      >
                        <Stack spacing={0.85}>
                          <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                              <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: tone.color }}>{reply.author}</Typography>
                              <Chip
                                label={reply.sender_type === 'admin' ? 'Admin' : reply.sender_type === 'customer' ? 'Pelanggan' : 'Sistem'}
                                size="small"
                                sx={{ backgroundColor: adminPalette.surface, color: adminPalette.textSecondary, fontWeight: 700 }}
                              />
                              {reply.delivery_status !== 'not_applicable' ? (
                                <Chip label={reply.delivery_status} size="small" variant="outlined" sx={{ fontWeight: 700 }} />
                              ) : null}
                            </Stack>
                            <Typography sx={{ fontSize: '0.78rem', color: adminPalette.textMuted }}>{formatDate(reply.created_at)}</Typography>
                          </Stack>

                          {reply.media_signed_url ? (
                            reply.media_mime_type?.startsWith('image/') ? (
                              <Box
                                component="img"
                                src={reply.media_signed_url}
                                alt={reply.media_file_name || 'Image lampiran tiket'}
                                sx={{
                                  display: 'block',
                                  width: '100%',
                                  maxHeight: 360,
                                  objectFit: 'contain',
                                  borderRadius: 2,
                                  backgroundColor: adminPalette.surface,
                                  border: `1px solid ${adminPalette.border}`,
                                }}
                              />
                            ) : (
                              <Button
                                component="a"
                                href={reply.media_signed_url}
                                target="_blank"
                                rel="noreferrer"
                                variant="outlined"
                                sx={{ alignSelf: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                              >
                                Buka lampiran {reply.media_file_name || 'media'}
                              </Button>
                            )
                          ) : null}

                          {reply.content ? (
                            <Typography sx={{ fontSize: '0.92rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', color: tone.color }}>
                              {reply.content}
                            </Typography>
                          ) : null}

                          {reply.last_delivery_error ? (
                            <Alert severity="warning" sx={{ borderRadius: 2 }}>
                              Gagal kirim terakhir: {reply.last_delivery_error}
                            </Alert>
                          ) : null}
                        </Stack>
                      </Paper>
                    );
                  })
                ) : (
                  <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                    Belum ada balasan pada tiket ini.
                  </Alert>
                )}
              </Stack>
            </Paper>

          <Stack spacing={1.25}>
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 2.5,
                  border: `1px solid ${adminPalette.border}`,
                  backgroundColor: adminPalette.surface,
                  boxShadow: 'none',
                }}
              >
                <Stack spacing={1.25} sx={{ p: { xs: 1.25, md: 1.5 } }}>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Informasi tiket</Typography>

                  <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                    <Stack spacing={1.1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <PhoneRoundedIcon sx={{ fontSize: 18, color: adminPalette.brandDark }} />
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: adminPalette.textPrimary }}>Kontak</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: '0.88rem', color: adminPalette.textSecondary }}>
                        {ticket.phone_number || ticket.user_email || 'Tidak ada identitas kontak.'}
                      </Typography>
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2.5, backgroundColor: adminPalette.surfaceSoft, border: `1px solid ${adminPalette.border}` }}>
                    <Stack spacing={1.1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 18, color: adminPalette.brandDark }} />
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: adminPalette.textPrimary }}>Metadata</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                        Kanal: {ticket.channel || '-'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                        WhatsApp instance: {ticket.whatsapp_instance_id || '-'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.84rem', color: adminPalette.textSecondary }}>
                        Chat ID: {ticket.whatsapp_chat_id || '-'}
                      </Typography>
                    </Stack>
                  </Paper>

                  <CloseTicketButton closeTicketAction={closeTicketAction} isClosed={isClosed} />
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  borderRadius: 2.5,
                  border: `1px solid ${adminPalette.border}`,
                  backgroundColor: adminPalette.surface,
                  boxShadow: 'none',
                }}
              >
                <Stack spacing={1.25} sx={{ p: { xs: 1.25, md: 1.5 } }}>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: adminPalette.textPrimary }}>Balas tiket</Typography>
                  {isClosed ? (
                    <Alert severity="info" sx={{ borderRadius: 2.5 }}>
                      Tiket sudah ditutup. Balasan baru dinonaktifkan untuk menjaga histori tetap final.
                    </Alert>
                  ) : (
                    <ReplyBox sendReplyAction={sendReplyAction} />
                  )}
                </Stack>
              </Paper>

          </Stack>
        </Box>
      </Stack>
    </AdminFeatureShell>
  );
}
