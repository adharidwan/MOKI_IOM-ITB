import { NextResponse } from 'next/server';

import { uploadBlastImage } from '@/app/lib/blast-media';
import {
  createScheduledBlast,
  listScheduledBlasts,
  type SaveScheduledBlastInput,
  type ScheduledBlastRecurrenceType,
  type ScheduledBlastScheduleType,
  type ScheduledBlastStatus,
} from '@/app/lib/scheduled-blast-service';
import type { BlastSource } from '@/app/lib/blast-dispatch-service';

function parseJsonArray<T>(value: FormDataEntryValue | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  return String(value || '').toLowerCase() === 'true';
}

async function parseScheduledBlastRequest(request: Request): Promise<SaveScheduledBlastInput> {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('multipart/form-data')) {
    return (await request.json()) as SaveScheduledBlastInput;
  }

  const formData = await request.formData();
  const image = formData.get('image');
  const media = image instanceof File && image.size > 0 ? await uploadBlastImage(image) : null;

  return {
    name: String(formData.get('name') || ''),
    message: String(formData.get('message') || ''),
    source: String(formData.get('source') || 'manual') as BlastSource,
    recipients: parseJsonArray(formData.get('recipients')),
    groupNames: parseJsonArray(formData.get('groupNames')),
    sourceFile: String(formData.get('sourceFile') || ''),
    scheduleType: String(formData.get('scheduleType') || 'once') as ScheduledBlastScheduleType,
    recurrenceType: (String(formData.get('recurrenceType') || '') || null) as ScheduledBlastRecurrenceType | null,
    runAt: String(formData.get('runAt') || '') || null,
    saveToGroup: parseBoolean(formData.get('saveToGroup')),
    saveGroupName: String(formData.get('saveGroupName') || ''),
    media,
  };
}

function parseFilter<T extends string>(value: string | null, allowed: T[]): T | 'all' {
  return allowed.includes(value as T) ? (value as T) : 'all';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await listScheduledBlasts({
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 10),
      search: searchParams.get('search') || '',
      status: parseFilter<ScheduledBlastStatus>(searchParams.get('status'), ['active', 'paused', 'completed', 'cancelled']),
      source: parseFilter<BlastSource>(searchParams.get('source'), ['manual', 'csv', 'contact', 'group']),
      scheduleType: parseFilter<ScheduledBlastScheduleType>(searchParams.get('scheduleType'), ['once', 'recurring']),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat scheduled blast.' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseScheduledBlastRequest(request);
    const item = await createScheduledBlast(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat scheduled blast.' },
      { status: 400 },
    );
  }
}
