"use server";

import fs from "node:fs";
import path from "node:path";

export type InstagramScrapeStage =
  | "idle"
  | "finding-posts"
  | "completing-details"
  | "done"
  | "error";

export interface InstagramScrapeStatus {
  stage: InstagramScrapeStage;
  message: string;
  updatedAt: string;
}

const IG_STATUS_PATH = path.join(
  process.cwd(),
  ".cache",
  "ig-scrape-status.json",
);

function ensureStatusDir(): void {
  const statusDir = path.dirname(IG_STATUS_PATH);

  if (!fs.existsSync(statusDir)) {
    fs.mkdirSync(statusDir, { recursive: true });
  }
}

export function writeInstagramScrapeStatus(
  status: Omit<InstagramScrapeStatus, "updatedAt">,
): void {
  ensureStatusDir();

  fs.writeFileSync(
    IG_STATUS_PATH,
    JSON.stringify(
      {
        ...status,
        updatedAt: new Date().toISOString(),
      } satisfies InstagramScrapeStatus,
      null,
      2,
    ),
    "utf-8",
  );
}

export function readInstagramScrapeStatus(): InstagramScrapeStatus {
  try {
    if (!fs.existsSync(IG_STATUS_PATH)) {
      return {
        stage: "idle",
        message: "Siap",
        updatedAt: new Date(0).toISOString(),
      };
    }

    const raw = fs.readFileSync(IG_STATUS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<InstagramScrapeStatus>;

    return {
      stage: parsed.stage || "idle",
      message: parsed.message || "Siap",
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    };
  } catch {
    return {
      stage: "idle",
      message: "Siap",
      updatedAt: new Date(0).toISOString(),
    };
  }
}

export function clearInstagramScrapeStatus(): void {
  writeInstagramScrapeStatus({ stage: "idle", message: "Siap" });
}
