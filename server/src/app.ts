import express from "express";
import path from "node:path";
import fs from "node:fs";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { originCheck } from "./middleware/security.js";
import { authRouter } from "./routes/auth.js";
import { referenceRouter } from "./routes/reference.js";
import { registryRouter } from "./routes/registry.js";
import { practicesRouter } from "./routes/practices.js";
import { applicationsRouter } from "./routes/applications.js";
import { studentsRouter } from "./routes/students.js";
import { companiesRouter } from "./routes/companies.js";
import { profileRouter } from "./routes/profile.js";
import { filesRouter } from "./routes/files.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { notificationsRouter } from "./routes/notifications.js";
import { statsRouter } from "./routes/stats.js";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(originCheck);

app.get("/api/health", (_req, res) => void res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/reference", referenceRouter);
app.use("/api/registry", registryRouter);
app.use("/api/practices", practicesRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/students", studentsRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/profile", profileRouter);
app.use("/api/files", filesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/stats", statsRouter);

// Продакшен: тот же сервер отдаёт собранный сайт (web/dist) — один адрес для всего
const webDist = path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => void res.sendFile(path.join(webDist, "index.html")));
}

app.use(notFound);
app.use(errorHandler);
