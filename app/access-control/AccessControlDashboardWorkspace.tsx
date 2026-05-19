"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import {
  adminMetricLabelSx,
  adminMetricTileSx,
  adminMetricValueSx,
  adminPalette,
  adminPanelSx,
} from "../lib/adminPalette";
import type { AccessControlOverview, FeatureKey, ManagedAccessUser } from "../lib/access-control";

interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
}

interface AccessControlDashboardWorkspaceProps {
  users: ManagedAccessUser[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  overview: AccessControlOverview;
  features: readonly FeatureDefinition[];
  currentSearch: string;
  currentFeatureKey: string;
  initialLoadError?: string | null;
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={adminMetricTileSx}>
      <Typography sx={adminMetricLabelSx}>{label}</Typography>
      <Typography sx={adminMetricValueSx}>{value}</Typography>
    </Box>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function setOptionalParam(params: URLSearchParams, key: string, value: string) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function toUrl(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

const FEATURE_ACCESS_CHIP_SX = {
  color: adminPalette.brandDark,
  backgroundColor: adminPalette.brandSoft,
  fontWeight: 700,
} as const;

const FEATURE_ACCESS_TOOLTIP_SLOT_PROPS = {
  tooltip: {
    sx: {
      maxWidth: 360,
      p: 1,
      borderRadius: 2,
      backgroundColor: adminPalette.surface,
      color: adminPalette.textPrimary,
      border: `1px solid ${adminPalette.border}`,
      boxShadow: "0 18px 45px rgba(15, 23, 42, 0.18)",
    },
  },
  arrow: {
    sx: {
      color: adminPalette.surface,
      "&::before": {
        border: `1px solid ${adminPalette.border}`,
      },
    },
  },
} as const;

export default function AccessControlDashboardWorkspace({
  users,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  overview,
  features,
  currentSearch,
  currentFeatureKey,
  initialLoadError,
}: AccessControlDashboardWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState({
    search: currentSearch,
    featureKey: currentFeatureKey,
  });
  const activeFilterCount = [currentSearch, currentFeatureKey].filter(Boolean).length;
  const featureByKey = useMemo(() => new Map(features.map((feature) => [feature.key, feature])), [features]);

  useEffect(() => {
    const delay = setTimeout(() => {
      if (filters.search === currentSearch && filters.featureKey === currentFeatureKey) {
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      setOptionalParam(params, "search", filters.search.trim());
      setOptionalParam(params, "featureKey", filters.featureKey);
      params.set("page", "1");
      router.replace(toUrl(pathname, params));
    }, 300);

    return () => clearTimeout(delay);
  }, [currentFeatureKey, currentSearch, filters, pathname, router, searchParams]);

  function updateQuery(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    router.replace(toUrl(pathname, params));
  }

  function clearFilters() {
    setFilters({ search: "", featureKey: "" });
    updateQuery((params) => {
      params.delete("search");
      params.delete("featureKey");
      params.set("page", "1");
    });
  }

  return (
    <Stack spacing={1.25}>
      {initialLoadError ? <Alert severity="warning">{initialLoadError}</Alert> : null}

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack spacing={1.25} sx={{ px: { xs: 1.5, md: 2 }, py: { xs: 1.4, md: 1.6 } }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: "flex-start", lg: "center" }}>
            <Box>
              <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: adminPalette.brand }}>
                Access Control
              </Typography>
              <Typography component="h2" sx={{ mt: 0.7, fontSize: { xs: "1.35rem", md: "1.6rem" }, fontWeight: 700, lineHeight: 1.1, color: adminPalette.textPrimary }}>
                Role Access Dashboard
              </Typography>
              <Typography sx={{ mt: 0.55, fontSize: "0.8rem", color: adminPalette.textMuted }}>
                Pantau akun SSO dan buka detail akun untuk mengubah akses fitur.
              </Typography>
            </Box>

            <AdminPanelSettingsRoundedIcon sx={{ display: { xs: "none", lg: "block" }, color: adminPalette.brand, fontSize: 34 }} />
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 1, sm: 0.5 }} useFlexGap>
            <MetricTile label="Total users" value={overview.totalUsers} />
            <MetricTile label="Admin" value={overview.adminUsers} />
            <MetricTile label="Non-admin" value={overview.nonAdminUsers} />
            <MetricTile label="With access" value={overview.usersWithAccess} />
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={adminPanelSx}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={1} alignItems={{ xs: "stretch", lg: "center" }} sx={{ p: { xs: 1.5, md: 2 } }}>
          <TextField
            size="small"
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search name, email, or SSO subject"
            sx={{ flex: 1, minWidth: { lg: 280 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: adminPalette.textMuted }} /></InputAdornment> }}
          />
          <TextField
            select
            size="small"
            label="Feature access"
            value={filters.featureKey}
            onChange={(event) => setFilters((current) => ({ ...current, featureKey: event.target.value }))}
            sx={{ minWidth: { xs: "100%", sm: 220 } }}
          >
            <MenuItem value="">All features</MenuItem>
            {features.map((feature) => <MenuItem key={feature.key} value={feature.key}>{feature.label}</MenuItem>)}
          </TextField>
          {activeFilterCount > 0 ? <Button onClick={clearFilters} sx={{ color: adminPalette.textSecondary, textTransform: "none", fontWeight: 700 }}>Clear filters</Button> : null}
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ ...adminPanelSx, overflow: "hidden" }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.4, borderBottom: `1px solid ${adminPalette.border}` }}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 800, color: adminPalette.textPrimary }}>SSO Accounts</Typography>
          <Typography sx={{ mt: 0.3, fontSize: "0.84rem", color: adminPalette.textSecondary }}>{totalCount} accounts total, page {currentPage} of {totalPages}</Typography>
        </Box>

        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead sx={{ backgroundColor: adminPalette.brand }}>
              <TableRow>
                <TableCell sx={{ color: "#ffffff", fontWeight: 800 }}>Account</TableCell>
                <TableCell sx={{ color: "#ffffff", fontWeight: 800 }}>Roles</TableCell>
                <TableCell sx={{ color: "#ffffff", fontWeight: 800 }}>Feature Access</TableCell>
                <TableCell sx={{ color: "#ffffff", fontWeight: 800 }}>Last Login</TableCell>
                <TableCell align="right" sx={{ color: "#ffffff", fontWeight: 800 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 6, textAlign: "center" }}>
                    <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary }}>{totalCount === 0 ? "Belum ada akun SSO tercatat." : "Tidak ada akun yang cocok."}</Typography>
                    <Typography sx={{ mt: 0.8, color: adminPalette.textSecondary }}>{totalCount === 0 ? "Akun akan muncul setelah login pertama kali." : "Coba ubah pencarian atau hapus filter aktif."}</Typography>
                  </TableCell>
                </TableRow>
              ) : users.map((user) => {
                const isAdmin = user.roles.includes("admin");
                const grantedFeatures = isAdmin
                  ? features
                  : user.features.map((key) => featureByKey.get(key)).filter(Boolean);
                const visibleFeatures = grantedFeatures.slice(0, 3);
                const hiddenFeatureCount = Math.max(0, grantedFeatures.length - 3);

                return (
                  <TableRow key={user.sub} hover>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Typography sx={{ fontWeight: 800, color: adminPalette.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.name || user.email || user.sub}
                      </Typography>
                      <Typography sx={{ mt: 0.35, fontSize: "0.78rem", color: adminPalette.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.email || user.sub}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {user.roles.length ? user.roles.map((role) => (
                          <Chip
                            key={role}
                            size="small"
                            label={role}
                            sx={{
                              fontWeight: 700,
                              backgroundColor: role === "admin" ? adminPalette.brandSoft : adminPalette.surfaceSoft,
                              color: role === "admin" ? adminPalette.brandDark : adminPalette.textSecondary,
                              border: `1px solid ${role === "admin" ? adminPalette.brandSoftStrong : adminPalette.border}`,
                            }}
                          />
                        )) : <Chip size="small" label="No role" sx={{ color: adminPalette.warningText, backgroundColor: adminPalette.warningBg }} />}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 360 }}>
                      <Tooltip
                        title={
                          grantedFeatures.length ? (
                            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                              {grantedFeatures.map((feature) => feature ? (
                                <Chip key={feature.key} size="small" label={feature.label} sx={FEATURE_ACCESS_CHIP_SX} />
                              ) : null)}
                            </Stack>
                          ) : "Akun ini belum punya feature access."
                        }
                        placement="top"
                        arrow
                        slotProps={FEATURE_ACCESS_TOOLTIP_SLOT_PROPS}
                      >
                        <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ display: "inline-flex" }}>
                          {isAdmin ? <Chip size="small" label="All features" sx={{ color: adminPalette.successText, backgroundColor: adminPalette.successBg }} /> : null}
                          {!isAdmin && user.features.length === 0 ? <Chip size="small" label="No feature access" sx={{ color: adminPalette.warningText, backgroundColor: adminPalette.warningBg }} /> : null}
                          {!isAdmin ? visibleFeatures.map((feature) => feature ? (
                            <Chip key={feature.key} size="small" label={feature.label} sx={FEATURE_ACCESS_CHIP_SX} />
                          ) : null) : null}
                          {hiddenFeatureCount > 0 ? <Chip size="small" label={`+${hiddenFeatureCount}`} variant="outlined" sx={{ borderColor: adminPalette.borderStrong, color: adminPalette.textMuted, fontWeight: 700 }} /> : null}
                        </Stack>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ color: adminPalette.textSecondary, fontWeight: 700 }}>{formatDateTime(user.lastSeenAt)}</TableCell>
                    <TableCell align="right">
                      <Button
                        component={Link}
                        href={`/access-control/${encodeURIComponent(user.sub)}`}
                        size="small"
                        variant="outlined"
                        endIcon={<ChevronRightRoundedIcon />}
                        sx={{ borderRadius: 2, textTransform: "none", fontWeight: 800, borderColor: adminPalette.borderStrong, color: adminPalette.textSecondary }}
                      >
                        Detail
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={Math.max(0, currentPage - 1)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_, nextPage) => updateQuery((params) => params.set("page", String(nextPage + 1)))}
          onRowsPerPageChange={(event) => updateQuery((params) => {
            params.set("pageSize", event.target.value);
            params.set("page", "1");
          })}
        />
      </Paper>
    </Stack>
  );
}
