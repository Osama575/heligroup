// File-based content store for the CMS.
// The whole editable site lives in content/content.json. Pages render from it,
// the admin panel writes to it. Reads are fresh each request (the file is small)
// with an in-memory last-good fallback so a bad write can never take the site down.

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync } from "fs";
import path from "path";
import { CONTENT_PATH, SEED_CONTENT_PATH } from "./paths.js";

let lastGood = null;

// On a fresh DATA_DIR (e.g. a newly mounted disk in production), seed the store
// with the committed content.json so the site has content on first boot.
if (!existsSync(CONTENT_PATH) && existsSync(SEED_CONTENT_PATH) && CONTENT_PATH !== SEED_CONTENT_PATH) {
  try {
    mkdirSync(path.dirname(CONTENT_PATH), { recursive: true });
    copyFileSync(SEED_CONTENT_PATH, CONTENT_PATH);
    console.log(`[content] seeded ${CONTENT_PATH} from committed default`);
  } catch (err) {
    console.error("[content] seed failed:", err.message);
  }
}

// Minimal fallback so the site still renders if the file is missing/corrupt on boot.
const FALLBACK = {
  site: { name: "THEHELIGROUP", tagline: "", email145: "", email147: "", coords: "", address: [], ownerEmail: "" },
  nav: [{ label: "Home", href: "/" }],
  home: { hero: {}, marks: [], about: { body: [], figures: [] }, why: { items: [] }, quote: {}, trustedMarks: [] },
  services: { hero: {}, maintenance: {}, related: [] },
  training: { hero: {}, pillar: {}, points: [] },
  fleet: { hero: {}, types: [] },
  contact: { hero: {}, rows: [] },
  chatbot: { intro: "", qa: [] },
};

export function loadContent() {
  try {
    const raw = readFileSync(CONTENT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    lastGood = parsed;
    return parsed;
  } catch (err) {
    console.error("[content] read failed, using fallback:", err.message);
    return lastGood || FALLBACK;
  }
}

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

// Every field a template renders as a list — must stay an array or a page 500s.
const ARRAY_FIELDS = [
  "nav", "site.address", "home.marks", "home.about.body", "home.about.figures",
  "home.why.items", "home.trustedMarks", "services.related", "training.points",
  "fleet.types", "contact.rows", "chatbot.qa",
];
// Nested blocks a template dereferences — must stay objects.
const OBJECT_FIELDS = [
  "site", "home.hero", "home.about", "home.why", "home.quote",
  "services.hero", "services.maintenance", "training.hero", "training.pillar",
  "fleet.hero", "contact.hero", "chatbot",
];

// Structural validation before we ever overwrite the file — reject a save that
// would corrupt the live site rather than writing it.
export function validateContent(obj) {
  if (!obj || typeof obj !== "object") return "content must be an object";
  for (const page of ["home", "services", "training", "fleet", "contact"]) {
    if (!obj[page] || typeof obj[page] !== "object") return `missing page: ${page}`;
  }
  for (const path of OBJECT_FIELDS) {
    const v = get(obj, path);
    if (!v || typeof v !== "object" || Array.isArray(v)) return `${path} must be an object`;
  }
  for (const path of ARRAY_FIELDS) {
    if (!Array.isArray(get(obj, path))) return `${path} must be an array`;
  }
  return null; // valid
}

// Atomic write: temp file + rename, so a crash mid-write can't corrupt content.json.
export function saveContent(obj) {
  const err = validateContent(obj);
  if (err) throw new Error(`invalid content: ${err}`);
  mkdirSync(path.dirname(CONTENT_PATH), { recursive: true });
  const tmp = CONTENT_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  renameSync(tmp, CONTENT_PATH);
  lastGood = obj;
  return obj;
}
