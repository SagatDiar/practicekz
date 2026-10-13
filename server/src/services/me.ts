import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";

export async function loadMe(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, include: { student: true, company: true, university: true } });
  if (!u) throw new HttpError(401, "Пользователь не найден");
  const { passwordHash: _omit, ...safe } = u;
  let universityName: string | null = null;
  if (u.student) {
    const up = await prisma.universityProfile.findUnique({ where: { userId: u.student.universityId } });
    universityName = up?.shortName ?? null;
  }
  return { ...safe, universityName };
}
