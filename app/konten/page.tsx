"use client";

import { useState } from "react";
import {
  Box,
  Typography,
  Container,
  Paper,
  Avatar,
  Tooltip,
  IconButton,
  Divider,
} from "@mui/material";
import { YouTube, Instagram, X } from "@mui/icons-material";
import YouTubeScraper from "../components/ScrapeYoutube";
import XScraper from "../components/ScrapeX";

type Platform = "youtube" | "instagram" | "twitter";

export default function ContentManagement() {
  const [activePlatform, setActivePlatform] = useState<Platform>("youtube");

  const platforms = [
    { id: "youtube", name: "YouTube", icon: <YouTube />, color: "#ff0000" },
    {
      id: "instagram",
      name: "Instagram",
      icon: <Instagram />,
      color: "#E1306C",
    },
    { id: "twitter", name: "Twitter / X", icon: <X />, color: "#000000" },
  ];

  return (
    <Container maxWidth="md" sx={{ py: 6 }}>
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ p: 4, borderRadius: 4, bgcolor: "#fafafa" }}
      >
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <Typography variant="h4" fontWeight="800" gutterBottom>
            Management Content
          </Typography>
          <Typography color="text.secondary">
            Pilih platform untuk melihat dan mengelola konten IOM ITB
          </Typography>
        </Box>

        {/* Avatar Navigation Box */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            gap: 4,
            mb: 5,
            p: 2,
            bgcolor: "#fff",
            borderRadius: 3,
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
          }}
        >
          {platforms.map((p) => (
            <Tooltip title={p.name} key={p.id}>
              <IconButton
                onClick={() => setActivePlatform(p.id as Platform)}
                sx={{
                  transition: "0.3s",
                  transform:
                    activePlatform === p.id ? "scale(1.2)" : "scale(1)",
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: activePlatform === p.id ? p.color : "#e0e0e0",
                    width: 56,
                    height: 56,
                    boxShadow:
                      activePlatform === p.id
                        ? `0 0 15px ${p.color}66`
                        : "none",
                  }}
                >
                  {p.icon}
                </Avatar>
              </IconButton>
            </Tooltip>
          ))}
        </Box>

        <Divider sx={{ mb: 4 }} />

        {/* Content Area */}
        <Box sx={{ mt: 2 }}>
          {activePlatform === "youtube" && <YouTubeScraper />}

          {activePlatform === "instagram" && (
            <Box sx={{ textAlign: "center", py: 10 }}>
              <Instagram sx={{ fontSize: 60, color: "#e0e0e0", mb: 2 }} />
              <Typography color="text.secondary">
                Modul Instagram masih dalam pengembangan.
              </Typography>
            </Box>
          )}

          {activePlatform === "twitter" && <XScraper />}
        </Box>
      </Paper>
    </Container>
  );
}
