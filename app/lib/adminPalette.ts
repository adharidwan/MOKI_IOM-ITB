export const adminPalette = {
  brand: '#003793',
  brandDark: '#002b73',
  topNav: '#1d4ed8',
  brandSoft: '#eff6ff',
  brandSoftStrong: '#dbeafe',
  canvas: '#f8fafc',
  surface: '#ffffff',
  surfaceSoft: '#f8fafc',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#64748b',
  textSubtle: '#94a3b8',
  successBg: '#dcfce7',
  successBorder: '#bbf7d0',
  successText: '#16a34a',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  warningText: '#d97706',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  dangerText: '#dc2626',
  sidebarRail: '#003793',
  sidebarRailDarker: '#002b73',
  sidebarRailText: '#eff6ff',
  sidebarRailTextMuted: 'rgba(239, 246, 255, 0.72)',
  sidebarPanel: '#eff6ff',
  sidebarAccent: '#93c5fd',
  sidebarActive: '#dbeafe',
} as const;

export const adminTypographySx = {
  fontFamily: 'var(--font-geist-sans), sans-serif',
} as const;

export const adminPanelSx = {
  borderRadius: 2.5,
  border: `1px solid ${adminPalette.border}`,
  backgroundColor: adminPalette.surface,
  boxShadow: 'none',
} as const;

export const adminSectionLabelSx = {
  fontSize: '0.72rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: adminPalette.textMuted,
} as const;

export const adminMetricTileSx = {
  minWidth: 0,
  px: { xs: 0, sm: 1.4 },
  py: 0.1,
  borderLeft: { sm: `1px solid ${adminPalette.border}` },
  '&:first-of-type': { pl: 0, borderLeft: 'none' },
} as const;

export const adminMetricLabelSx = {
  fontSize: '0.63rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: adminPalette.textMuted,
} as const;

export const adminMetricValueSx = {
  mt: 0.4,
  fontSize: { xs: '1rem', sm: '1.12rem' },
  fontWeight: 700,
  lineHeight: 1,
  color: adminPalette.brandDark,
} as const;

export const adminTableHeaderCellSx = {
  color: '#ffffff',
  fontWeight: 800,
} as const;

export const adminTableSortLabelSx = {
  color: 'inherit',
  borderRadius: 999,
  px: 0.75,
  py: 0.25,
  mx: -0.75,
  transition: 'background-color 160ms ease, box-shadow 160ms ease, color 160ms ease',
  '&:hover': {
    color: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  '& .MuiTableSortLabel-icon': {
    color: 'rgba(255,255,255,0.72) !important',
  },
  '&.Mui-active': {
    color: '#ffffff',
    backgroundColor: 'rgba(147,197,253,0.22)',
    boxShadow: 'inset 0 0 0 1px rgba(191,219,254,0.55)',
  },
  '&.Mui-active .MuiTableSortLabel-icon': {
    color: '#bfdbfe !important',
  },
} as const;
