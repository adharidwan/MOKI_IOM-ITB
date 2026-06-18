import Link from "next/link";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";

import { adminPalette } from "../lib/adminPalette";
import {
  FEATURE_DEFINITIONS,
  getCurrentUserFromCookies,
  getGrantedFeaturesForUser,
  isAdminRole,
} from "../lib/access-control";

export default async function AccessDeniedPage() {
  const user = await getCurrentUserFromCookies();

  let hasAccessibleFeature = false;
  let dashboardHref = "/";

  if (isAdminRole(user.roles)) {
    hasAccessibleFeature = true;
  } else {
    const features = await getGrantedFeaturesForUser(user);
    const firstFeature = FEATURE_DEFINITIONS.find((f) => features.includes(f.key));
    if (firstFeature) {
      hasAccessibleFeature = true;
      dashboardHref = firstFeature.path;
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        backgroundColor: adminPalette.canvas,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "min(100%, 520px)",
          p: 3,
          borderRadius: 2.5,
          border: `1px solid ${adminPalette.border}`,
        }}
      >
        <Stack spacing={1.5}>
          <Typography
            sx={{
              fontSize: "1.45rem",
              fontWeight: 800,
              color: adminPalette.textPrimary,
            }}
          >
            Akses fitur belum diberikan
          </Typography>
          <Typography sx={{ lineHeight: 1.7, color: adminPalette.textSecondary }}>
            Akun ini berhasil login, tetapi belum memiliki permission untuk membuka fitur tersebut.
            Minta admin untuk mengaktifkan akses dari menu Access Control.
          </Typography>
          {hasAccessibleFeature && (
            <Link href={dashboardHref} style={{ textDecoration: "none" }}>
              <Button
                variant="contained"
                sx={{
                  alignSelf: "flex-start",
                  textTransform: "none",
                  fontWeight: 800,
                  backgroundColor: adminPalette.brand,
                }}
              >
                Kembali ke dashboard
              </Button>
            </Link>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
