import { prisma } from "../utils/db.js";
import type { ListConfig } from "../utils/listEngine.js";
import { STATUS_RU } from "../services/applications.js";
import type { AppStatus } from "@prisma/client";

const nums = (v: string[]) => v.map(Number).filter(Number.isFinite);
const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const NONE = "none";
const live = { status: { not: "REJECTED" as const } };

const plain = (key: string) => ({
  where: (v: string[]) => ({ [key]: { in: v } }),
  select: { [key]: true },
  pick: (r: any) => ({ value: r[key], label: r[key] }),
});

// «есть ли практика» = есть хотя бы одна не отклонённая (не REJECTED) заявка; sentinel «none» = «Без практики»
const viaApps = (v: string[], cond: (ids: string[]) => any) => {
  const ids = v.filter((x) => x !== NONE);
  const or: any[] = [];
  if (ids.length) or.push({ user: { appsAsStudent: { some: { ...live, ...cond(ids) } } } });
  if (v.includes(NONE)) or.push({ user: { appsAsStudent: { none: live } } });
  return { OR: or };
};
const appsSelect = { user: { select: { appsAsStudent: { where: live, select: { companyId: true, status: true, company: { select: { company: { select: { companyName: true } } } } } } } } };

// приоритет «текущей» практики студента
const PRIORITY: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "SIGNING", "COMPLETED", "INVITED", "PENDING"];

export const studentsList: ListConfig = {
  model: prisma.studentProfile,
  fileName: "students",
  base: (u) => ({ universityId: u.id }), // университет видит только своих студентов
  include: { user: { include: { appsAsStudent: { where: live, include: { company: { include: { company: true } } } } } } },
  fields: {
    faculty: plain("faculty"),
    specialty: plain("specialty"),
    city: plain("city"),
    course: {
      where: (v) => ({ course: { in: nums(v) } }),
      select: { course: true },
      pick: (r) => ({ value: String(r.course), label: `${r.course} курс` }),
      order: "value",
    },
    company: {
      where: (v) => viaApps(v, (ids) => ({ companyId: { in: ids } })),
      select: appsSelect,
      pick: (r) => {
        const apps = r.user.appsAsStudent;
        return apps.length ? apps.map((a: any) => ({ value: a.companyId, label: a.company.company?.companyName ?? "" })) : { value: NONE, label: "Без практики" };
      },
    },
    status: {
      where: (v) => viaApps(v, (ids) => ({ status: { in: ids.filter((x) => x in STATUS_RU) as AppStatus[] } })),
      select: appsSelect,
      pick: (r) => {
        const apps = r.user.appsAsStudent;
        return apps.length ? apps.map((a: any) => ({ value: a.status, label: STATUS_RU[a.status as AppStatus] })) : { value: NONE, label: "Без практики" };
      },
    },
  },
  search: (q) => ({ OR: [{ firstName: ci(q) }, { lastName: ci(q) }, { specialty: ci(q) }] }),
  sorts: {
    name: (d) => ({ lastName: d }),
    specialty: (d) => ({ specialty: d }),
    course: (d) => ({ course: d }),
    faculty: (d) => ({ faculty: d }),
    city: (d) => ({ city: d }),
  },
  defaultSort: "name:asc",
  serialize: (s) => {
    const apps = [...s.user.appsAsStudent].sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status));
    const cur = apps[0];
    return {
      id: s.userId, firstName: s.firstName, lastName: s.lastName, faculty: s.faculty, specialty: s.specialty,
      course: s.course, city: s.city, skills: s.skills,
      company: cur?.company.company?.companyName ?? null,
      status: cur?.status ?? null,
      statusLabel: cur ? STATUS_RU[cur.status as AppStatus] : "Без практики",
    };
  },
  csv: () => ({
    headers: ["ФИО", "Специальность", "Факультет", "Курс", "Город", "Компания", "Статус практики"],
    row: (s) => [`${s.lastName} ${s.firstName}`, s.specialty, s.faculty, s.course, s.city, s.company ?? "—", s.statusLabel],
  }),
};
