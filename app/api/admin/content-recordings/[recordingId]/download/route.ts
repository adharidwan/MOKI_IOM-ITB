import { spawn } from 'child_process';
import fs from 'fs';
import { mkdir, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';

import { NextResponse } from 'next/server';

import { requireAnyFeatureFromRequest } from '@/app/lib/access-control';
import { getContentRecordingById } from '@/app/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YT_DLP_CANDIDATE_PATHS = [
  process.env.YT_DLP_PATH,
  '/usr/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
];

function resolveYtDlpBinaryPath(): string {
  return YT_DLP_CANDIDATE_PATHS.find((candidate) => candidate && fs.existsSync(candidate)) || 'yt-dlp';
}

function sanitizeDownloadName(value: string, fallback: string): string {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]+/g, '_').replace(/"/g, "'");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function runYtDlpDownload(link: string, outputPath: string): Promise<void> {
  const command = resolveYtDlpBinaryPath();
  const child = spawn(command, [
    link,
    '--no-playlist',
    '--no-warnings',
    '--quiet',
    '--user-agent',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    '--referer',
    'https://www.youtube.com/',
    '--format',
    'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]',
    '--output',
    outputPath,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';

  return new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `yt-dlp gagal dengan exit code ${code}.`));
    });
  });
}

function createFileDownloadStream(filePath: string): ReadableStream<Uint8Array> {
  const nodeStream = fs.createReadStream(filePath);
  const cleanup = () => {
    void rm(filePath, { force: true });
  };

  nodeStream.on('close', cleanup);
  nodeStream.on('error', cleanup);

  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export async function GET(request: Request, { params }: { params: Promise<{ recordingId: string }> }) {
  let tempFilePath = '';

  try {
    await requireAnyFeatureFromRequest(request, ['content-record']);
    const { recordingId } = await params;
    const recording = await getContentRecordingById(recordingId);

    if (recording.platform !== 'youtube') {
      return NextResponse.json({ error: 'Download video saat ini hanya tersedia untuk konten YouTube.' }, { status: 400 });
    }

    if (!recording.link) {
      return NextResponse.json({ error: 'Link YouTube tidak tersedia untuk record ini.' }, { status: 400 });
    }

    const fileName = `${sanitizeDownloadName(recording.title || recording.source_post_id || recording.id, `youtube-${recording.id}`)}.mp4`;
    const tempDir = path.join(os.tmpdir(), 'content-recording-downloads');
    await mkdir(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `${crypto.randomUUID()}.mp4`);
    await runYtDlpDownload(recording.link, tempFilePath);
    const fileStats = await stat(tempFilePath);

    return new Response(createFileDownloadStream(tempFilePath), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileStats.size),
        'Content-Disposition': attachmentDisposition(fileName),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (tempFilePath) {
      await rm(tempFilePath, { force: true });
    }

    const errorMessage = error instanceof Error ? error.message : 'Gagal download video YouTube.';
    return NextResponse.json(
      { error: errorMessage },
      { status: errorMessage.includes('akses') || errorMessage.includes('Sesi SSO') ? 403 : 500 },
    );
  }
}
