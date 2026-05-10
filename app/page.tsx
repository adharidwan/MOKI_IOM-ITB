"use client";

import Link from "next/link";
import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { useSso } from "./components/SsoProvider";

const DASHBOARD_ITEMS = [
  {
    featureKey: "contacts",
    title: "Kontak & Grup",
    description: "Tambah nomor, upload CSV, lalu rapikan penerima ke dalam grup.",
    href: "/contacts",
    buttonLabel: "Buka kontak",
    backgroundColor: "#fffdf8",
    borderColor: "rgba(31, 111, 95, 0.14)",
    buttonVariant: "contained" as const,
    buttonColor: "#1f6f5f",
  },
  {
    featureKey: "scrape",
    title: "Scrape",
    description: "Ambil konten dari channel YouTube, X, dan Instagram lalu pilih item yang ingin disimpan ke content recording.",
    href: "/scrape",
    buttonLabel: "Buka scrape",
    backgroundColor: "#f8fbfa",
    borderColor: "rgba(31, 111, 95, 0.14)",
    buttonVariant: "outlined" as const,
    buttonColor: "#1f6f5f",
  },
  {
    featureKey: "blast",
    title: "Blast Message",
    description: "Pilih penerima, tulis pesan, cek preview, lalu kirim.",
    href: "/blastmessage",
    buttonLabel: "Buka blast message",
    backgroundColor: "#f7faf8",
    borderColor: "rgba(31, 111, 95, 0.14)",
    buttonVariant: "outlined" as const,
    buttonColor: "#1f6f5f",
  },
  {
    featureKey: "whatsapp",
    title: "WhatsApp Operations",
    description: "Pantau status instance, QR, runtime worker, dan antrean outbound WhatsApp.",
    href: "/whatsapp",
    buttonLabel: "Buka WhatsApp",
    backgroundColor: "#f6fbf8",
    borderColor: "rgba(31, 111, 95, 0.14)",
    buttonVariant: "outlined" as const,
    buttonColor: "#1f6f5f",
  },
  {
    featureKey: "content-record",
    title: "Content Library",
    description: "Simpan referensi konten YouTube, X, Instagram, dan website dengan auto-fill dari link.",
    href: "/content-record",
    buttonLabel: "Buka content library",
    backgroundColor: "#fffaf0",
    borderColor: "rgba(217, 167, 84, 0.2)",
    buttonVariant: "outlined" as const,
    buttonColor: "#9a6506",
  },
  {
    featureKey: "content-assets",
    title: "Content Assets",
    description: "Upload dan kelola draft asset image/video per project konten.",
    href: "/content-assets",
    buttonLabel: "Buka content assets",
    backgroundColor: "#f8fafc",
    borderColor: "rgba(0, 55, 147, 0.16)",
    buttonVariant: "outlined" as const,
    buttonColor: "#003793",
  },
];

export default function HomePage() {
  const { roles, features, logout } = useSso();
  const isAdmin = roles.includes("admin");
  const visibleItems = DASHBOARD_ITEMS.filter((item) => isAdmin || features.includes(item.featureKey));

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        background:
          "linear-gradient(180deg, #f8f4e8 0%, #fdfcf8 35%, #eef6f5 100%)",
        py: 4,
      }}
    >
      <Container maxWidth="md">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: 4,
            border: "1px solid rgba(31, 111, 95, 0.14)",
            backgroundColor: "rgba(255,255,255,0.92)",
          }}
        >
          <Stack spacing={3}>
            <Typography
              sx={{
                fontSize: { xs: "2rem", md: "3rem" },
                fontWeight: 800,
                color: "#163020",
              }}
            >
              Pilih menu yang ingin digunakan
            </Typography>
            <Typography
              sx={{ fontSize: "1.1rem", lineHeight: 1.8, color: "#50665d" }}
            >
              Anda bisa mulai dari fitur yang sudah diberikan untuk akun ini.
            </Typography>
            <Button
              variant="outlined"
              onClick={() => {
                void logout();
              }}
              sx={{
                alignSelf: "flex-start",
                borderRadius: 999,
                borderColor: "rgba(31, 111, 95, 0.38)",
                color: "#1f6f5f",
                textTransform: "none",
                fontWeight: 700,
              }}
            >
              Logout
            </Button>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
              }}
            >
              {visibleItems.length ? (
                visibleItems.map((item) => (
                  <Paper
                    key={item.href}
                    elevation={0}
                    sx={{
                      p: 3,
                      borderRadius: 3,
                      border: `1px solid ${item.borderColor}`,
                      backgroundColor: item.backgroundColor,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Typography sx={{ fontSize: "1.4rem", fontWeight: 800, color: "#163020" }}>
                        {item.title}
                      </Typography>
                      <Typography sx={{ fontSize: "1rem", lineHeight: 1.7, color: "#50665d" }}>
                        {item.description}
                      </Typography>
                      <Button
                        component={Link}
                        href={item.href}
                        variant={item.buttonVariant}
                        sx={{
                          alignSelf: "flex-start",
                          minHeight: 56,
                          borderRadius: 999,
                          px: 3.5,
                          borderColor: item.buttonColor,
                          color: item.buttonVariant === "contained" ? "#ffffff" : item.buttonColor,
                          backgroundColor: item.buttonVariant === "contained" ? item.buttonColor : undefined,
                          textTransform: "none",
                          fontWeight: 700,
                        }}
                      >
                        {item.buttonLabel}
                      </Button>
                    </Stack>
                  </Paper>
                ))
              ) : (
                <Paper
                  elevation={0}
                  sx={{ gridColumn: "1 / -1", p: 3, borderRadius: 3, border: "1px solid rgba(31, 111, 95, 0.14)" }}
                >
                  <Typography sx={{ fontSize: "1rem", lineHeight: 1.7, color: "#50665d" }}>
                    Belum ada fitur yang aktif untuk akun ini. Minta admin mengaktifkan akses dari menu Access Control.
                  </Typography>
                </Paper>
              )}
            </Box>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
