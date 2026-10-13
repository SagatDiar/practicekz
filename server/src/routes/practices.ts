import { Router } from "express";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { practiceSchema, practiceUpdateSchema } from "../validators/practice.js";
import { mountList } from "../utils/listEngine.js";
import { include, practiceView as view, practicesList } from "../lists/practices.js";

export const practicesRouter = Router();
practicesRouter.use(requireAuth);

mountList(practicesRouter, practicesList);

practicesRouter.get("/:id", async (req, res) => {
  const p = await prisma.practice.findUnique({ where: { id: String(req.params.id) }, include });
  if (!p) throw new HttpError(404, "Практика не найдена");
  let applied: Set<string> | undefined;
  if (req.user!.role === "STUDENT") {
    const a = await prisma.application.findUnique({ where: { studentId_practiceId: { studentId: req.user!.id, practiceId: p.id } } });
    applied = new Set(a ? [p.id] : []);
  }
  res.json({ practice: view(p, applied) });
});

practicesRouter.post("/", requireRole("COMPANY"), async (req, res) => {
  const data = practiceSchema.parse(req.body);
  const p = await prisma.practice.create({ data: { ...data, companyId: req.user!.id }, include });
  res.status(201).json({ practice: view(p) });
});

async function ownPractice(id: string, companyId: string) {
  const p = await prisma.practice.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, "Практика не найдена");
  if (p.companyId !== companyId) throw new HttpError(403, "Это не ваша практика");
  return p;
}

practicesRouter.patch("/:id", requireRole("COMPANY"), async (req, res) => {
  const id = String(req.params.id);
  await ownPractice(id, req.user!.id);
  const p = await prisma.practice.update({ where: { id }, data: practiceUpdateSchema.parse(req.body), include });
  res.json({ practice: view(p) });
});

practicesRouter.delete("/:id", requireRole("COMPANY"), async (req, res) => {
  const id = String(req.params.id);
  await ownPractice(id, req.user!.id);
  if (await prisma.application.count({ where: { practiceId: id } })) {
    throw new HttpError(409, "Нельзя удалить практику, на которую есть заявки");
  }
  await prisma.practice.delete({ where: { id } });
  res.json({ ok: true });
});
