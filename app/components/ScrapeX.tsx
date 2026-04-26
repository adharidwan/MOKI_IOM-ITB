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
  Tooltip,
  IconButton,
  TextField,
  Alert,
} from "@mui/material";
import {
  Refresh,
  Download,
  Message,
  Checklist,
  LinkOff,
} from "@mui/icons-material";
import { scrape_x } from "@/app/lib/scrape-x";
import { useTransition } from "react";
import { exportScrapedContentAction } from "@/app/scrape/actions";

interface XPost {
  id: string;
  title: string;
  link: string;
  upload_date?: string;
  thumbnail?: string;
}

interface XScrapeResult {
  channel?: string;
  videos?: XPost[];
  error?: string;
}

export default function XScraper() {
  const [data, setData] = useState<XScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExporting, startExportTransition] = useTransition();
  const [exportMessage, setExportMessage] = useState<string>("");
  const [exportError, setExportError] = useState<string>("");
  const [itemWarnings, setItemWarnings] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [usernameInput, setUsernameInput] = useState("IomITB");

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
      setData({ error: "Username X wajib diisi." });
      return;
    }

    setLoading(true);
    try {
      const result = await scrape_x(username, {
        minPosts: 25,
      });
      setData(result);
      setSelectedIds([]);
      setExportMessage("");
      setExportError("");
      setItemWarnings({});
    } catch {
      setData({ error: "Gagal scrape X." });
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
    const selectedData = data?.videos?.filter((v) =>
      selectedIds.includes(v.id),
    );

    if (!selectedData?.length) {
      setExportError("Pilih minimal satu tweet untuk diekspor.");
      return;
    }

    setExportMessage("");
    setExportError("");

    startExportTransition(async () => {
      const result = await exportScrapedContentAction(
        selectedData.map((tweet) => ({
          title: tweet.title,
          platform: "x" as const,
          upload_date: tweet.upload_date,
          link: tweet.link,
          source_post_id: tweet.id,
          thumbnail_url: tweet.thumbnail,
        })),
      );

      if (result.savedCount > 0) {
        setExportMessage(
          `${result.savedCount} konten X berhasil disimpan ke recording.`,
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
        <CircularProgress sx={{ color: "#000" }} />
        <Typography sx={{ mt: 2 }}>
          Membuka browser dan mencari tweet...
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
            label="Username X"
            placeholder="contoh: IomITB atau @IomITB"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            disabled={loading}
          />
          <Button
            variant="contained"
            sx={{ bgcolor: "#000", minWidth: { md: 140 } }}
            startIcon={<Message />}
            onClick={handleScrape}
            disabled={loading || !usernameInput.trim()}
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
                disabled={loading || !usernameInput.trim()}
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
            disabled={selectedIds.length === 0 || isExporting}
            onClick={handleExport}
          >
            {isExporting
              ? "Menyimpan..."
              : `Ekspor Tweet (${selectedIds.length})`}
          </Button>
        </Stack>
      </Stack>

      {data && !data.error && (
        <Card variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
          <List sx={{ p: 0, maxHeight: "500px", overflow: "auto" }}>
            {data.videos?.map((tweet, index) => (
              <Box key={tweet.id}>
                <ListItem disablePadding>
                  <ListItemButton
                    onClick={() => handleToggle(tweet.id)}
                    sx={{
                      py: 2,
                      alignItems: "center",
                      backgroundColor: itemWarnings[tweet.link.toLowerCase()]
                        ? "#fff4e5"
                        : "transparent",
                      borderLeft: itemWarnings[tweet.link.toLowerCase()]
                        ? "4px solid #f97316"
                        : "4px solid transparent",
                      "&:hover": {
                        backgroundColor: itemWarnings[tweet.link.toLowerCase()]
                          ? "#ffe8cc"
                          : undefined,
                      },
                    }}
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
                          color: itemWarnings[tweet.link.toLowerCase()]
                            ? "#9a3412"
                            : "inherit",
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
