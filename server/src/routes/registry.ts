import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { isValidBin, normalizeBin } from "../utils/bin.js";
import { requireAuth } from "../middleware/auth.js";

export const registryRouter = Router();

const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: "Слишком много запросов. Повторите позже" },
});

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
function paging(q: Record<string, unknown>) {
  const page = Math.max(1, Math.floor(Number(q.page)) || 1);
  const asked = Math.floor(Number(q.limit)) || 25;
  const limit = [10, 25, 50, 100].includes(asked) ? asked : 25;
  return { page, limit, skip: (page - 1) * limit };
}

/** Сводка по реестрам — для главной страницы реестров. */
registryRouter.get("/summary", async (_req, res) => {
  const [universities, entities, activeEntities, companies, claimed] = await Promise.all([
    prisma.registryUniversity.count({ where: { active: true } }),
    prisma.legalEntity.count(),
    prisma.legalEntity.count({ where: { status: "ACTIVE" } }),
    prisma.companyProfile.count({ where: { verified: true } }),
    prisma.user.count({ where: { role: "UNIVERSITY", accountStatus: "ACTIVE" } }),
  ]);
  res.json({ universities, legalEntities: entities, activeLegalEntities: activeEntities, verifiedCompanies: companies, universitiesOnPlatform: claimed });
});

/** Реестр ВУЗов РК с поиском: открыт всем (нужен на странице регистрации студента). `id` — идентификатор для регистрации. */
registryRouter.get("/universities", async (req, res) => {
  const q = str(req.query.q), city = str(req.query.city);
  const { page, limit, skip } = paging(req.query);
  const where: Prisma.RegistryUniversityWhereInput = {
    active: true, profile: { isNot: null },
    ...(city ? { city } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { shortName: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.registryUniversity.count({ where }),
    prisma.registryUniversity.findMany({ where, orderBy: [{ city: "asc" }, { name: "asc" }], skip, take: limit, include: { profile: { include: { user: { select: { id: true, accountStatus: true } } } } } }),
  ]);
  res.json({
    items: rows.map((r) => ({
      id: r.profile!.user.id, registryId: r.id, name: r.name, shortName: r.shortName, city: r.city,
      onPlatform: r.profile!.user.accountStatus === "ACTIVE",
    })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)), limit,
  });
});

/** Проверка БИН при регистрации компании: возвращает данные из реестра, чтобы показать их до отправки формы. */
registryRouter.get("/legal-entities/lookup", lookupLimiter, async (req, res) => {
  const bin = normalizeBin(str(req.query.bin));
  if (!isValidBin(bin)) throw new HttpError(400, "Некорректный БИН: проверьте 12 цифр");
  const e = await prisma.legalEntity.findUnique({ where: { bin }, include: { company: { select: { id: true } } } });
  if (!e) throw new HttpError(404, "Организация с таким БИН не найдена в реестре юридических лиц РК");
  res.json({
    bin: e.bin, name: e.name, legalForm: e.legalForm, industry: e.industry, city: e.city,
    active: e.status === "ACTIVE", registered: !!e.company,
  });
});

/** Просмотр реестра юрлиц — только для вошедших пользователей. */
registryRouter.get("/legal-entities", requireAuth, async (req, res) => {
  const q = str(req.query.q), city = str(req.query.city), status = str(req.query.status);
  const { page, limit, skip } = paging(req.query);
  const digits = q.replace(/\D/g, "");
  const where: Prisma.LegalEntityWhereInput = {
    ...(city ? { city } : {}),
    ...(status === "ACTIVE" || status === "LIQUIDATED" ? { status } : {}),
    ...(q ? (digits.length >= 4 && digits.length === q.replace(/\s/g, "").length
      ? { bin: { startsWith: digits } }
      : { name: { contains: q, mode: "insensitive" } }) : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.legalEntity.count({ where }),
    prisma.legalEntity.findMany({ where, orderBy: { name: "asc" }, skip, take: limit,
      select: { bin: true, name: true, legalForm: true, industry: true, city: true, status: true, registeredAt: true, company: { select: { id: true } } } }),
  ]);
  res.json({
    items: rows.map(({ company, ...e }) => ({ ...e, onPlatform: !!company })),
    total, page, pages: Math.max(1, Math.ceil(total / limit)), limit,
  });
});
