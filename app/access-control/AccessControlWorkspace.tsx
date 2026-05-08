"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";

import { adminPalette } from "../lib/adminPalette";
import type { FeatureKey, ManagedAccessUser } from "../lib/access-control";

interface FeatureDefinition {
  key: FeatureKey;
  label: string;
  description: string;
}

interface AccessControlWorkspaceProps {
  initialUsers: ManagedAccessUser[];
  features: readonly FeatureDefinition[];
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

export default function AccessControlWorkspace({ initialUsers, features }: AccessControlWorkspaceProps) {
  const [users, setUsers] = useState(initialUsers);
  const [drafts, setDrafts] = useState<Record<string, FeatureKey[]>>(() =>
    Object.fromEntries(initialUsers.map((user) => [user.sub, user.features])),
  );
  const [busySub, setBusySub] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const featureByKey = useMemo(
    () => new Map(features.map((feature) => [feature.key, feature])),
    [features],
  );

  const toggleFeature = (ssoSub: string, featureKey: FeatureKey) => {
    setDrafts((current) => {
      const currentFeatures = current[ssoSub] || [];
      const nextFeatures = currentFeatures.includes(featureKey)
        ? currentFeatures.filter((item) => item !== featureKey)
        : [...currentFeatures, featureKey];

      return { ...current, [ssoSub]: nextFeatures };
    });
  };

  const saveAccess = async (ssoSub: string) => {
    setBusySub(ssoSub);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/access-control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssoSub, features: drafts[ssoSub] || [] }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; features?: FeatureKey[] } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Gagal menyimpan akses.");
      }

      const savedFeatures = payload?.features || [];
      setUsers((current) =>
        current.map((user) => (user.sub === ssoSub ? { ...user, features: savedFeatures } : user)),
      );
      setDrafts((current) => ({ ...current, [ssoSub]: savedFeatures }));
      setMessage({ type: "success", text: "Akses akun berhasil disimpan." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Gagal menyimpan akses.",
      });
    } finally {
      setBusySub(null);
    }
  };

  return (
    <Stack spacing={1.5}>
      {message ? <Alert severity={message.type}>{message.text}</Alert> : null}

      <Paper
        elevation={0}
        sx={{
          borderRadius: 2.5,
          border: `1px solid ${adminPalette.border}`,
          backgroundColor: adminPalette.surface,
          overflow: "hidden",
        }}
      >
        <Stack spacing={1.25} sx={{ p: { xs: 1.5, md: 2 } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AdminPanelSettingsRoundedIcon sx={{ color: adminPalette.brand }} />
            <Box>
              <Typography sx={{ fontSize: "1rem", fontWeight: 800, color: adminPalette.textPrimary }}>
                Daftar akun SSO
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: "0.84rem", color: adminPalette.textSecondary }}>
                Admin selalu memiliki semua akses. Akun non-admin hanya mendapat fitur yang dicentang.
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Paper>

      <Stack spacing={1.25}>
        {users.map((user) => {
          const isAdmin = user.roles.includes("admin");
          const draftFeatures = drafts[user.sub] || [];
          const changed = [...draftFeatures].sort().join("|") !== [...user.features].sort().join("|");

          return (
            <Paper
              key={user.sub}
              elevation={0}
              sx={{
                p: { xs: 1.5, md: 2 },
                borderRadius: 2.5,
                border: `1px solid ${adminPalette.border}`,
                backgroundColor: adminPalette.surface,
              }}
            >
              <Stack spacing={1.5}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={1.25}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", md: "center" }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: "1rem", fontWeight: 800, color: adminPalette.textPrimary }}>
                      {user.name || user.email || user.sub}
                    </Typography>
                    <Typography sx={{ mt: 0.25, fontSize: "0.82rem", color: adminPalette.textMuted }}>
                      {user.email || user.sub}
                    </Typography>
                    <Typography sx={{ mt: 0.25, fontSize: "0.78rem", color: adminPalette.textSubtle }}>
                      Login terakhir: {formatDateTime(user.lastSeenAt)}
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {user.roles.map((role) => (
                      <Chip
                        key={role}
                        size="small"
                        label={role}
                        sx={{
                          fontWeight: 700,
                          backgroundColor: role === "admin" ? adminPalette.brandSoft : adminPalette.surfaceSoft,
                          color: role === "admin" ? adminPalette.brandDark : adminPalette.textSecondary,
                        }}
                      />
                    ))}
                  </Stack>
                </Stack>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" },
                    gap: 1,
                  }}
                >
                  {features.map((feature) => {
                    const enabled = isAdmin || draftFeatures.includes(feature.key);

                    return (
                      <Paper
                        key={feature.key}
                        elevation={0}
                        sx={{
                          p: 1.25,
                          borderRadius: 2,
                          border: `1px solid ${enabled ? adminPalette.brandSoftStrong : adminPalette.border}`,
                          backgroundColor: enabled ? adminPalette.brandSoft : adminPalette.surfaceSoft,
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Switch
                              checked={enabled}
                              disabled={isAdmin || busySub === user.sub}
                              onChange={() => toggleFeature(user.sub, feature.key)}
                            />
                          }
                          label={
                            <Box>
                              <Typography sx={{ fontSize: "0.9rem", fontWeight: 800, color: adminPalette.textPrimary }}>
                                {featureByKey.get(feature.key)?.label || feature.label}
                              </Typography>
                              <Typography sx={{ fontSize: "0.76rem", color: adminPalette.textSecondary }}>
                                {feature.description}
                              </Typography>
                            </Box>
                          }
                          sx={{ alignItems: "flex-start", m: 0, gap: 0.75 }}
                        />
                      </Paper>
                    );
                  })}
                </Box>

                <Button
                  variant="contained"
                  startIcon={<SaveRoundedIcon />}
                  disabled={isAdmin || !changed || busySub === user.sub}
                  onClick={() => void saveAccess(user.sub)}
                  sx={{
                    alignSelf: "flex-start",
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 800,
                    boxShadow: "none",
                    backgroundColor: adminPalette.brand,
                  }}
                >
                  {busySub === user.sub ? "Menyimpan..." : isAdmin ? "Admin otomatis semua akses" : "Simpan akses"}
                </Button>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Stack>
  );
}
