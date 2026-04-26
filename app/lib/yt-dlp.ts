import fs from 'fs';

import YTDlpWrap from 'yt-dlp-wrap';

const YT_DLP_CANDIDATE_PATHS = [
  process.env.YT_DLP_PATH,
  '/usr/bin/yt-dlp',
  '/usr/local/bin/yt-dlp',
];

function resolveYtDlpBinaryPath(): string | undefined {
  for (const candidate of YT_DLP_CANDIDATE_PATHS) {
    if (!candidate) {
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function createYtDlpClient(): YTDlpWrap {
  const binaryPath = resolveYtDlpBinaryPath();
  return binaryPath ? new YTDlpWrap(binaryPath) : new YTDlpWrap();
}
