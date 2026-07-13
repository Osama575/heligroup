import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { writeFile } from "fs/promises";

// @ts-ignore — JS modules without declarations
import { verifyPassword, issueSessionCookie, clearSessionCookie, getSession, csrfToken, verifyCsrf, requireAuth } from "../../../../lib/auth.js";
// @ts-ignore — JS modules without declarations
import { loadContent, saveContent } from "../../../../lib/content.js";
// @ts-ignore — JS modules without declarations
import { UPLOAD_DIR } from "../../../../lib/paths.js";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── GET /admin ── login page (redirects to editor if already signed in) ──────
router.get("/", (req: Request, res: Response) => {
  if (getSession(req)) return res.redirect("/admin/editor");
  res.render("admin/login", { error: false });
});

// ── POST /admin/login ── verify password, issue session ──────────────────────
router.post("/login", (req: Request, res: Response) => {
  const { password } = (req.body ?? {}) as { password?: string };
  if (verifyPassword(password)) {
    issueSessionCookie(req, res);
    return res.redirect("/admin/editor");
  }
  res.render("admin/login", { error: true });
});

// ── GET /admin/editor ── main content editor ─────────────────────────────────
router.get("/editor", requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session as any;
  const content = loadContent();
  res.render("admin/editor", { content, csrf: csrfToken(session), saved: false, err: null });
});

// ── POST /admin/save ── persist edited content ───────────────────────────────
router.post("/save", requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session as any;
  if (!verifyCsrf(session, req.body?._csrf)) {
    res.status(403).json({ error: "invalid csrf" });
    return;
  }
  try {
    const content = { ...req.body };
    delete content._csrf;
    delete content._full;
    saveContent(content);
    res.render("admin/editor", { content, csrf: csrfToken(session), saved: true, err: null });
  } catch (err: any) {
    const content = loadContent();
    res.render("admin/editor", { content, csrf: csrfToken(session), saved: false, err: err.message });
  }
});

// ── POST /admin/logout ── destroy session ────────────────────────────────────
router.post("/logout", requireAuth, (req: Request, res: Response) => {
  const session = (req as any).session as any;
  if (verifyCsrf(session, req.body?._csrf)) {
    clearSessionCookie(res);
  }
  res.redirect("/admin");
});

// ── POST /admin/upload ── image upload ───────────────────────────────────────
router.post(
  "/upload",
  requireAuth,
  upload.single("image"),
  async (req: Request, res: Response) => {
    const session = (req as any).session as any;
    const csrfHeader = req.headers["x-csrf-token"];
    if (!verifyCsrf(session, csrfHeader as string)) {
      res.status(403).json({ error: "invalid csrf" });
      return;
    }
    const file = (req as any).file as { originalname: string; buffer: Buffer } | undefined;
    if (!file) {
      res.status(400).json({ error: "no file" });
      return;
    }
    try {
      const ext = path.extname(file.originalname) || ".jpg";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      await writeFile(path.join(UPLOAD_DIR, filename), file.buffer);
      res.json({ url: `/img/uploads/${filename}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "upload failed" });
    }
  },
);

export default router;
