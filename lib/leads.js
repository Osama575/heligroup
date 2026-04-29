// Append-only leads log. One JSON object per line.
// Swap this for a Postgres writer when wiring the real CRM — the call site in
// booking.js only needs `appendLead(record)`.

import fs from "fs/promises";
import path from "path";

const DEFAULT_PATH = "./leads.jsonl";

export async function appendLead(record) {
  const target = process.env.LEADS_LOG_PATH || DEFAULT_PATH;
  const line = JSON.stringify({ logged_at: new Date().toISOString(), ...record }) + "\n";
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.appendFile(target, line, "utf8");
}
