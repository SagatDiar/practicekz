import type { AppStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { calcProgress } from "./progress.js";
import { notify, runTx } from "./notify.js";

export interface Actor { id: string; role: Role }

export const STATUS_RU: Record<AppStatus, string> = {
  PENDING: "На рассмотрении",
  INVITED: "Приглашён на собеседование",
  REJECTED: "Отклонено",
  SIGNING: "На подписании (ЭЦП)",
  ACTIVE: "Практика идёт",
  FINISH_REQUESTED: "Ожидает подтверждения завершения",
  COMPLETED: "Практика завершена",
};

const RUNNING: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

export const listInclude = {
  practice: true,
  student: { include: { student: true } },
  company: { include: { company: true } },
  university: { include: { university: true } },
  diary: { select: { date: true }, orderBy: { date: "asc" }, take: 1 },
  _count: { select: { diary: true } },
} satisfies Prisma.ApplicationInclude;

const detailInclude = {
  ...listInclude,
  diary: { orderBy: { date: "desc" } },
} satisfies Prisma.ApplicationInclude;

/** Ограничение видимости по роли: студент — свои, компания — по своим практикам, университет — своих студентов. */
export const scopeFor = (u: Actor): Prisma.ApplicationWhereInput =>
  u.role === "STUDENT" ? { studentId: u.id } : u.role === "COMPANY" ? { companyId: u.id } : { universityId: u.id };

type Row = Prisma.ApplicationGetPayload<{ include: typeof listInclude }>;

export function serialize(a: Row | Prisma.ApplicationGetPayload<{ include: typeof detailInclude }>) {
  const firstDiary = a.diary.length ? a.diary.reduce((m, d) => (d.date < m ? d.date : m), a.diary[0].date) : null;
  const s = a.student.student;
  return {
    id: a.id,
    status: a.status,
    statusLabel: STATUS_RU[a.status],
    date: a.date,
    startDate: a.startDate,
    completedDate: a.completedDate,
    signatures: {
      student: { signed: a.signedByStudent, at: a.signedByStudentAt },
      company: { signed: a.signedByCompany, at: a.signedByCompanyAt },
      university: { signed: a.signedByUniversity, at: a.signedByUniversityAt },
    },
    practice: { id: a.practice.id, title: a.practice.title, city: a.practice.city, direction: a.practice.direction, durationMonths: a.practice.durationMonths, format: a.practice.format },
    company: { id: a.companyId, name: a.company.company?.companyName ?? "" },
    student: s && { id: a.studentId, firstName: s.firstName, lastName: s.lastName, faculty: s.faculty, specialty: s.specialty, course: s.course, city: s.city, skills: s.skills },
    university: { id: a.universityId, name: a.university.university?.shortName ?? "" },
    diaryCount: a._count.diary,
    reportText: a.reportText,
    reportDate: a.reportDate,
    progress: calcProgress(a, a.practice.durationMonths, firstDiary),
  };
}

export async function getVisible(id: string, u: Actor) {
  const a = await prisma.application.findFirst({ where: { id, ...scopeFor(u) }, include: detailInclude });
  if (!a) throw new HttpError(404, "Заявка не найдена");
  return a;
}

const name = (a: { student: { student: { firstName: string; lastName: string } | null } }) =>
  `${a.student.student?.firstName ?? ""} ${a.student.student?.lastName ?? ""}`.trim();

/**
 * Атомарный переход: updateMany с условием на статус и владельца — гонки невозможны.
 * Если строк не обновлено, определяем причину: 404 / 403 / 409.
 */
async function transition(
  tx: Prisma.TransactionClient,
  id: string,
  owner: Prisma.ApplicationWhereInput,
  from: AppStatus[],
  extraWhere: Prisma.ApplicationWhereInput,
  data: Prisma.ApplicationUncheckedUpdateManyInput,
  conflict: string
) {
  const r = await tx.application.updateMany({ where: { id, ...owner, status: { in: from }, ...extraWhere }, data });
  if (r.count === 1) return;
  const a = await tx.application.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "Заявка не найдена");
  const mine = await tx.application.count({ where: { id, ...owner } });
  if (!mine) throw new HttpError(403, "Нет доступа к этой заявке");
  throw new HttpError(409, conflict);
}

