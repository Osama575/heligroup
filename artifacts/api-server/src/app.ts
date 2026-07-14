import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import adminRouter from "./routes/admin.js";
import pageRouter from "./routes/pages.js";
import { logger } from "./lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDist = __dirname.endsWith("/dist") || __dirname.endsWith("\\dist");

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── EJS view engine for admin CMS ───────────────────────────────────────────
app.set("view engine", "ejs");
const viewsDir = isDist
  ? path.join(__dirname, "views")
  : path.join(__dirname, "..", "..", "..", "views");
app.set("views", viewsDir);

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Admin CMS routes (mounted at /admin) ────────────────────────────────────
app.use("/admin", adminRouter);

// Serve the static frontend.
const publicDir = isDist
  ? path.join(__dirname, "public")
  : path.join(__dirname, "..", "public");

app.use(express.static(publicDir));

// ── Page routes (EJS-rendered from content.json) ─────────────────────────────
app.use(pageRouter);

export default app;
