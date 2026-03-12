'use client';

import { useState, useEffect } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, TextField 
} from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';

export default function TicketTable({ initialData, totalCount }: any) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // 1. Local state for the input field (immediate UI update)
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');

  // Debounce logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      
      if (searchTerm) {
        params.set('search', searchTerm);
      } else {
        params.delete('search');
      }
      
      params.set('page', '1'); // Reset to page 1 on search
      router.push(`?${params.toString()}`);
    }, 500); // 500ms delay

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, router, searchParams]);

  return (
    <Paper sx={{ width: '100%', p: 2, backgroundColor: '#EDF7BD', borderRadius: 2 }}>
      <TextField 
        label="Search Tickets" 
        variant="outlined" 
        fullWidth 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)} // Updates local state instantly
        sx={{ mb: 2 }}
      />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'inherit', border: '2px solid #ccc', borderRadius: 1 }}>
              <TableCell>ID</TableCell>
              <TableCell>Subject</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Date</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {initialData.map((row: any) => (
              <TableRow 
                key={row.id} 
                hover 
                onClick={() => router.push(`/ticket/${row.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.subject}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.createdAt}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}