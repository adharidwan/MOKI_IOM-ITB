import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

const IG_STATUS_PATH = path.join(
  process.cwd(),
  ".cache",
  "ig-scrape-status.json",
);

export async function GET() {
  try {
    if (!fs.existsSync(IG_STATUS_PATH)) {
      return NextResponse.json({
        stage: "idle",
        message: "Siap",
        updatedAt: new Date(0).toISOString(),
      });
    }

    const raw = fs.readFileSync(IG_STATUS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as {
      stage?: string;
      message?: string;
      updatedAt?: string;
    };

    return NextResponse.json({
      stage: parsed.stage || "idle",
      message: parsed.message || "Siap",
      updatedAt: parsed.updatedAt || new Date(0).toISOString(),
    });
  } catch {
    return NextResponse.json({
      stage: "idle",
      message: "Siap",
      updatedAt: new Date(0).toISOString(),
    });
  }
}
