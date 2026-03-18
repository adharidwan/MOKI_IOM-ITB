"use client";

import { useState, useEffect } from "react";
import { 
  Box, Typography, Button, Card, Divider, CircularProgress, 
  List, ListItem, ListItemButton, ListItemIcon, ListItemText, 
  Checkbox, Stack, Tooltip, IconButton 
} from "@mui/material";
import { 
  Refresh, 
  VideoLibrary, 
  Checklist, 
  LinkOff 
} from "@mui/icons-material";
import { scrape_youtube, ScrapeResult } from "@/app/lib/scrape-youtube";

export default function YouTubeScraper() {
  const [data, setData] = useState<ScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleScrape = async () => {
    setLoading(true);
    try {
      const result = await scrape_youtube("https://www.youtube.com/@IOM-ITB/videos");
      setData(result);
      setSelectedIds([]); // Reset seleksi saat refresh
    } catch (error) {
      setData({ error: "Gagal mengambil data IOM ITB." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleScrape();
  }, []);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
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
    const selectedData = data?.videos?.filter((v) => selectedIds.includes(v.id));
    console.log("=== EKSPOR DATA JSON (PoC) ===");
    console.log(JSON.stringify(selectedData, null, 2));
    alert(`${selectedIds.length} video di-log ke Console.`);
  };

  if (loading && !data) {
    return (
      <Box sx={{ textAlign: "center", py: 10 }}>
        <CircularProgress color="error" />
        <Typography sx={{ mt: 2 }} color="text.secondary">Menarik data YouTube...</Typography>
      </Box>
    );
  }

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
            {selectedIds.length === data?.videos?.length && data?.videos?.length !== 0 
              ? "Unselect All" 
              : "Select All"}
          </Button>

          <Tooltip title="Refresh Data">
            <IconButton onClick={handleScrape} disabled={loading} color="primary">
              <Refresh className={loading ? "animate-spin" : ""} />
            </IconButton>
          </Tooltip>
        </Stack>

        <Button 
          variant="contained" 
          color="success" 
          disabled={selectedIds.length === 0}
          onClick={handleExport}
        >
          Ekspor ({selectedIds.length})
        </Button>
      </Stack>

      {data && !data.error && (
        <Card variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, bgcolor: "#f1f5f9" }}>
            <Typography variant="caption" fontWeight="bold" color="text.secondary">
              CHANNEL: {data.channel?.toUpperCase()}
            </Typography>
          </Box>
          <Divider />
          <List sx={{ p: 0, maxHeight: '500px', overflow: 'auto' }}>
            {data.videos?.map((video, index) => (
              <Box key={`${video.id}-${index}`}>
                <ListItem disablePadding>
                  <ListItemButton onClick={() => handleToggle(video.id)} sx={{ py: 1.5 }}>
                    <ListItemIcon>
                      <Checkbox 
                        checked={selectedIds.includes(video.id)} 
                        disableRipple 
                        edge="start"
                      />
                    </ListItemIcon>
                    <ListItemText 
                      primary={video.title} 
                      primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 600, noWrap: true }}
                      secondary={video.link}
                      secondaryTypographyProps={{ fontSize: '0.75rem', noWrap: true }}
                    />
                  </ListItemButton>
                </ListItem>
                {index < (data.videos?.length || 0) - 1 && <Divider />}
              </Box>
            ))}

            {data.videos?.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <LinkOff sx={{ fontSize: 40, color: "#cbd5e1", mb: 1 }} />
                <Typography color="text.secondary">Tidak ada video ditemukan.</Typography>
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