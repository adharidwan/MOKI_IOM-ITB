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
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  Refresh,
  Download,
  Message,
  Checklist,
  LinkOff,
} from "@mui/icons-material";
import { scrape_x } from "@/app/lib/scrape-x";

interface XPost {
  id: string;
  title: string;
  link: string;
}

interface XScrapeResult {
  channel?: string;
  videos?: XPost[];
  error?: string;
}

export default function XScraper() {
  const [data, setData] = useState<XScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleScrape = async () => {
    setLoading(true);
    try {
      const result = await scrape_x("@mrpokke", {
        maxScrolls: 10,
        minPosts: 25,
        delayPerScroll: 1500,
      });
      setData(result);
      setSelectedIds([]);
    } catch {
      setData({ error: "Gagal scrape X." });
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
    const selectedData = data?.videos?.filter((v) =>
      selectedIds.includes(v.id),
    );
    console.log("=== EKSPOR DATA X (PoC) ===");
    console.log(JSON.stringify(selectedData, null, 2));
    alert(`${selectedIds.length} tweet di-log ke Console.`);
  };

  if (loading && !data)
    return (
      <Box sx={{ textAlign: "center", py: 10 }}>
        <CircularProgress sx={{ color: "#000" }} />
        <Typography sx={{ mt: 2 }}>
          Membuka browser dan mencari tweet...
        </Typography>
      </Box>
    );

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 2 }}
      >
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
          sx={{ bgcolor: "#000" }}
          startIcon={<Download />}
          disabled={selectedIds.length === 0}
          onClick={handleExport}
        >
          Ekspor Tweet ({selectedIds.length})
        </Button>
      </Stack>

      {data && !data.error && (
        <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List sx={{ p: 0, maxHeight: "500px", overflow: "auto" }}>
            {data.videos?.map((tweet, index) => (
              <Box key={tweet.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleToggle(tweet.id)}
                    sx={{ py: 2, alignItems: "center" }}
                  >
                    <ListItemIcon sx={{ minWidth: 48 }}>
                      <Checkbox
                        checked={selectedIds.includes(tweet.id)}
                        disableRipple
                        edge="start"
                      />
                    </ListItemIcon>
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      <Message fontSize="small" />
                    </ListItemIcon>

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
                        {tweet.title || "Tweet"}
                      </Typography>
                      <Typography
                        component="a"
                        href={tweet.link}
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
                        {tweet.link}
                      </Typography>
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
                  Tidak ada tweet ditemukan.
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
