'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createCsvContact, type CsvContactInput } from '../lib/api';

function normalizeContactInput(formData: FormData, groupName: string): CsvContactInput {
  return {
    no_telp: String(formData.get('no_telp') || '').trim(),
    nama: String(formData.get('nama') || '').trim(),
    jenis_kelamin: String(formData.get('jenis_kelamin') || '').trim(),
    group_names: [groupName],
  };
}

function validateInput(input: CsvContactInput, groupName: string): string | null {
  if (!groupName) return 'Nama grup wajib diisi.';
  if (!input.no_telp) return 'Nomor WhatsApp wajib diisi.';
  if (!input.nama) return 'Nama anggota wajib diisi.';
  if (!input.jenis_kelamin) return 'Jenis kelamin wajib dipilih.';
  return null;
}

function revalidateGroupPages() {
  revalidatePath('/group');
  revalidatePath('/contacts');
  revalidatePath('/blastmessage');
}

function redirectToGroup(groupName: string, toast: string) {
  const params = new URLSearchParams();
  params.set('group', groupName);
  params.set('toast', toast);
  redirect(`/group?${params.toString()}`);
}

export async function createGroupWithFirstMemberAction(formData: FormData): Promise<void> {
  const groupName = String(formData.get('group_name') || '').trim();
  const input = normalizeContactInput(formData, groupName);

  if (validateInput(input, groupName)) {
    redirect('/group?toast=error');
  }

  try {
    await createCsvContact(input);
    revalidateGroupPages();
  } catch {
    redirect('/group?toast=error');
  }

  redirectToGroup(groupName, 'group_created');
}

export async function createGroupMemberAction(formData: FormData): Promise<void> {
  const groupName = String(formData.get('group_name') || '').trim();
  const input = normalizeContactInput(formData, groupName);

  if (validateInput(input, groupName)) {
    redirect(groupName ? `/group?group=${encodeURIComponent(groupName)}&toast=error` : '/group?toast=error');
  }

  try {
    await createCsvContact(input);
    revalidateGroupPages();
  } catch {
    redirect(groupName ? `/group?group=${encodeURIComponent(groupName)}&toast=error` : '/group?toast=error');
  }

  redirectToGroup(groupName, 'member_created');
}
