'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { 
  Box, 
  Typography, 
  Paper, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Button,
  LinearProgress
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { importCsvContactsAction } from '../csv/actions';

interface CSVRow {
  no_telp: string;
  nama: string;
  jenis_kelamin: string;
  jabatan?: string;
  group_names?: string[];
}

interface RawCSVRow {
  'no telp'?: string;
  nama?: string;
  'jenis kelamin'?: string;
  jabatan?: string;
  'group name'?: string;
  group_name?: string;
}

function parseGroupNames(rawValue?: string): string[] {
  return (rawValue || '')
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
interface ParsedData {
  data: CSVRow[];
  errors: string[];
  fileName: string;
  fileSize: number;
}

export default function CSVDropZone() {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [inputKey, setInputKey] = useState(0);
  
  // Handle file selection
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    
    if (!file) {
      setStatus({ type: 'error', message: 'No file selected' });
      return;
    }

    // Validate by file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.csv')) {
      setStatus({ type: 'error', message: 'File must have .csv extension' });
      return;
    }

    setIsProcessing(true);
    setStatus({ type: 'info', message: 'Processing file...' });
    setParsedData(null);

    Papa.parse<RawCSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        const validData: CSVRow[] = [];
        const errors: string[] = [];

        if (results.errors.length > 0) {
          results.errors.forEach((err) => {
            const rowNum = err.row !== undefined ? err.row + 1 : '?';
            errors.push(`Row ${rowNum}: ${err.message}`);
          });
        }

        const headers = (results.meta.fields || []).map((field) => field.trim().toLowerCase());
        const requiredHeaders = ['no telp', 'nama', 'jenis kelamin'];

        requiredHeaders.forEach((requiredHeader) => {
          if (!headers.includes(requiredHeader)) {
            errors.push(`Missing required column: ${requiredHeader}`);
          }
        });
        
        results.data.forEach((row, index) => {
          const rowNum = index + 2;
          const noTelp = row['no telp']?.trim();
          const nama = row.nama?.trim();
          const jenisKelamin = row['jenis kelamin']?.trim();
          const jabatan = row.jabatan?.trim();
          const groupNames = parseGroupNames(row['group name'] || row.group_name);
          
          if (!noTelp) {
            errors.push(`Row ${rowNum}: No Telp is required`);
            return;
          }
          if (!nama) {
            errors.push(`Row ${rowNum}: Nama is required`);
            return;
          }
          if (!jenisKelamin) {
            errors.push(`Row ${rowNum}: Jenis kelamin is required`);
            return;
          }
          
          validData.push({
            no_telp: noTelp,
            nama,
            jenis_kelamin: jenisKelamin,
            jabatan,
            group_names: groupNames,
          });
        });

        setParsedData({
          data: validData,
          errors,
          fileName: file.name,
          fileSize: file.size
        });

        if (validData.length > 0) {
          setStatus({ type: 'success', message: `Found ${validData.length} valid records` });
        } else {
          setStatus({ type: 'error', message: 'No valid records found' });
        }
        
        setIsProcessing(false);
      },
      error: (error) => {
        setStatus({ type: 'error', message: `Parse error: ${error.message}` });
        setIsProcessing(false);
      }
    });
  }, []);

  const onDropRejected = useCallback(() => {
    setStatus({ type: 'error', message: 'Only .csv files are allowed' });
  }, []);

  // Only accept CSV files
  const { getRootProps, getInputProps, isDragActive, isDragReject, open } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    multiple: false,
    maxFiles: 1,
    noClick: true,
    noKeyboard: true,
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleReset = () => {
    setParsedData(null);
    setStatus(null);
    setInputKey((prev) => prev + 1);
  };

  return (
    <Paper sx={{ p: 4, maxWidth: 900, mx: 'auto', mt: 4, backgroundColor: '#EDF7BD', borderRadius: 2 }}>
      <Typography variant="h5" gutterBottom sx={{ color: '#4e8d9c', fontWeight: 'bold' }}>
        Import Tickets from CSV
      </Typography>
      
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Drag and drop a CSV file or click to select. Required columns: No Telp, Nama, Jenis kelamin. Optional: Jabatan, Group Name
      </Typography>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        onClick={open}
        style={{
          border: '2px dashed',
          borderColor: isDragReject ? '#f44336' : isDragActive ? '#4e8d9c' : '#ccc',
          borderRadius: '8px',
          padding: '32px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragActive ? 'rgba(78, 141, 156, 0.1)' : 'transparent',
          transition: 'all 0.3s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#4e8d9c';
          e.currentTarget.style.backgroundColor = 'rgba(78, 141, 156, 0.05)';
        }}
        onMouseLeave={(e) => {
          if (!isDragActive) {
            e.currentTarget.style.borderColor = '#ccc';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* Accept only CSV */}
        <input
          key={inputKey}
          {...getInputProps({ accept: '.csv,text/csv' })}
          style={{ display: 'none' }}
        />
        
        {isDragActive ? (
          <CloudUploadIcon sx={{ fontSize: 60, color: '#4e8d9c' }} />
        ) : (
          <InsertDriveFileIcon sx={{ fontSize: 60, color: '#4e8d9c' }} />
        )}
        
        <Typography variant="h6" sx={{ mt: 2, color: '#4e8d9c' }}>
          {isDragActive ? 'Drop the file here' : 'Drag & drop CSV file here'}
        </Typography>
        
        <Typography variant="body2" color="textSecondary">
          or click to select file
        </Typography>
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <Box sx={{ mt: 3 }}>
          <LinearProgress />
          <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
            Processing file...
          </Typography>
        </Box>
      )}

      {/* Status Alert */}
      {status && (
        <Alert severity={status.type} sx={{ mt: 3 }}>
          {status.message}
        </Alert>
      )}

      {/* Parsed Data Preview */}
      {parsedData && (
        <Box sx={{ mt: 3 }}>
          {/* File Info */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              File: {parsedData.fileName} ({formatFileSize(parsedData.fileSize)})
            </Typography>
            <Button variant="outlined" color="secondary" onClick={handleReset}>
              Reset
            </Button>
          </Box>

          {/* Errors */}
          {parsedData.errors.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2">{parsedData.errors.length} validation errors</Typography>
              <Box component="ul" sx={{ m: 1, pl: 2 }}>
                {parsedData.errors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
                {parsedData.errors.length > 5 && (
                  <li>...and {parsedData.errors.length - 5} more</li>
                )}
              </Box>
            </Alert>
          )}

          {/* Preview Table */}
          {parsedData.data.length > 0 && (
            <>
              <Typography variant="h6" sx={{ mb: 1, color: '#4e8d9c' }}>
                Preview (showing {Math.min(parsedData.data.length, 5)} of {parsedData.data.length} rows)
              </Typography>
              
              <TableContainer sx={{ maxHeight: 400, border: '1px solid #ccc', borderRadius: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>No Telp</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Nama</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Jenis kelamin</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Jabatan</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Group</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {parsedData.data.slice(0, 5).map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{row.no_telp}</TableCell>
                        <TableCell>{row.nama}</TableCell>
                        <TableCell>{row.jenis_kelamin}</TableCell>
                        <TableCell>{row.jabatan || '-'}</TableCell>
                        <TableCell>{row.group_names?.join(', ') || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Import Button */}
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button 
                  variant="contained" 
                  sx={{ backgroundColor: '#4e8d9c' }}
                  disabled={isProcessing || parsedData.data.length === 0}
                  onClick={async () => {
                    if (!parsedData?.data?.length) {
                      return;
                    }

                    setIsProcessing(true);
                    setStatus({ type: 'info', message: 'Menyimpan data ke database...' });

                    const result = await importCsvContactsAction(parsedData.data, parsedData.fileName);

                    if (!result.success) {
                      setStatus({ type: 'error', message: result.error || 'Import gagal' });
                      setIsProcessing(false);
                      return;
                    }

                    setStatus({ type: 'success', message: `Berhasil menyimpan ${result.inserted} data ke database` });
                    setIsProcessing(false);
                  }}
                >
                  Import {parsedData.data.length} Tickets
                </Button>
              </Box>
            </>
          )}
        </Box>
      )}
    </Paper>
  );
}
