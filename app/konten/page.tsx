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
import InstagramScraper from "../components/ScrapeIG";

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
          {platforms.map((platform) => (
            <Tooltip title={platform.name} key={platform.id}>
              <IconButton
                onClick={() => setActivePlatform(platform.id as Platform)}
                sx={{
                  transition: "0.3s",
                  transform:
                    activePlatform === platform.id ? "scale(1.2)" : "scale(1)",
                }}
              >
                <Avatar
                  sx={{
                    bgcolor:
                      activePlatform === platform.id ? platform.color : "#e0e0e0",
                    width: 56,
                    height: 56,
                    boxShadow:
                      activePlatform === platform.id
                        ? `0 0 15px ${platform.color}66`
                        : "none",
                  }}
                >
                  {platform.icon}
                </Avatar>
              </IconButton>
            </Tooltip>
          ))}
        </Box>

        <Divider sx={{ mb: 4 }} />

        <Box sx={{ mt: 2 }}>
          {activePlatform === "youtube" && <YouTubeScraper />}
          {activePlatform === "instagram" && <InstagramScraper />}
          {activePlatform === "twitter" && <XScraper />}
        </Box>
      </Paper>
    </Container>
  );
}
