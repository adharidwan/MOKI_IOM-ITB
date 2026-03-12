"use client";

import React, { useState } from "react";
import { Box, TextField, Button, Stack } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

interface ReplyBoxProps {
  ticketId: string;
}

export default function ReplyBox({ ticketId }: ReplyBoxProps) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!comment.trim()) return;

    setLoading(true);

    // Logic for sending the reply to your API would go here
    console.log(`Sending reply for ticket ${ticketId}:`, comment);

    // Simulate a network delay
    setTimeout(() => {
      setComment("");
      setLoading(false);
      alert("Reply sent!");
    }, 1000);
  };

  return (
    <Box sx={{ mt: 4, borderTop: "1px solid #eee" }}>
      <Stack spacing={2}>
        <TextField
          label="Write a reply..."
          multiline
          rows={4}
          fullWidth
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={loading}
          sx = {{ backgroundColor: "#f9f9f9", mb: 2 }}
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end"}}>
          <Button
            variant="contained"
            endIcon={<SendIcon />}
            onClick={handleSubmit}
            disabled={loading || !comment.trim()}
          >
            {loading ? "Sending..." : "Send Reply"}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
