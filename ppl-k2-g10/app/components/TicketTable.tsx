'use client';

import { useState, useEffect } from 'react';
import { 
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Paper, TextField 
} from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TicketWithReplies } from '../lib/supabase';

interface TicketTableProps {
  initialData: TicketWithReplies[];
  totalCount: number;
}

export default function TicketTable({ initialData }: TicketTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const currentSearch = searchParams.get('search') || '';
  
  // 1. Local state for the input field (immediate UI update)
  const [searchTerm, setSearchTerm] = useState(currentSearch);

  useEffect(() => {
    setSearchTerm(currentSearch);
  }, [currentSearch]);

  // Debounce logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchTerm === currentSearch) {
        return;
      }

      const params = new URLSearchParams(currentQuery);
      
      if (searchTerm) {
        params.set('search', searchTerm);
      } else {
        params.delete('search');
      }
      
      params.set('page', '1'); // Reset to page 1 on search
      const nextQuery = params.toString();
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

      router.replace(nextUrl);
    }, 500); // 500ms delay

    return () => clearTimeout(delayDebounceFn);
  }, [currentQuery, currentSearch, pathname, router, searchTerm]);

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
            {initialData.map((row) => (
              <TableRow 
                key={row.id} 
                hover 
                onClick={() => router.push(`/ticket/${row.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <TableCell>{row.id}</TableCell>
                <TableCell>{row.subject}</TableCell>
                <TableCell>{row.status}</TableCell>
                <TableCell>{row.created_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
