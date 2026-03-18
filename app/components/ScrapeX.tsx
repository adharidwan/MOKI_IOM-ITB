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
  ListItemText,
  Checkbox,
  Stack,
  Tooltip,
  IconButton,
} from "@mui/material";
import { Refresh, Download, Message, Checklist } from "@mui/icons-material";
import { scrape_x } from "@/app/lib/scrape-x";

export default function XScraper() {
  const [data, setData] = useState<any>(null);
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
    } catch (error) {
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

  const handleExport = () => {
    const selectedData = data?.videos?.filter((v: any) =>
      selectedIds.includes(v.id),
    );
    console.log("X EXPORT:", selectedData);
    alert("Data Tweet di-log ke Console.");
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
            onClick={() =>
              setSelectedIds(
                selectedIds.length === data?.videos?.length
                  ? []
                  : data?.videos?.map((v: any) => v.id),
              )
            }
          >
            Select All
          </Button>
          <IconButton onClick={handleScrape} disabled={loading}>
            <Refresh />
          </IconButton>
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
        <Card variant="outlined" sx={{ borderRadius: 3 }}>
          <List sx={{ p: 0 }}>
            {data.videos?.map((tweet: any) => (
              <ListItem key={tweet.id} disablePadding divider>
                <ListItemButton onClick={() => handleToggle(tweet.id)}>
                  <ListItemIcon>
                    <Checkbox checked={selectedIds.includes(tweet.id)} />
                  </ListItemIcon>
                  <ListItemIcon>
                    <Message fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={tweet.title} secondary={tweet.link} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Card>
      )}
    </Box>
  );
}
