'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createCsvContact,
  deleteCsvContact,
  updateCsvContact,
  type CsvContactInput,
} from '../lib/api';

function normalizeContactInput(formData: FormData): CsvContactInput {
  return {
    no_telp: String(formData.get('no_telp') || '').trim(),
    nama: String(formData.get('nama') || '').trim(),
    jenis_kelamin: String(formData.get('jenis_kelamin') || '').trim(),
    jabatan: String(formData.get('jabatan') || '').trim() || undefined,
  };
}

function validateInput(input: CsvContactInput): string | null {
  if (!input.no_telp) return 'No Telp wajib diisi.';
  if (!input.nama) return 'Nama wajib diisi.';
  if (!input.jenis_kelamin) return 'Jenis kelamin wajib diisi.';
  return null;
}

export async function createPhoneListContactAction(formData: FormData): Promise<void> {
  const input = normalizeContactInput(formData);
  const validationError = validateInput(input);

  if (validationError) {
    throw new Error(validationError);
  }

  await createCsvContact(input);
  revalidatePath('/phonelist');
}

export async function updatePhoneListContactAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '').trim();
  if (!id) {
    redirect('/phonelist?toast=error');
  }

  const input = normalizeContactInput(formData);
  const validationError = validateInput(input);

  if (validationError) {
    redirect('/phonelist?toast=error');
  }

  try {
    await updateCsvContact(id, input);
    revalidatePath('/phonelist');
  } catch {
    redirect('/phonelist?toast=error');
  }

  redirect('/phonelist?toast=updated');
}

export async function deletePhoneListContactAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '').trim();
  if (!id) {
    redirect('/phonelist?toast=error');
  }

  try {
    await deleteCsvContact(id);
    revalidatePath('/phonelist');
  } catch {
    redirect('/phonelist?toast=error');
  }

  redirect('/phonelist?toast=deleted');
}

export async function deletePhoneListContactsBulkAction(formData: FormData): Promise<void> {
  const idsRaw = String(formData.get('ids') || '[]');

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(idsRaw);
    if (Array.isArray(parsed)) {
      ids = parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
  } catch {
    redirect('/phonelist?toast=error');
  }

  if (ids.length === 0) {
    redirect('/phonelist?toast=error');
  }

  try {
    await Promise.all(ids.map((id) => deleteCsvContact(id)));
    revalidatePath('/phonelist');
  } catch {
    redirect('/phonelist?toast=error');
  }

  redirect('/phonelist?toast=deleted_bulk');
}
