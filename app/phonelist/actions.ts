'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  createCsvContact,
  deleteCsvContact,
  updateCsvContact,
  addCsvContactsGroups,
  type CsvContactInput,
} from '../lib/api';
import { createGroupBlastOutboundMessages } from '../lib/whatsapp-notification-repository';

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

export async function assignPhoneListGroupAction(formData: FormData): Promise<void> {
  const idsRaw = String(formData.get('ids') || '[]');
  const groupNames = parseGroupNames(String(formData.get('group_names') || ''));

  if (groupNames.length === 0) {
    redirect('/phonelist?toast=error');
  }

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
    await addCsvContactsGroups(ids, groupNames);
    revalidatePath('/phonelist');
  } catch {
    redirect('/phonelist?toast=error');
  }

  redirect('/phonelist?toast=grouped');
}

export async function sendGroupBlastAction(formData: FormData): Promise<void> {
  const groupNames = normalizeGroupNames(
    formData
      .getAll('group_names')
      .map((value) => String(value || '')),
  );
  const message = String(formData.get('message') || '').trim();

  if (!groupNames.length || !message) {
    redirect('/phonelist?toast=error');
  }

  try {
    const blastResult = await createGroupBlastOutboundMessages({ groupNames, content: message });

    if (blastResult.totalRecipients === 0) {
      redirect('/phonelist?toast=blast_empty');
    }

    if (blastResult.acceptedCount === 0) {
      redirect('/phonelist?toast=error');
    }

    revalidatePath('/phonelist');

    if (blastResult.failedCount > 0) {
      redirect('/phonelist?toast=blast_partial');
    }
  } catch {
    redirect('/phonelist?toast=error');
  }

  redirect('/phonelist?toast=blast_sent');
}

function normalizeGroupNames(values: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const groupName = value.trim();
    if (!groupName) {
      return;
    }

    const dedupeKey = groupName.toLowerCase();
    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    normalized.push(groupName);
  });

  return normalized;
}
