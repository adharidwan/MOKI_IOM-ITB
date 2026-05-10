import { NextResponse } from 'next/server';

import {
  createScheduledBlast,
  listScheduledBlasts,
  type SaveScheduledBlastInput,
  type ScheduledBlastScheduleType,
  type ScheduledBlastStatus,
} from '@/app/lib/scheduled-blast-service';
import type { BlastSource } from '@/app/lib/blast-dispatch-service';

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
    const body = (await request.json()) as SaveScheduledBlastInput;
    const item = await createScheduledBlast(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal membuat scheduled blast.' },
      { status: 400 },
    );
  }
}
