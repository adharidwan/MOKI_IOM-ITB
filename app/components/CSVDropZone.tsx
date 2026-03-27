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

interface CSVRow {
  subject: string;
  description: string;
  user_email: string;
  phone_number?: string;
  channel?: string;
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

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        const validData: CSVRow[] = [];
        const errors: string[] = [];

        if (results.errors.length > 0) {
          results.errors.forEach((err) => {
            const rowNum = err.row ? err.row + 1 : '?';
            errors.push(`Row ${rowNum}: ${err.message}`);
          });
        }
        
        results.data.forEach((row, index) => {
          const rowNum = index + 2;
          const subject = row.subject?.trim();
          const description = row.description?.trim();
          const userEmail = row.user_email?.trim();
          const phoneNumber = row.phone_number?.trim();
          const channel = row.channel?.trim() || 'csv_import';
          
          if (!subject) {
            errors.push(`Row ${rowNum}: Subject is required`);
            return;
          }
          if (!description) {
            errors.push(`Row ${rowNum}: Description is required`);
            return;
          }
          if (!userEmail || !userEmail.includes('@')) {
            errors.push(`Row ${rowNum}: Valid email is required`);
            return;
          }
          
          validData.push({
            subject,
            description,
            user_email: userEmail,
            phone_number: phoneNumber,
            channel,
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
        Drag and drop a CSV file or click to select. Required columns: subject, description, user_email
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
                Preview (showing {Math.min(parsedData.data.length, 10)} of {parsedData.data.length} rows)
              </Typography>
              
              <TableContainer sx={{ maxHeight: 400, border: '1px solid #ccc', borderRadius: 1 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Subject</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>Channel</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {parsedData.data.slice(0, 10).map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{row.subject}</TableCell>
                        <TableCell>{row.description?.substring(0, 40)}{row.description && row.description.length > 40 ? '...' : ''}</TableCell>
                        <TableCell>{row.user_email}</TableCell>
                        <TableCell>{row.phone_number || '-'}</TableCell>
                        <TableCell>{row.channel || 'csv_import'}</TableCell>
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
                  onClick={() => {
                    console.log('Importing:', parsedData.data);
                    setStatus({ type: 'success', message: `Ready to import ${parsedData.data.length} tickets!` });
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
