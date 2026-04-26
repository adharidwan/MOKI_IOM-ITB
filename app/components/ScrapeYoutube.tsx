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
  ListItemText,
  Checkbox,
  Stack,
  Tooltip,
  IconButton,
  TextField,
  Alert,
} from "@mui/material";
import { Refresh, VideoLibrary, Checklist, LinkOff } from "@mui/icons-material";
import { useTransition } from "react";
import { scrape_youtube, ScrapeResult } from "@/app/lib/scrape-youtube";
import { exportScrapedContentAction } from "@/app/scrape/actions";

function buildYouTubeChannelUrl(rawInput: string): string {
  const input = rawInput.trim();
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return input;
  }

  const cleaned = input.replace(/^@/, "");
  return `https://www.youtube.com/@${cleaned}/videos`;
}

export default function YouTubeScraper() {
  const [data, setData] = useState<ScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExporting, startExportTransition] = useTransition();
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportError, setExportError] = useState<string>("");
  const [itemWarnings, setItemWarnings] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channelInput, setChannelInput] = useState("IOM-ITB");

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
    const channel = channelInput.trim();
    if (!channel) {
      setData({ error: "Nama channel YouTube wajib diisi." });
      return;
    }

    setLoading(true);
    try {
      const result = await scrape_youtube(buildYouTubeChannelUrl(channel));
      setData(result);
      setSelectedIds([]); // Reset seleksi saat refresh
      setExportMessage("");
      setExportError("");
      setItemWarnings({});
    } catch (error) {
      setData({ error: "Gagal mengambil data IOM ITB." });
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
        setSelectedIds([]); // Jika semua sudah terpilih, maka unselect all
      } else {
        setSelectedIds(data.videos.map((v) => v.id)); // Pilih semua ID
      }
    }
  };

  const handleExport = () => {
    const selectedData = data?.videos?.filter((v) =>
      selectedIds.includes(v.id),
    );

    if (!selectedData?.length) {
      setExportError("Pilih minimal satu video untuk diekspor.");
      return;
    }

    setExportMessage("");
    setExportError("");

    startExportTransition(async () => {
      const result = await exportScrapedContentAction(
        selectedData.map((video) => ({
          title: video.title,
          platform: "youtube" as const,
          upload_date: video.upload_date,
          link: video.link,
          source_post_id: video.id,
          thumbnail_url: video.thumbnail,
        })),
      );

      if (result.savedCount > 0) {
        setExportMessage(
          `${result.savedCount} konten YouTube berhasil disimpan ke recording.`,
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

  if (loading && !data) {
    return (
      <Box sx={{ textAlign: "center", py: 10 }}>
        <CircularProgress color="error" />
        <Typography sx={{ mt: 2 }} color="text.secondary">
          Menarik data YouTube...
        </Typography>
      </Box>
    );
  }

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
            label="Channel YouTube"
            placeholder="contoh: IOM-ITB atau URL channel"
            value={channelInput}
            onChange={(event) => setChannelInput(event.target.value)}
            disabled={loading}
          />
          <Button
            variant="contained"
            color="error"
            startIcon={<VideoLibrary />}
            onClick={handleScrape}
            disabled={loading || !channelInput.trim()}
            sx={{ minWidth: { md: 140 } }}
          >
            {loading ? "Scraping..." : "Scrape"}
          </Button>
        </Stack>

        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
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
                disabled={loading || !channelInput.trim()}
                color="primary"
              >
                <Refresh className={loading ? "animate-spin" : ""} />
              </IconButton>
            </Tooltip>
          </Stack>

          <Button
            variant="contained"
            color="success"
            disabled={selectedIds.length === 0 || isExporting}
            onClick={handleExport}
          >
            {isExporting ? "Menyimpan..." : `Ekspor (${selectedIds.length})`}
          </Button>
        </Stack>
      </Stack>

      {data && !data.error && (
        <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <Box sx={{ p: 2, bgcolor: "#f1f5f9" }}>
            <Typography
              variant="caption"
              fontWeight="bold"
              color="text.secondary"
            >
              CHANNEL: {data.channel?.toUpperCase()}
            </Typography>
          </Box>
          <Divider />
          <List sx={{ p: 0, maxHeight: "500px", overflow: "auto" }}>
            {data.videos?.map((video, index) => (
              <Box key={`${video.id}-${index}`}>
                {Boolean(itemWarnings[video.link.toLowerCase()]) ? null : null}
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleToggle(video.id)}
                    sx={{
                      py: 2,
                      alignItems: "center",
                      backgroundColor: itemWarnings[video.link.toLowerCase()]
                        ? "#fff4e5"
                        : "transparent",
                      borderLeft: itemWarnings[video.link.toLowerCase()]
                        ? "4px solid #f97316"
                        : "4px solid transparent",
                      "&:hover": {
                        backgroundColor: itemWarnings[video.link.toLowerCase()]
                          ? "#ffe8cc"
                          : undefined,
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 48 }}>
                      <Checkbox
                        checked={selectedIds.includes(video.id)}
                        disableRipple
                        edge="start"
                      />
                    </ListItemIcon>

                    {/* Layout Grid Internal: Thumbnail di Kiri, Teks di Kanan */}
                    <Box
                      sx={{
                        display: "flex",
                        gap: 2,
                        width: "100%",
                        alignItems: "center",
                      }}
                    >
                      {/* Box untuk Thumbnail dengan ukuran fix */}
                      <Box
                        component="img"
                        src={
                          video.thumbnail ||
                          "https://via.placeholder.com/160x90?text=No+Thumbnail"
                        }
                        alt={video.title}
                        sx={{
                          width: 160,
                          height: 90,
                          borderRadius: 1,
                          objectFit: "cover",
                          bgcolor: "#e2e8f0",
                          flexShrink: 0, // Agar thumbnail tidak mengecil jika teks kepanjangan
                        }}
                      />

                      {/* Box untuk Teks */}
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="body1"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.95rem",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            lineHeight: 1.2,
                            mb: 0.5,
                            color: itemWarnings[video.link.toLowerCase()]
                              ? "#9a3412"
                              : "inherit",
                          }}
                        >
                          {video.title}
                        </Typography>

                        <Typography
                          component="a"
                          href={video.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()} // Supaya klik link tidak trigger checkbox
                          sx={{
                            fontSize: "0.75rem",
                            color: "#2563eb", // Link biru
                            textDecoration: "none",
                            "&:hover": { textDecoration: "underline" },
                            display: "inline-block",
                            maxWidth: "100%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {video.link}
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
                  Tidak ada video ditemukan.
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
