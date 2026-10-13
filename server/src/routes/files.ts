import { Router } from "express";
import path from "node:path";
import type { File } from "@prisma/client";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { requireAuth } from "../middleware/auth.js";
import { UPLOAD_DIR } from "../utils/upload.js";
import type { Actor } from "../services/applications.js";

export const filesRouter = Router();
filesRouter.use(requireAuth);

/** Аватары видны авторизованным; сертификаты — владельцу, его университету и компании, куда он подавал заявку. */
async function canAccess(u: Actor, f: File) {
  if (f.ownerId === u.id || f.kind === "AVATAR") return true;
  if (u.role === "UNIVERSITY") {
    const s = await prisma.studentProfile.findUnique({ where: { userId: f.ownerId } });
    return s?.universityId === u.id;
  }
  if (u.role === "COMPANY") return (await prisma.application.count({ where: { studentId: f.ownerId, companyId: u.id } })) > 0;
  return false;
}

filesRouter.get("/:id", async (req, res) => {
  const f = await prisma.file.findUnique({ where: { id: String(req.params.id) } });
  if (!f) throw new HttpError(404, "Файл не найден");
  if (!(await canAccess(req.user!, f))) throw new HttpError(403, "Нет доступа к файлу");
  const download = req.query.download === "1" || f.mime === "application/pdf";
  res.setHeader("Content-Type", f.mime);
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(path.join(UPLOAD_DIR, f.path));
});
