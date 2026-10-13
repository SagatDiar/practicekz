import { Router } from "express";
import type { AppStatus } from "@prisma/client";
import { prisma } from "../utils/db.js";
import { requireAuth } from "../middleware/auth.js";
import { listInclude, serialize } from "../services/applications.js";
import { include as practiceInclude, practiceView } from "../lists/practices.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const APPROVED: AppStatus[] = ["SIGNING", "ACTIVE", "FINISH_REQUESTED", "COMPLETED"];
const RUNNING: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

dashboardRouter.get("/", async (req, res) => {
  const { id, role } = req.user!;

  if (role === "STUDENT") {
    const me = await prisma.studentProfile.findUniqueOrThrow({ where: { userId: id } });
    const notApplied = { applications: { none: { studentId: id } } };
    const [suitable, total, approved, pending, running, sameCity] = await Promise.all([
      prisma.practice.count({ where: notApplied }),
      prisma.application.count({ where: { studentId: id } }),
      prisma.application.count({ where: { studentId: id, status: { in: APPROVED } } }),
      prisma.application.count({ where: { studentId: id, status: "PENDING" } }),
      prisma.application.findMany({ where: { studentId: id, status: { in: RUNNING } }, include: listInclude, orderBy: { date: "desc" } }),
      prisma.practice.findMany({ where: { ...notApplied, city: me.city }, include: practiceInclude, orderBy: { datePublished: "desc" }, take: 3 }),
    ]);
    // рекомендации: сначала практики в городе студента, остальное добираем новыми
    let rec = sameCity;
    if (rec.length < 3) {
      const more = await prisma.practice.findMany({
        where: { ...notApplied, id: { notIn: rec.map((r) => r.id) } }, include: practiceInclude,
        orderBy: { datePublished: "desc" }, take: 3 - rec.length,
      });
      rec = [...rec, ...more];
    }
    return void res.json({
      role, stats: { suitable, total, approved, pending },
      running: running.map(serialize), recommended: rec.map((p) => practiceView(p, new Set())),
    });
  }

  if (role === "COMPANY") {
    const [practices, total, approved, fresh, latest] = await Promise.all([
      prisma.practice.count({ where: { companyId: id } }),
      prisma.application.count({ where: { companyId: id } }),
      prisma.application.count({ where: { companyId: id, status: { in: APPROVED } } }),
      prisma.application.count({ where: { companyId: id, status: "PENDING" } }),
      prisma.application.findMany({ where: { companyId: id }, include: listInclude, orderBy: { date: "desc" }, take: 5 }),
    ]);
    return void res.json({ role, stats: { practices, total, approved, fresh }, latest: latest.map(serialize) });
  }

  const awaiting = { universityId: id, status: "SIGNING" as const, signedByUniversity: false };
  const [students, companies, inPractice, completed, awaitingCount, needSign] = await Promise.all([
    prisma.studentProfile.count({ where: { universityId: id } }),
    prisma.companyProfile.count(),
    prisma.application.count({ where: { universityId: id, status: { in: ["ACTIVE", "FINISH_REQUESTED"] } } }),
    prisma.application.count({ where: { universityId: id, status: "COMPLETED" } }),
    prisma.application.count({ where: awaiting }),
    prisma.application.findMany({ where: awaiting, include: listInclude, orderBy: { date: "asc" }, take: 10 }),
  ]);
  res.json({ role, stats: { students, companies, inPractice, completed, awaiting: awaitingCount }, needSign: needSign.map(serialize) });
});
