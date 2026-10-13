import { prisma } from "../utils/db.js";
import type { ListConfig } from "../utils/listEngine.js";
import { STATUS_RU, listInclude, scopeFor, serialize } from "../services/applications.js";

const nums = (v: string[]) => v.map(Number).filter(Number.isFinite);
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const stu = (r: any) => r.student.student;
const studentField = (key: string) => ({
  where: (v: string[]) => ({ student: { student: { [key]: { in: v } } } }),
  select: { student: { select: { student: { select: { [key]: true } } } } },
  pick: (r: any) => (stu(r) ? { value: stu(r)[key], label: stu(r)[key] } : null),
});

export const applicationsList: ListConfig = {
  model: prisma.application,
  fileName: "applications",
  include: listInclude,
  base: scopeFor,
  fields: {
    status: {
      where: (v) => ({ status: { in: v.filter((x) => x in STATUS_RU) as any } }), // неизвестные значения не должны ронять запрос (500)
      select: { status: true },
      pick: (r) => ({ value: r.status, label: STATUS_RU[r.status as keyof typeof STATUS_RU] }),
    },
    company: {
      where: (v) => ({ companyId: { in: v } }),
      select: { companyId: true, company: { select: { company: { select: { companyName: true } } } } },
      pick: (r) => ({ value: r.companyId, label: r.company.company?.companyName ?? "" }),
    },
    practice: {
      where: (v) => ({ practiceId: { in: v } }),
      select: { practiceId: true, practice: { select: { title: true } } },
      pick: (r) => ({ value: r.practiceId, label: r.practice.title }),
    },
    duration: {
      where: (v) => ({ practice: { durationMonths: { in: nums(v) } } }),
      select: { practice: { select: { durationMonths: true } } },
      pick: (r) => ({ value: String(r.practice.durationMonths), label: `${r.practice.durationMonths} мес.` }),
      order: "value",
    },
    city: {
      where: (v) => ({ practice: { city: { in: v } } }),
      select: { practice: { select: { city: true } } },
      pick: (r) => ({ value: r.practice.city, label: r.practice.city }),
    },
    studentCity: {
      ...studentField("city"),
    },
    specialty: studentField("specialty"),
    faculty: studentField("faculty"),
    course: {
      where: (v) => ({ student: { student: { course: { in: nums(v) } } } }),
      select: { student: { select: { student: { select: { course: true } } } } },
      pick: (r) => (stu(r) ? { value: String(stu(r).course), label: `${stu(r).course} курс` } : null),
      order: "value",
    },
    university: {
      where: (v) => ({ universityId: { in: v } }),
      select: { universityId: true, university: { select: { university: { select: { shortName: true } } } } },
      pick: (r) => ({ value: r.universityId, label: r.university.university?.shortName ?? "" }),
    },
  },
  // диапазон даты подачи: dateFrom / dateTo (YYYY-MM-DD)
  extra: (q) => {
    const from = q.dateFrom ? new Date(String(q.dateFrom)) : null;
    const to = q.dateTo ? new Date(`${q.dateTo}T23:59:59.999Z`) : null;
    const date: any = {};
    if (from && !isNaN(+from)) date.gte = from;
    if (to && !isNaN(+to)) date.lte = to;
    return Object.keys(date).length ? { date } : undefined;
  },
  search: (q) => ({
    OR: [
      { practice: { title: ci(q) } },
      { company: { company: { companyName: ci(q) } } },
      { student: { student: { firstName: ci(q) } } },
      { student: { student: { lastName: ci(q) } } },
    ],
  }),
  sorts: {
    date: (d) => ({ date: d }),
    status: (d) => ({ status: d }),
    company: (d) => ({ company: { company: { companyName: d } } }),
    practice: (d) => ({ practice: { title: d } }),
    student: (d) => ({ student: { student: { lastName: d } } }),
    specialty: (d) => ({ student: { student: { specialty: d } } }),
    duration: (d) => ({ practice: { durationMonths: d } }),
  },
  defaultSort: "date:desc",
  serialize: (r) => serialize(r),
  csv: (u) => {
    const d = (x: any) => (x ? new Date(x).toISOString().slice(0, 10) : "");
    const sign = (a: any) => ["student", "company", "university"].map((k) => (a.signatures[k].signed ? "да" : "нет")).join(" / ");
    const fio = (a: any) => (a.student ? `${a.student.lastName} ${a.student.firstName}` : "");
    if (u.role === "STUDENT")
      return { headers: ["Компания", "Практика", "Дата подачи", "Статус", "Подписи (студент / компания / университет)"],
        row: (a) => [a.company.name, a.practice.title, d(a.date), a.statusLabel, sign(a)] };
    if (u.role === "COMPANY")
      return { headers: ["Студент", "Специальность", "Навыки", "Практика", "Дата подачи", "Статус", "Подписи (студент / компания / университет)"],
        row: (a) => [fio(a), a.student?.specialty, a.student?.skills, a.practice.title, d(a.date), a.statusLabel, sign(a)] };
    return { headers: ["Студент", "Компания", "Специальность", "Практика", "Статус", "Подписи (студент / компания / университет)"],
      row: (a) => [fio(a), a.company.name, a.student?.specialty, a.practice.title, a.statusLabel, sign(a)] };
  },
};
