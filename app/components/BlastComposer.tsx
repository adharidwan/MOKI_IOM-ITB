'use client';

import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import {
  Alert,
  Box,
  Button,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { sendGroupBlastAction } from '../phonelist/actions';

interface BlastComposerProps {
  availableGroups: string[];
}

interface ParsedCsvRecipient {
  no_telp: string;
  nama?: string;
  jenis_kelamin?: string;
  jabatan?: string;
}

interface ParsedCsvRow {
  'no telp'?: string;
  no_telp?: string;
  phone?: string;
  nomor?: string;
  nama?: string;
  'jenis kelamin'?: string;
  jenis_kelamin?: string;
  jabatan?: string;
}

function parseManualRecipients(rawValue: string): ParsedCsvRecipient[] {
  const lines = rawValue
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const recipients: ParsedCsvRecipient[] = [];

  lines.forEach((line) => {
    const [phone, name, gender, title] = line.split('|').map((part) => part.trim());

    if (!phone) {
      return;
    }

    recipients.push({
      no_telp: phone,
      nama: name || undefined,
      jenis_kelamin: gender || undefined,
      jabatan: title || undefined,
    });
  });

  return recipients;
}

function getCsvPhone(row: ParsedCsvRow): string {
  return String(row['no telp'] || row.no_telp || row.phone || row.nomor || '').trim();
}

function askSaveGroupPrompt(sourceLabel: string): { saveToGroup: boolean; groupName: string | null } | null {
  const shouldSave = window.confirm(
    `Sebelum kirim blast dari ${sourceLabel}, apakah penerima mau disimpan sebagai group?`,
  );

  if (!shouldSave) {
    return { saveToGroup: false, groupName: null };
  }

  const groupName = window.prompt('Masukkan nama group baru / existing group:')?.trim() || '';
  if (!groupName) {
    window.alert('Nama group wajib diisi jika memilih save ke group.');
    return null;
  }

  return {
    saveToGroup: true,
    groupName,
  };
}

export default function BlastComposer({ availableGroups }: BlastComposerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [manualRecipientsRaw, setManualRecipientsRaw] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [csvMessage, setCsvMessage] = useState('');
  const [csvRecipients, setCsvRecipients] = useState<ParsedCsvRecipient[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const manualCount = useMemo(() => parseManualRecipients(manualRecipientsRaw).length, [manualRecipientsRaw]);

  const handleManualSubmit = async () => {
    const recipients = parseManualRecipients(manualRecipientsRaw);

    if (!recipients.length) {
      setStatus({ type: 'error', message: 'Minimal isi satu nomor tujuan pada input manual.' });
      return;
    }

    if (!manualMessage.trim()) {
      setStatus({ type: 'error', message: 'Pesan blast wajib diisi.' });
      return;
    }

    const promptResult = askSaveGroupPrompt('input satu per satu');
    if (!promptResult) {
      return;
    }

    setSubmitting(true);
    setStatus({ type: 'info', message: 'Mengirim blast manual ke antrian...' });

    const response = await fetch('/api/admin/blast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'manual',
        message: manualMessage,
        recipients,
        saveToGroup: promptResult.saveToGroup,
        groupName: promptResult.groupName,
        sourceFile: 'manual-input',
      }),
    });

    const result = (await response.json()) as { error?: string; insertedCount?: number; groupName?: string | null };

    if (!response.ok) {
      setStatus({ type: 'error', message: result.error || 'Blast manual gagal dikirim.' });
      setSubmitting(false);
      return;
    }

    setStatus({
      type: 'success',
      message: promptResult.saveToGroup
        ? `Blast terkirim ke ${result.insertedCount || 0} penerima. Disimpan ke group ${result.groupName}.`
        : `Blast terkirim ke ${result.insertedCount || 0} penerima.`,
    });
    setSubmitting(false);
  };

  const handleCsvFile = async (file: File) => {
    setStatus({ type: 'info', message: 'Membaca file CSV...' });
    setCsvFileName(file.name);

    Papa.parse<ParsedCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        const recipients = results.data
          .map((row) => ({
            no_telp: getCsvPhone(row),
            nama: String(row.nama || '').trim() || undefined,
            jenis_kelamin: String(row['jenis kelamin'] || row.jenis_kelamin || '').trim() || undefined,
            jabatan: String(row.jabatan || '').trim() || undefined,
          }))
          .filter((row) => row.no_telp.length > 0);

        setCsvRecipients(recipients);

        if (recipients.length === 0) {
          setStatus({ type: 'error', message: 'Tidak ada nomor valid pada CSV.' });
          return;
        }

        setStatus({ type: 'success', message: `CSV terbaca: ${recipients.length} penerima siap diblast.` });
      },
      error: (error) => {
        setStatus({ type: 'error', message: `Gagal membaca CSV: ${error.message}` });
      },
    });
  };

  const handleCsvSubmit = async () => {
    if (!csvRecipients.length) {
      setStatus({ type: 'error', message: 'Upload CSV dulu sebelum kirim blast.' });
      return;
    }

    if (!csvMessage.trim()) {
      setStatus({ type: 'error', message: 'Pesan blast wajib diisi.' });
      return;
    }

    const promptResult = askSaveGroupPrompt('CSV');
    if (!promptResult) {
      return;
    }

    setSubmitting(true);
    setStatus({ type: 'info', message: 'Mengirim blast dari CSV ke antrian...' });

    const response = await fetch('/api/admin/blast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'csv',
        message: csvMessage,
        recipients: csvRecipients,
        saveToGroup: promptResult.saveToGroup,
        groupName: promptResult.groupName,
        sourceFile: csvFileName || 'csv-blast',
      }),
    });

    const result = (await response.json()) as { error?: string; insertedCount?: number; groupName?: string | null };

    if (!response.ok) {
      setStatus({ type: 'error', message: result.error || 'Blast CSV gagal dikirim.' });
      setSubmitting(false);
      return;
    }

    setStatus({
      type: 'success',
      message: promptResult.saveToGroup
        ? `Blast CSV terkirim ke ${result.insertedCount || 0} penerima. Disimpan ke group ${result.groupName}.`
        : `Blast CSV terkirim ke ${result.insertedCount || 0} penerima.`,
    });
    setSubmitting(false);
  };

  return (
    <Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: '1px solid rgba(78, 141, 156, 0.25)' }}>
      <Typography variant="h6" sx={{ mb: 1, color: '#4e8d9c', fontWeight: 'bold' }}>
        Blast Message (End-to-End)
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
        Kirim blast dari tiga sumber: input satu per satu, CSV, atau segment group. Untuk input manual dan CSV,
        sistem akan selalu meminta konfirmasi apakah penerima ingin disimpan sebagai group.
      </Typography>

      <Tabs value={activeTab} onChange={(_event, next) => setActiveTab(next)} sx={{ mb: 2 }}>
        <Tab label="Input Satu per Satu" />
        <Tab label="CSV" />
        <Tab label="Segment Group" />
      </Tabs>

      {status ? (
        <Alert severity={status.type} sx={{ mb: 2 }}>
          {status.message}
        </Alert>
      ) : null}

      {activeTab === 0 ? (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label="Daftar Penerima"
            multiline
            minRows={5}
            value={manualRecipientsRaw}
            onChange={(event) => setManualRecipientsRaw(event.target.value)}
            placeholder={[
              'Format per baris: nomor|nama|jenis_kelamin|jabatan',
              'Contoh:',
              '6281234567890|Budi|Laki-laki|Sales',
              '6289876543210|Sari|Perempuan|Support',
              '',
              'Minimal nomor saja: 628111222333',
            ].join('\n')}
          />
          <Typography variant="body2" color="textSecondary">
            Total baris penerima terbaca: {manualCount}
          </Typography>
          <TextField
            label="Pesan Blast"
            multiline
            minRows={4}
            value={manualMessage}
            onChange={(event) => setManualMessage(event.target.value)}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" disabled={submitting} onClick={handleManualSubmit} sx={{ backgroundColor: '#4e8d9c' }}>
              Kirim Blast Manual
            </Button>
          </Box>
        </Box>
      ) : null}

      {activeTab === 1 ? (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Button component="label" variant="outlined">
            Upload CSV Penerima
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleCsvFile(file);
                }
              }}
            />
          </Button>
          <Typography variant="body2" color="textSecondary">
            {csvFileName
              ? `File: ${csvFileName} | Penerima valid: ${csvRecipients.length}`
              : 'Belum ada file dipilih.'}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Kolom nomor yang didukung: no telp, no_telp, phone, nomor.
          </Typography>
          <TextField
            label="Pesan Blast"
            multiline
            minRows={4}
            value={csvMessage}
            onChange={(event) => setCsvMessage(event.target.value)}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" disabled={submitting} onClick={handleCsvSubmit} sx={{ backgroundColor: '#4e8d9c' }}>
              Kirim Blast CSV
            </Button>
          </Box>
        </Box>
      ) : null}

      {activeTab === 2 ? (
        availableGroups.length === 0 ? (
          <Alert severity="info">Belum ada segment. Tambahkan group pada kontak terlebih dahulu.</Alert>
        ) : (
          <Box component="form" action={sendGroupBlastAction} sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {availableGroups.map((groupName) => (
                <Box
                  key={groupName}
                  component="label"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderRadius: 999,
                    border: '1px solid rgba(78, 141, 156, 0.35)',
                    backgroundColor: '#fff',
                  }}
                >
                  <input type="checkbox" name="group_names" value={groupName} />
                  <Typography variant="body2">{groupName}</Typography>
                </Box>
              ))}
            </Box>

            <TextField
              name="message"
              label="Pesan blast"
              multiline
              minRows={4}
              required
              placeholder="Tulis pesan yang akan dikirim ke semua kontak dalam segment terpilih"
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="contained" sx={{ backgroundColor: '#4e8d9c' }}>
                Kirim Blast Segment
              </Button>
            </Box>
          </Box>
        )
      ) : null}
    </Paper>
  );
}
