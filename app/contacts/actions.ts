'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  addCsvContactsGroups,
  createCsvContact,
  deleteCsvContact,
  updateCsvContact,
  type CsvContactInput,
} from '../lib/api';

function parseGroupNames(rawValue: string): string[] {
  return rawValue
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeContactInput(formData: FormData): CsvContactInput {
  return {
    no_telp: String(formData.get('no_telp') || '').trim(),
    nama: String(formData.get('nama') || '').trim(),
    jenis_kelamin: String(formData.get('jenis_kelamin') || '').trim(),
    jabatan: String(formData.get('jabatan') || '').trim() || undefined,
    group_names: parseGroupNames(String(formData.get('group_names') || '')),
  };
}

function validateInput(input: CsvContactInput): string | null {
  if (!input.no_telp) return 'Nomor telepon wajib diisi.';
  if (!input.nama) return 'Nama wajib diisi.';
  if (!input.jenis_kelamin) return 'Jenis kelamin wajib dipilih.';
  return null;
}

function revalidateContactPages() {
  revalidatePath('/contacts');
  revalidatePath('/blastmessage');
  revalidatePath('/csv');
  revalidatePath('/phonelist');
}

export async function createContactAction(formData: FormData): Promise<void> {
  const input = normalizeContactInput(formData);
  const validationError = validateInput(input);

  if (validationError) {
    redirect('/contacts?toast=error');
  }

  try {
    await createCsvContact(input);
    revalidateContactPages();
  } catch {
    redirect('/contacts?toast=error');
  }

  redirect('/contacts?toast=created');
}

export async function updateContactAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '').trim();
  if (!id) {
    redirect('/contacts?toast=error');
  }

  const input = normalizeContactInput(formData);
  const validationError = validateInput(input);

  if (validationError) {
    redirect('/contacts?toast=error');
  }

  try {
    await updateCsvContact(id, input);
    revalidateContactPages();
  } catch {
    redirect('/contacts?toast=error');
  }

  redirect('/contacts?toast=updated');
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') || '').trim();
  if (!id) {
    redirect('/contacts?toast=error');
  }

  try {
    await deleteCsvContact(id);
    revalidateContactPages();
  } catch {
    redirect('/contacts?toast=error');
  }

  redirect('/contacts?toast=deleted');
}

export async function deleteContactsBulkAction(formData: FormData): Promise<void> {
  const idsRaw = String(formData.get('ids') || '[]');

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(idsRaw);
    if (Array.isArray(parsed)) {
      ids = parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
  } catch {
    redirect('/contacts?toast=error');
  }

  if (ids.length === 0) {
    redirect('/contacts?toast=error');
  }

  try {
    await Promise.all(ids.map((id) => deleteCsvContact(id)));
    revalidateContactPages();
  } catch {
    redirect('/contacts?toast=error');
  }

  redirect('/contacts?toast=deleted_bulk');
}

export async function assignContactGroupAction(formData: FormData): Promise<void> {
  const idsRaw = String(formData.get('ids') || '[]');
  const groupNames = parseGroupNames(String(formData.get('group_names') || ''));

  if (groupNames.length === 0) {
    redirect('/contacts?toast=error');
  }

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(idsRaw);
    if (Array.isArray(parsed)) {
      ids = parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
  } catch {
    redirect('/contacts?toast=error');
  }

  if (ids.length === 0) {
    redirect('/contacts?toast=error');
  }

  try {
    await addCsvContactsGroups(ids, groupNames);
    revalidateContactPages();
  } catch {
    redirect('/contacts?toast=error');
  }

  redirect('/contacts?toast=grouped');
}
