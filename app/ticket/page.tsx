import Link from 'next/link';
import KeyboardBackspaceRoundedIcon from '@mui/icons-material/KeyboardBackspaceRounded';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

import AdminFeatureShell from '../components/AdminFeatureShell';
import TicketTable from '../components/TicketTable';
import { getTickets } from '../lib/api';
import { adminPalette } from '../lib/adminPalette';

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

export default async function TicketDashboard({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const search = (resolvedSearchParams.search as string) || '';
  const rawSort = (resolvedSearchParams.sort as string) || 'updated_at';
  const rawSortDir = (resolvedSearchParams.sortDir as string) || 'desc';
  const sort = rawSort === 'id' || rawSort === 'subject' || rawSort === 'status' ? rawSort : 'updated_at';
  const sortDir = rawSortDir === 'asc' ? 'asc' : 'desc';
  const instanceId = (resolvedSearchParams.instanceId as string) || '';

  const data = await getTickets({ page, search, sort, sortDir, instanceId: instanceId || undefined });
  const openCount = data.tickets.filter((ticket) => ticket.status === 'Open').length;
  const inProgressCount = data.tickets.filter((ticket) => ticket.status === 'In Progress').length;
  const closedCount = data.tickets.filter((ticket) => ticket.status === 'Closed').length;

  return (
    <AdminFeatureShell
      currentPath="/ticket"
      badge="Ticket Desk"
      title="Kelola antrean tiket"
      description="Pantau tiket yang masuk, cari percakapan yang perlu ditindaklanjuti, dan buka detail tiket tanpa kehilangan konteks antrean."
      actions={
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button
              variant="outlined"
              startIcon={<KeyboardBackspaceRoundedIcon />}
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
              Kembali ke dashboard
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
                  Ticket Desk
                </Typography>
                <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: '1.35rem', md: '1.6rem' }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                  Dashboard tiket aktif
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {instanceId ? (
                  <Chip label={`Instance: ${instanceId}`} size="small" sx={{ backgroundColor: adminPalette.brandSoft, color: adminPalette.brandDark, fontWeight: 700 }} />
                ) : (
                  <Chip label="Semua instance" size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
                )}
                <Chip label={`Sort: ${sort} ${sortDir}`} size="small" sx={{ backgroundColor: adminPalette.surfaceSoft, color: adminPalette.textSecondary, fontWeight: 700 }} />
              </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
              <MetricTile label="Total tiket" value={data.total} />
              <MetricTile label="Open di halaman ini" value={openCount} />
              <MetricTile label="In progress" value={inProgressCount} />
              <MetricTile label="Closed" value={closedCount} />
            </Stack>
          </Stack>
        </Paper>

        <TicketTable initialData={data.tickets} totalCount={data.total} />
      </Stack>
    </AdminFeatureShell>
  );
}
