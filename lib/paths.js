// Central storage paths.
//
// The CMS writes mutable data (content.json + uploaded images). On a persistent
// host those writes only survive redeploys if they live on a mounted disk, so the
// location is configurable via DATA_DIR:
//
//   • Local dev (DATA_DIR unset): data lives in the repo, exactly as before.
//   • Production: set DATA_DIR to a mounted persistent disk (e.g. /data). content
//     and uploads then persist across restarts and redeploys. On first boot the
//     committed content.json is copied onto the disk as the seed.

import path from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Where mutable data lives. Defaults to the repo root for local dev.
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : ROOT;

export const CONTENT_PATH = path.join(DATA_DIR, "content", "content.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "public", "img", "uploads");

// Committed defaults, always shipped in the repo — used to seed an empty DATA_DIR.
export const SEED_CONTENT_PATH = path.join(ROOT, "content", "content.json");

mkdirSync(path.dirname(CONTENT_PATH), { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });
