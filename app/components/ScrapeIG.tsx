"use client";

import { useState } from "react";
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
  TextField,
  Alert,
} from "@mui/material";
import { Refresh, Checklist, LinkOff } from "@mui/icons-material";
import { scrape_ig } from "@/app/lib/scrape-ig";
import { useTransition } from "react";
import { exportScrapedContentAction } from "@/app/scrape/actions";

interface InstagramPost {
  id: string;
  title: string;
  link: string;
  thumbnail: string;
  upload_date?: string;
}

interface InstagramScrapeResult {
  channel?: string;
  videos?: InstagramPost[];
  error?: string;
}

export default function InstagramScraper() {
  const [data, setData] = useState<InstagramScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExporting, startExportTransition] = useTransition();
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportError, setExportError] = useState<string>("");
  const [itemWarnings, setItemWarnings] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [usernameInput, setUsernameInput] = useState("iom_itb.official");

  function setWarningsFromFailures(
    failures: Array<{ link: string; error: string }>,
  ) {
    const warnings: Record<string, boolean> = {};

    failures.forEach((failure) => {
      if (failure.error.toLowerCase().includes("sudah ada")) {
        warnings[failure.link.toLowerCase()] = true;
      }
    });

    setItemWarnings(warnings);
  }

  const handleScrape = async () => {
    const username = usernameInput.trim();
    if (!username) {
      setData({ error: "Username Instagram wajib diisi." });
      return;
    }

    setLoading(true);
    try {
      const result = await scrape_ig(username);
      setData(result);
      setSelectedIds([]);
      setExportMessage("");
      setExportError("");
      setItemWarnings({});
    } catch {
      setData({ error: "Gagal menarik data Instagram." });
    } finally {
      setLoading(false);
    }
  };

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

    if (!selectedData?.length) {
      setExportError("Pilih minimal satu post Instagram untuk diekspor.");
      return;
    }

    setExportMessage("");
    setExportError("");

    startExportTransition(async () => {
      const result = await exportScrapedContentAction(
        selectedData.map((post) => ({
          title: post.title,
          platform: "Instagram" as const,
          upload_date: post.upload_date,
          link: post.link,
          source_post_id: post.id,
          thumbnail_url: post.thumbnail,
        })),
      );

      if (result.savedCount > 0) {
        setExportMessage(
          `${result.savedCount} konten Instagram berhasil disimpan ke recording.`,
        );
      }

      setWarningsFromFailures(result.failed);

      const duplicateFailures = result.failed.filter((item) =>
        item.error.toLowerCase().includes("sudah ada"),
      );
      const nonDuplicateFailures = result.failed.filter(
        (item) => !item.error.toLowerCase().includes("sudah ada"),
      );

      if (duplicateFailures.length > 0 && nonDuplicateFailures.length === 0) {
        setExportError(
          "Beberapa konten sudah ada. Item yang diwarnai oranye tidak disimpan ulang.",
        );
      }

      if (nonDuplicateFailures.length > 0) {
        const details = nonDuplicateFailures
          .map((item) => item.error)
          .slice(0, 2)
          .join(" ");
        setExportError(
          details ||
            `${nonDuplicateFailures.length} konten gagal disimpan. Pastikan metadata scrape lengkap.`,
        );
      } else {
        if (duplicateFailures.length === 0) {
          setExportError("");
        }
        setSelectedIds([]);
      }
    });
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
      {exportMessage ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          {exportMessage}
        </Alert>
      ) : null}
      {exportError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {exportError}
        </Alert>
      ) : null}

      <Stack spacing={1.25} sx={{ mb: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <TextField
            size="small"
            fullWidth
            label="Username Instagram"
            placeholder="contoh: iom_itb.official"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            disabled={loading}
          />
          <Button
            variant="contained"
            sx={{ bgcolor: "#E1306C", minWidth: { md: 140 } }}
            onClick={handleScrape}
            disabled={loading || !usernameInput.trim()}
          >
            {loading ? "Scraping..." : "Scrape"}
          </Button>
        </Stack>

        <Stack direction="row" justifyContent="space-between">
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
                disabled={loading || !usernameInput.trim()}
                color="primary"
              >
                <Refresh className={loading ? "animate-spin" : ""} />
              </IconButton>
            </Tooltip>
          </Stack>
          <Button
            variant="contained"
            sx={{ bgcolor: "#E1306C" }}
            disabled={selectedIds.length === 0 || isExporting}
            onClick={handleExport}
          >
            {isExporting ? "Menyimpan..." : `Ekspor (${selectedIds.length})`}
          </Button>
        </Stack>
      </Stack>

      {data && !data.error && (
        <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List sx={{ p: 0, maxHeight: "500px", overflow: "auto" }}>
            {data.videos?.map((post, index) => (
              <Box key={post.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleToggle(post.id)}
                    sx={{
                      py: 2,
                      alignItems: "center",
                      backgroundColor: itemWarnings[post.link.toLowerCase()]
                        ? "#fff4e5"
                        : "transparent",
                      borderLeft: itemWarnings[post.link.toLowerCase()]
                        ? "4px solid #f97316"
                        : "4px solid transparent",
                      "&:hover": {
                        backgroundColor: itemWarnings[post.link.toLowerCase()]
                          ? "#ffe8cc"
                          : undefined,
                      },
                    }}
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
                            color: itemWarnings[post.link.toLowerCase()]
                              ? "#9a3412"
                              : "inherit",
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
