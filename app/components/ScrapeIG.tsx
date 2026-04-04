"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  Divider,
  CircularProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  Checkbox,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Refresh, Checklist, LinkOff } from "@mui/icons-material";
import { scrape_ig } from "@/app/lib/scrape-ig";

interface InstagramPost {
  id: string;
  title: string;
  link: string;
  thumbnail: string;
}

interface InstagramScrapeResult {
  channel?: string;
  videos?: InstagramPost[];
  error?: string;
}

export default function InstagramScraper() {
  const [data, setData] = useState<InstagramScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleScrape = async () => {
    setLoading(true);
    try {
      const result = await scrape_ig("iom_itb.official"); // Ganti sesuai username IOM ITB
      setData(result);
      setSelectedIds([]);
    } catch {
      setData({ error: "Gagal menarik data Instagram." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleScrape();
  }, []);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (data?.videos) {
      if (selectedIds.length === data.videos.length) {
        setSelectedIds([]);
      } else {
        setSelectedIds(data.videos.map((v) => v.id));
      }
    }
  };

  const handleExport = () => {
    const selectedData = data?.videos?.filter((post) =>
      selectedIds.includes(post.id),
    );
    console.log("=== EKSPOR DATA INSTAGRAM (PoC) ===");
    console.log(JSON.stringify(selectedData, null, 2));
    alert(`${selectedIds.length} post Instagram di-log ke Console.`);
  };

  if (loading && !data)
    return (
      <Box sx={{ textAlign: "center", py: 10 }}>
        <CircularProgress sx={{ color: "#E1306C" }} />
        <Typography sx={{ mt: 2 }} color="text.secondary">
          Menghubungi Instagram...
        </Typography>
      </Box>
    );

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<Checklist />}
            onClick={handleSelectAll}
            disabled={!data?.videos || data.videos.length === 0}
          >
            {selectedIds.length === data?.videos?.length &&
            data?.videos?.length !== 0
              ? "Unselect All"
              : "Select All"}
          </Button>
          <Tooltip title="Refresh Data">
            <IconButton
              onClick={handleScrape}
              disabled={loading}
              color="primary"
            >
              <Refresh className={loading ? "animate-spin" : ""} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Button
          variant="contained"
          sx={{ bgcolor: "#E1306C" }}
          disabled={selectedIds.length === 0}
          onClick={handleExport}
        >
          Ekspor ({selectedIds.length})
        </Button>
      </Stack>

      {data && !data.error && (
        <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List sx={{ p: 0, maxHeight: "500px", overflow: "auto" }}>
            {data.videos?.map((post, index) => (
              <Box key={post.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleToggle(post.id)}
                    sx={{ py: 2, alignItems: "center" }}
                  >
                    <ListItemIcon sx={{ minWidth: 48 }}>
                      <Checkbox
                        checked={selectedIds.includes(post.id)}
                        disableRipple
                        edge="start"
                      />
                    </ListItemIcon>

                    <Box
                      sx={{
                        display: "flex",
                        gap: 2,
                        width: "100%",
                        alignItems: "center",
                      }}
                    >
                      <Box
                        component="img"
                        // Gunakan Image Proxy weserv.nl
                        src={
                          post.thumbnail
                            ? `https://images.weserv.nl/?url=${encodeURIComponent(post.thumbnail)}`
                            : "https://via.placeholder.com/100?text=No+Image"
                        }
                        alt={post.title || "Instagram Post"}
                        referrerPolicy="no-referrer" // Tetap biarkan ini untuk keamanan tambahan
                        sx={{
                          width: 100,
                          height: 100,
                          borderRadius: 1,
                          objectFit: "cover",
                          bgcolor: "#e2e8f0", // Beri warna latar belakang saat loading
                        }}
                      />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            lineHeight: 1.3,
                            mb: 0.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {post.title || "Instagram Post"}
                        </Typography>
                        <Typography
                          component="a"
                          href={post.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            fontSize: "0.7rem",
                            color: "#2563eb",
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                            display: "inline-block",
                            maxWidth: "100%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {post.link}
                        </Typography>
                      </Box>
                    </Box>
                  </ListItemButton>
                </ListItem>
                {index < (data.videos?.length || 0) - 1 && <Divider />}
              </Box>
            ))}

            {data.videos?.length === 0 && (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <LinkOff sx={{ fontSize: 40, color: "#cbd5e1", mb: 1 }} />
                <Typography color="text.secondary">
                  Tidak ada post Instagram ditemukan.
                </Typography>
              </Box>
            )}
          </List>
        </Card>
      )}

      {data?.error && (
        <Typography color="error" textAlign="center" sx={{ py: 4 }}>
          {data.error}
        </Typography>
      )}
    </Box>
  );
}