const loadFull = (tx: Prisma.TransactionClient, id: string) =>
  tx.application.findUniqueOrThrow({ where: { id }, include: listInclude });

// ---------- создание ----------
export async function createApplication(studentId: string, practiceId: string) {
  return runTx(async (tx) => {
    const profile = await tx.studentProfile.findUnique({ where: { userId: studentId } });
    if (!profile) throw new HttpError(403, "Профиль студента не найден");
    const uni = await tx.user.findFirst({ where: { id: profile.universityId, role: "UNIVERSITY" } });
    if (!uni) throw new HttpError(409, "У студента не указан университет");
    const practice = await tx.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new HttpError(404, "Практика не найдена");
    if (await tx.application.findUnique({ where: { studentId_practiceId: { studentId, practiceId } } })) {
      throw new HttpError(409, "Заявка на эту практику уже подана");
    }
    const a = await tx.application.create({
      data: { studentId, practiceId, companyId: practice.companyId, universityId: uni.id, status: "PENDING" },
    });
    const full = await loadFull(tx, a.id);
    const who = name(full);
    await notify(tx, [
      { userId: full.companyId, type: "APPLICATION_NEW", applicationId: a.id, text: `${who} подал(а) заявку на практику «${practice.title}»` },
      { userId: full.universityId, type: "APPLICATION_NEW", applicationId: a.id, text: `Ваш студент ${who} подал(а) заявку на практику «${practice.title}»` },
    ]);
    return full;
  });
}

// ---------- решения компании ----------
export async function companyDecision(id: string, companyId: string, action: "invite" | "approve" | "reject") {
  return runTx(async (tx) => {
    const owner = { companyId };
    const t = { invite: ["PENDING"], approve: ["PENDING", "INVITED"], reject: ["PENDING", "INVITED"] }[action] as AppStatus[];
    const data = {
      invite: { status: "INVITED" as const },
      approve: { status: "SIGNING" as const, signedByStudent: false, signedByCompany: false, signedByUniversity: false,
        signedByStudentAt: null, signedByCompanyAt: null, signedByUniversityAt: null },
      reject: { status: "REJECTED" as const },
    }[action];
    await transition(tx, id, owner, t, {}, data as Prisma.ApplicationUncheckedUpdateManyInput, `Действие недоступно в текущем статусе заявки`);
    const a = await loadFull(tx, id);
    const title = a.practice.title;
    const msgs = {
      invite: [{ userId: a.studentId, text: `Компания ${a.company.company?.companyName} пригласила вас на собеседование: «${title}»` }],
      approve: [
        { userId: a.studentId, text: `Заявка на «${title}» одобрена — подпишите ЭЦП` },
        { userId: a.universityId, text: `Требуется подпись ЭЦП университета: ${name(a)}, «${title}»` },
      ],
      reject: [
        { userId: a.studentId, text: `Заявка на «${title}» отклонена` },
        { userId: a.universityId, text: `Заявка вашего студента ${name(a)} на «${title}» отклонена` },
      ],
    }[action];
    await notify(tx, msgs.map((m) => ({ ...m, type: `APPLICATION_${action.toUpperCase()}`, applicationId: id })));
    return a;
  });
}

