"use client";

import Link from "next/link";
import { Box, Button, Stack, Typography } from "@mui/material";
import Groups2RoundedIcon from "@mui/icons-material/Groups2Rounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ManageSearchRoundedIcon from "@mui/icons-material/ManageSearchRounded";
import VideoLibraryRoundedIcon from "@mui/icons-material/VideoLibraryRounded";

import { adminPalette } from "../lib/adminPalette";

interface AdminFeatureShellProps {
  title: string;
  description: string;
  currentPath:
    | "/contacts"
    | "/group"
    | "/blastmessage"
    | "/scrape"
    | "/content-record";
  badge?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  {
    href: "/contacts" as const,
    label: "Contacts",
    icon: <PeopleAltRoundedIcon sx={{ fontSize: 18 }} />,
  },
  {
    href: "/group" as const,
    label: "Groups",
    icon: <Groups2RoundedIcon sx={{ fontSize: 18 }} />,
  },
  {
    href: "/blastmessage" as const,
    label: "Blast",
    icon: <SendRoundedIcon sx={{ fontSize: 18 }} />,
  },
  {
    href: "/scrape" as const,
    label: "Scrape",
    icon: <ManageSearchRoundedIcon sx={{ fontSize: 18 }} />,
  },
  {
    href: "/content-record" as const,
    label: "Record",
    icon: <VideoLibraryRoundedIcon sx={{ fontSize: 18 }} />,
  },
];

export default function AdminFeatureShell({
  title,
  description,
  currentPath,
  badge,
  actions,
  children,
}: AdminFeatureShellProps) {
  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: adminPalette.canvas }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "80px minmax(0, 1fr)" },
          gridTemplateRows: {
            xs: "60px auto minmax(0, 1fr)",
            lg: "60px minmax(0, 1fr)",
          },
          minHeight: "100vh",
        }}
      >
        <Box
          component="aside"
          sx={{
            display: { xs: "none", lg: "flex" },
            position: "sticky",
            top: 0,
            gridColumn: "1 / 2",
            gridRow: "1 / 3",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            backgroundColor: adminPalette.sidebarRail,
            borderRight: "1px solid rgba(4, 1, 1, 0.08)",
          }}
        >
          <Box
            sx={{
              width: "100%",
              height: 60,
              px: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: adminPalette.sidebarRailDarker,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.8rem",
                fontWeight: 800,
                letterSpacing: "0.12em",
                color: "#ffffff",
                textAlign: "center",
              }}
            >
              LOGO
            </Typography>
          </Box>

          <Stack spacing={0} sx={{ width: "100%", py: 1 }}>
            {NAV_ITEMS.map((item) => {
              const active = item.href === currentPath;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ textDecoration: "none" }}
                >
                  <Box
                    sx={{
                      px: 0.5,
                      py: 1.05,
                      backgroundColor: active
                        ? adminPalette.sidebarActive
                        : "transparent",
                      color: active
                        ? adminPalette.textPrimary
                        : adminPalette.sidebarRailText,
                      textAlign: "center",
                      transition:
                        "background-color 120ms ease, color 120ms ease",
                      "&:hover": {
                        backgroundColor: active
                          ? adminPalette.sidebarActive
                          : "rgba(255,255,255,0.08)",
                      },
                      "& .MuiSvgIcon-root": {
                        fontSize: 20,
                      },
                    }}
                  >
                    <Box sx={{ display: "grid", placeItems: "center" }}>
                      {item.icon}
                    </Box>
                    <Typography
                      sx={{
                        mt: 0.55,
                        fontSize: "0.62rem",
                        lineHeight: 1.15,
                        fontWeight: 700,
                        color: "inherit",
                      }}
                    >
                      {item.label}
                    </Typography>
                  </Box>
                </Link>
              );
            })}
          </Stack>
        </Box>

        <Box
          component="header"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            gridColumn: { xs: "1 / 2", lg: "2 / 4" },
            gridRow: "1 / 2",
            height: 60,
            px: { xs: 2, md: 3 },
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: adminPalette.topNav,
            color: "#ffffff",
            borderBottom: `1px solid ${adminPalette.brand}`,
          }}
        >
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Typography
              sx={{
                fontSize: "0.95rem",
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              OKI IOM
            </Typography>
          </Stack>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              backgroundColor: "rgba(255,255,255,0.14)",
            }}
          >
            <NotificationsNoneRoundedIcon sx={{ fontSize: 18 }} />
            <Typography
              sx={{
                display: { xs: "none", sm: "block" },
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "inherit",
              }}
            >
              Notifications
            </Typography>
          </Box>
        </Box>

        <Stack
          sx={{
            minWidth: 0,
            minHeight: 0,
            gridColumn: { xs: "1 / 2", lg: "2 / 3" },
            gridRow: { xs: "3 / 4", lg: "2 / 3" },
          }}
        >
          <Box
            sx={{
              display: { xs: "block", lg: "none" },
              gridRow: "2 / 3",
              backgroundColor: adminPalette.surfaceSoft,
              borderBottom: `1px solid ${adminPalette.border}`,
            }}
          >
            <Stack spacing={1.5} sx={{ px: 2, py: 2 }}>
              <Box>
                <Typography
                  sx={{
                    fontSize: "0.64rem",
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: adminPalette.textMuted,
                  }}
                >
                  {badge || "Workspace"}
                </Typography>
                <Typography
                  component="h1"
                  sx={{
                    mt: 0.7,
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: adminPalette.textPrimary,
                  }}
                >
                  {title}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.85,
                    fontSize: "0.88rem",
                    lineHeight: 1.55,
                    color: adminPalette.textSecondary,
                  }}
                >
                  {description}
                </Typography>
              </Box>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {NAV_ITEMS.map((item) => {
                  const active = item.href === currentPath;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{ textDecoration: "none" }}
                    >
                      <Button
                        variant={active ? "contained" : "outlined"}
                        size="small"
                        sx={{
                          minHeight: 32,
                          minWidth: 0,
                          borderRadius: 1.5,
                          textTransform: "none",
                          fontWeight: 700,
                          boxShadow: "none",
                          borderColor: adminPalette.borderStrong,
                          color: active
                            ? "#ffffff"
                            : adminPalette.textSecondary,
                          backgroundColor: active
                            ? adminPalette.brand
                            : adminPalette.surface,
                          "&:hover": {
                            boxShadow: "none",
                            backgroundColor: active
                              ? adminPalette.brandDark
                              : adminPalette.brandSoft,
                            borderColor: active
                              ? adminPalette.brandDark
                              : adminPalette.brandSoftStrong,
                          },
                        }}
                      >
                        {item.label}
                      </Button>
                    </Link>
                  );
                })}
              </Stack>

              {actions ? <Box>{actions}</Box> : null}
            </Stack>
          </Box>

          <Box sx={{ minWidth: 0, px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
            {children}
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
