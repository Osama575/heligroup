import { Router, type IRouter, type Request, type Response } from "express";

// @ts-ignore — JS module without declarations
import { loadContent } from "../../../../lib/content.js";

const router: IRouter = Router();

function renderPage(template: string, currentHref: string) {
  return (_req: Request, res: Response) => {
    const content = loadContent();
    res.render(template, { content, currentHref });
  };
}

router.get("/", renderPage("pages/home", "/"));
router.get("/services", renderPage("pages/services", "/services"));
router.get("/training", renderPage("pages/training", "/training"));
router.get("/fleet", renderPage("pages/fleet", "/fleet"));
router.get("/contact", renderPage("pages/contact", "/contact"));

export default router;
