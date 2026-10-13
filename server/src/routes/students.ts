import { Router } from "express";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { mountList } from "../utils/listEngine.js";
import { studentsList } from "../lists/students.js";
import { listExtra } from "./profile.js";

export const studentsRouter = Router();
studentsRouter.use(requireAuth);

// Список — только университет и только свои студенты (base-условие в конфиге)
mountList(studentsRouter, studentsList, [requireRole("UNIVERSITY")]);

// Профиль студента: сам студент, его университет или компания, получившая от него заявку
studentsRouter.get("/:id", async (req, res) => {
  const u = req.user!;
  const id = String(req.params.id);
  const s = await prisma.studentProfile.findUnique({ where: { userId: id }, include: { user: true } });
  if (!s) throw new HttpError(404, "Студент не найден");
  const allowed =
    u.id === id ||
    (u.role === "UNIVERSITY" && s.universityId === u.id) ||
    (u.role === "COMPANY" && (await prisma.application.count({ where: { studentId: id, companyId: u.id } })) > 0);
  if (!allowed) throw new HttpError(403, "Нет доступа к профилю студента");
  const uni = await prisma.universityProfile.findUnique({ where: { userId: s.universityId } });
  res.json({
    student: {
      id, firstName: s.firstName, lastName: s.lastName, email: s.user.email, photoFileId: s.user.photoFileId,
      university: uni?.shortName ?? "", faculty: s.faculty, specialty: s.specialty, course: s.course, city: s.city, skills: s.skills,
      extra: await listExtra(s.id),
    },
  });
});
