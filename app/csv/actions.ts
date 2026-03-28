'use server';

import { revalidatePath } from 'next/cache';

import { createCsvContacts, type CsvContactInput } from '../lib/api';

export interface ImportCsvResult {
  success: boolean;
  inserted: number;
  error: string | null;
}

export async function importCsvContactsAction(
  rows: CsvContactInput[],
  fileName: string,
): Promise<ImportCsvResult> {
  if (!rows?.length) {
    return {
      success: false,
      inserted: 0,
      error: 'Tidak ada data valid untuk diimport.',
    };
  }

  try {
    const inserted = await createCsvContacts(rows, fileName);
    revalidatePath('/csv');

    return {
      success: true,
      inserted,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      inserted: 0,
      error: error instanceof Error ? error.message : 'Gagal mengimpor data CSV.',
    };
  }
}
