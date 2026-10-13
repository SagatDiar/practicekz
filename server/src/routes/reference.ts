import { Router } from "express";
import type { RefKind } from "@prisma/client";
import { prisma } from "../utils/db.js";

export const referenceRouter = Router();

const list = (kind: RefKind) => async (_req: unknown, res: import("express").Response) => {
  const rows = await prisma.reference.findMany({ where: { kind }, orderBy: { sort: "asc" } });
  res.json({ items: rows.map((r) => r.value) });
};
referenceRouter.get("/cities", list("CITY"));
referenceRouter.get("/faculties", list("FACULTY"));
referenceRouter.get("/specialties", list("SPECIALTY"));

// Публичный список — нужен на странице регистрации
referenceRouter.get("/universities", async (_req, res) => {
  const rows = await prisma.universityProfile.findMany({ orderBy: { shortName: "asc" } });
  res.json({ items: rows.map((u) => ({ id: u.userId, name: u.universityName, shortName: u.shortName, city: u.city })) });
});