// ---------- подписи ЭЦП ----------
export async function signApplication(id: string, u: Actor) {
  return runTx(async (tx) => {
    const cfg = {
      STUDENT: { owner: { studentId: u.id }, flag: "signedByStudent", at: "signedByStudentAt" },
      COMPANY: { owner: { companyId: u.id }, flag: "signedByCompany", at: "signedByCompanyAt" },
      UNIVERSITY: { owner: { universityId: u.id }, flag: "signedByUniversity", at: "signedByUniversityAt" },
    }[u.role];
    await transition(tx, id, cfg.owner, ["SIGNING"], { [cfg.flag]: false } as Prisma.ApplicationWhereInput,
      { [cfg.flag]: true, [cfg.at]: new Date() } as Prisma.ApplicationUncheckedUpdateManyInput, "Заявка не на этапе подписания или вы уже подписали");

    let a = await loadFull(tx, id);
    const all = a.signedByStudent && a.signedByCompany && a.signedByUniversity;
    const title = a.practice.title;
    if (all) {
      // updateMany по статусу: при гонке двух последних подписей ACTIVE и уведомления создаются один раз
      const r = await tx.application.updateMany({ where: { id, status: "SIGNING" }, data: { status: "ACTIVE", startDate: new Date() } });
      if (r.count === 1) {
        await notify(tx, [a.studentId, a.companyId, a.universityId].map((userId) => ({
          userId, type: "PRACTICE_STARTED", applicationId: id, text: `Практика «${title}» началась (${name(a)})`,
        })));
      }
    } else {
      const label = { STUDENT: "студент", COMPANY: "компания", UNIVERSITY: "университет" }[u.role];
      const pending = [
        !a.signedByStudent && a.studentId, !a.signedByCompany && a.companyId, !a.signedByUniversity && a.universityId,
      ].filter(Boolean) as string[];
      await notify(tx, pending.map((userId) => ({
        userId, type: "SIGNED", applicationId: id, text: `ЭЦП поставил(а) ${label} по практике «${title}» — ждём вашу подпись`,
      })));
    }
    return loadFull(tx, id);
  });
}

// ---------- завершение ----------
export async function requestFinish(id: string, studentId: string) {
  return runTx(async (tx) => {
    await transition(tx, id, { studentId }, ["ACTIVE"], {}, { status: "FINISH_REQUESTED" }, "Завершение доступно только во время практики");
    const a = await loadFull(tx, id);
    await notify(tx, [{ userId: a.companyId, type: "FINISH_REQUESTED", applicationId: id,
      text: `${name(a)} завершил(а) практику «${a.practice.title}» — подтвердите завершение` }]);
    return a;
  });
}

export async function confirmFinish(id: string, companyId: string) {
  return runTx(async (tx) => {
    await transition(tx, id, { companyId }, ["FINISH_REQUESTED"], {}, { status: "COMPLETED", completedDate: new Date() },
      "Нет запроса на завершение");
    const a = await loadFull(tx, id);
    await notify(tx, [a.studentId, a.universityId].map((userId) => ({
      userId, type: "COMPLETED", applicationId: id, text: `Практика «${a.practice.title}» (${name(a)}) подтверждена как завершённая`,
    })));
    return a;
  });
}

// ---------- дневник и отчёт (только студент, только ACTIVE/FINISH_REQUESTED/COMPLETED) ----------
async function requireStudentRunning(tx: Prisma.TransactionClient, id: string, studentId: string) {
  const a = await tx.application.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "Заявка не найдена");
  if (a.studentId !== studentId) throw new HttpError(403, "Нет доступа к этой заявке");
  if (!RUNNING.includes(a.status)) throw new HttpError(409, "Дневник и отчёт доступны после начала практики");
  return a;
}

export async function addDiary(id: string, studentId: string, text: string, date?: Date) {
  return runTx(async (tx) => {
    const app = await requireStudentRunning(tx, id, studentId);
    const when = date ?? new Date();
    if (when.getTime() > Date.now() + 86400000) throw new HttpError(400, "Дата записи не может быть в будущем");
    const entry = await tx.diaryEntry.create({ data: { applicationId: id, text, date: when } });
    const full = await loadFull(tx, id);
    await notify(tx, [{ userId: app.companyId, type: "DIARY_ADDED", applicationId: id,
      text: `${name(full)} добавил(а) запись в дневник практики «${full.practice.title}»` }]);
    return entry;
  });
}

export async function saveReport(id: string, studentId: string, text: string) {
  return runTx(async (tx) => {
    await requireStudentRunning(tx, id, studentId);
    await tx.application.update({ where: { id }, data: { reportText: text, reportDate: new Date() } });
    const a = await loadFull(tx, id);
    await notify(tx, [a.companyId, a.universityId].map((userId) => ({
      userId, type: "REPORT_SUBMITTED", applicationId: id, text: `${name(a)} сдал(а) отчёт по практике «${a.practice.title}»`,
    })));
    return a;
  });
}
