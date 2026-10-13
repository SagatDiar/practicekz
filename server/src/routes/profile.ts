import { Router } from "express";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { loadMe } from "../services/me.js";
import { prepareAvatar, prepareCertificate, removeFile, storeFile, uploadCert, uploadPhoto } from "../utils/upload.js";
import { companyPatch, extraSchema, studentPatch, universityPatch } from "../validators/profile.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get("/", async (req, res) => void res.json({ user: await loadMe(req.user!.id) }));

profileRouter.patch("/", async (req, res) => {
  const { id, role } = req.user!;
  if (role === "STUDENT") {
    const d = studentPatch.parse(req.body);
    await prisma.$transaction([
      prisma.studentProfile.update({ where: { userId: id }, data: d }),
      ...(d.city ? [prisma.user.update({ where: { id }, data: { city: d.city } })] : []),
    ]);
  } else if (role === "COMPANY") {
    const parsed = companyPatch.parse(req.body);
    // у проверенной по реестру компании название — из реестра юрлиц, вручную его менять нельзя
    const current = await prisma.companyProfile.findUniqueOrThrow({ where: { userId: id } });
    const { companyName, ...rest } = parsed;
    const d = current.verified ? rest : parsed;
    await prisma.$transaction([
      prisma.companyProfile.update({ where: { userId: id }, data: d }),
      ...(parsed.city ? [prisma.user.update({ where: { id }, data: { city: parsed.city } })] : []),
    ]);
  } else {
    const d = universityPatch.parse(req.body);
    await prisma.$transaction([
      prisma.universityProfile.update({ where: { userId: id }, data: d }),
      ...(d.city ? [prisma.user.update({ where: { id }, data: { city: d.city } })] : []),
    ]);
  }
  res.json({ user: await loadMe(id) });
});

// Фото профиля / логотип — любая роль
profileRouter.post("/photo", uploadPhoto, async (req, res) => {
  const prepared = await prepareAvatar(req.file);
  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const f = await storeFile(me.id, "AVATAR", prepared);
  await prisma.user.update({ where: { id: me.id }, data: { photoFileId: f.id } });
  await removeFile(me.photoFileId);
  res.json({ user: await loadMe(me.id) });
});

// ---------- Дополнительное образование (студент) ----------
const student = requireRole("STUDENT");

export async function listExtra(studentProfileId: string) {
  const rows = await prisma.extraEducation.findMany({ where: { studentId: studentProfileId }, orderBy: { date: "desc" } });
  const files = await prisma.file.findMany({ where: { id: { in: rows.map((r) => r.fileId).filter(Boolean) as string[] } } });
  const byId = new Map(files.map((f) => [f.id, f]));
  return rows.map((r) => {
    const f = r.fileId ? byId.get(r.fileId) : null;
    return { id: r.id, type: r.type, title: r.title, organization: r.organization, date: r.date,
      file: f ? { id: f.id, originalName: f.originalName, mime: f.mime, size: f.size } : null };
  });
}

async function myProfile(userId: string) {
  const p = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!p) throw new HttpError(403, "Профиль студента не найден");
  return p;
}

profileRouter.get("/extra", student, async (req, res) => {
  res.json({ items: await listExtra((await myProfile(req.user!.id)).id) });
});

profileRouter.post("/extra", student, uploadCert, async (req, res) => {
  const p = await myProfile(req.user!.id);
  const d = extraSchema.parse(req.body);
  const prepared = req.file ? await prepareCertificate(req.file) : null; // проверяем ДО записи
  const f = prepared ? await storeFile(req.user!.id, "CERTIFICATE", prepared) : null;
  await prisma.extraEducation.create({ data: { ...d, studentId: p.id, fileId: f?.id ?? null } });
  res.status(201).json({ items: await listExtra(p.id) });
});

async function ownExtra(userId: string, id: string) {
  const p = await myProfile(userId);
  const e = await prisma.extraEducation.findUnique({ where: { id } });
  if (!e) throw new HttpError(404, "Запись не найдена");
  if (e.studentId !== p.id) throw new HttpError(403, "Это не ваша запись");
  return { p, e };
}

profileRouter.post("/extra/:id/file", student, uploadCert, async (req, res) => {
  const { p, e } = await ownExtra(req.user!.id, String(req.params.id));
  if (!req.file) throw new HttpError(400, "Выберите файл");
  const f = await storeFile(req.user!.id, "CERTIFICATE", await prepareCertificate(req.file));
  await prisma.extraEducation.update({ where: { id: e.id }, data: { fileId: f.id } });
  await removeFile(e.fileId);
  res.json({ items: await listExtra(p.id) });
});

profileRouter.delete("/extra/:id", student, async (req, res) => {
  const { p, e } = await ownExtra(req.user!.id, String(req.params.id));
  await prisma.extraEducation.delete({ where: { id: e.id } });
  await removeFile(e.fileId); // файл удаляется вместе с записью
  res.json({ items: await listExtra(p.id) });
});
