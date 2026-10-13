import type { AppStatus, Prisma } from "@prisma/client";
import { prisma } from "../utils/db.js";
import { listWhere } from "../utils/listEngine.js";
import { toCsv } from "../utils/csv.js";
import { applicationsList } from "../lists/applications.js";
import { studentsList } from "../lists/students.js";
import { practicesList } from "../lists/practices.js";
import { STATUS_RU, type Actor } from "./applications.js";
import { calcProgress } from "./progress.js";

type Query = Record<string, any>;

export interface Kpi { key: string; label: string; value: number | null; suffix?: string; icon: string }
export interface BarRow { label: string; value: number; color?: string }
export interface Segment { key: string; label: string; value: number; color: string }
export type StatResult =
  | { type: "kpi"; items: Kpi[]; progress: { label: string; percent: number } | null }
  | { type: "doughnut"; unit: string; total: number; segments: Segment[] }
  | { type: "bars"; unit: string; suffix: string; ordered: "value" | "time"; rows: BarRow[] };

// ---------- справочники ----------
const ALL = Object.keys(STATUS_RU) as AppStatus[];
const APPROVED: AppStatus[] = ["SIGNING", "ACTIVE", "FINISH_REQUESTED", "COMPLETED"];
const IN_PROCESS: AppStatus[] = ["PENDING", "INVITED", "SIGNING"];
const RUNNING_NOW: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED"];
const WITH_DIARY: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

const COLOR: Record<AppStatus, string> = {
  PENDING: "#8892a6", INVITED: "#2f9fd8", REJECTED: "#c62828", SIGNING: "#e0a800",
  ACTIVE: "#2f6bff", FINISH_REQUESTED: "#f08c00", COMPLETED: "#178a3c",
};
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

// ---------- данные ----------
const appSelect = {
  status: true, date: true, startDate: true, studentId: true, companyId: true, universityId: true, practiceId: true,
  practice: { select: { title: true, direction: true, durationMonths: true } },
  company: { select: { company: { select: { companyName: true } } } },
  university: { select: { university: { select: { shortName: true } } } },
  _count: { select: { diary: true } },
  diary: { select: { date: true }, orderBy: { date: "asc" }, take: 1 },
} satisfies Prisma.ApplicationSelect;
type AppRow = Prisma.ApplicationGetPayload<{ select: typeof appSelect }>;

/** Заявки в рамках роли пользователя и применённых фильтров (тот же движок, что и у списков). */
const loadApps = (u: Actor, q: Query): Promise<AppRow[]> =>
  prisma.application.findMany({ where: listWhere(applicationsList, u, q), select: appSelect, take: 50000, orderBy: { date: "asc" } });

// ---------- хелперы ----------
const countIn = (rows: AppRow[], st: AppStatus[]) => rows.filter((r) => st.includes(r.status)).length;
const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : null);
const companyName = (r: AppRow) => r.company.company?.companyName || "—";
const sortRows = (rows: BarRow[]) => rows.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ru"));

function tally<T>(items: T[], keyOf: (x: T) => string, labelOf: (x: T) => string): BarRow[] {
  const m = new Map<string, BarRow>();
  for (const it of items) {
    const k = keyOf(it), cur = m.get(k);
    if (cur) cur.value++; else m.set(k, { label: labelOf(it) || "—", value: 1 });
  }
  return sortRows([...m.values()]);
}

const bars = (rows: BarRow[], unit: string, opts: { suffix?: string; ordered?: "value" | "time" } = {}): StatResult =>
  ({ type: "bars", unit, suffix: opts.suffix ?? "", ordered: opts.ordered ?? "value", rows });

/** Последние n календарных месяцев (UTC) по порядку; месяцы без заявок остаются нулями. */
function monthRows(dates: Date[], n = 6, now = new Date()): BarRow[] {
  const slots: { key: string; label: string; value: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    slots.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, value: 0 });
  }
  for (const dt of dates) {
    const s = slots.find((x) => x.key === `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`);
    if (s) s.value++;
  }
  return slots.map(({ label, value }) => ({ label, value }));
}

function statusDoughnut(rows: AppRow[]): StatResult {
  const segments = ALL.map((s) => ({ key: s, label: STATUS_RU[s], value: countIn(rows, [s]), color: COLOR[s] })).filter((s) => s.value > 0);
  return { type: "doughnut", unit: "заявок", total: rows.length, segments };
}

const statusBars = (rows: AppRow[]): StatResult =>
  bars(sortRows(ALL.map((s) => ({ label: STATUS_RU[s], value: countIn(rows, [s]), color: COLOR[s] }))), "заявок");

const kpi = (items: Kpi[], progress: { label: string; percent: number } | null = null): StatResult => ({ type: "kpi", items, progress });

/** Фильтры «студенческого» уровня для сводки университета: те же ключи, что у списка студентов (studentCity → city). */
function studentWhere(u: Actor, q: Query): Prisma.StudentProfileWhereInput {
  const arr = (v: unknown) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map(String).filter(Boolean));
  const w: Prisma.StudentProfileWhereInput = { universityId: u.id };
  if (arr(q.faculty).length) w.faculty = { in: arr(q.faculty) };
  if (arr(q.specialty).length) w.specialty = { in: arr(q.specialty) };
  if (arr(q.studentCity).length) w.city = { in: arr(q.studentCity) };
  const courses = arr(q.course).map(Number).filter(Number.isFinite);
  if (courses.length) w.course = { in: courses };
  return w;
}

// ---------- метрики ----------
type Metric = (u: Actor, q: Query) => Promise<StatResult>;

const student: Record<string, Metric> = {
  async overview(u, q) {
    const rows = await loadApps(u, q);
    const certs = await prisma.extraEducation.count({ where: { student: { userId: u.id } } });
    const approved = countIn(rows, APPROVED), rejected = countIn(rows, ["REJECTED"]);
    const running = rows.flatMap((r) => { const p = calcProgress(r, r.practice.durationMonths, r.diary[0]?.date); return p ? [p.percent] : []; });
    const avg = running.length ? Math.round(running.reduce((a, b) => a + b, 0) / running.length) : null;
    return kpi([
      { key: "total", label: "Всего заявок", value: rows.length, icon: "bi-file-earmark-text" },
      { key: "process", label: "В процессе", value: countIn(rows, IN_PROCESS), icon: "bi-hourglass-split" },
      { key: "running", label: "Практика идёт", value: countIn(rows, RUNNING_NOW), icon: "bi-play-circle" },
      { key: "done", label: "Завершено", value: countIn(rows, ["COMPLETED"]), icon: "bi-patch-check" },
      { key: "rejected", label: "Отклонено", value: rejected, icon: "bi-x-circle" },
      { key: "success", label: "Доля успешных решений", value: pct(approved, approved + rejected), suffix: "%", icon: "bi-graph-up-arrow" },
      { key: "diary", label: "Записей в дневнике", value: rows.reduce((s, r) => s + r._count.diary, 0), icon: "bi-journal-text" },
      { key: "certs", label: "Сертификатов / достижений", value: certs, icon: "bi-award" },
    ], avg == null ? null : { label: "Средний прогресс практик", percent: avg });
  },
  statuses: async (u, q) => statusDoughnut(await loadApps(u, q)),
  async months(u, q) { return bars(monthRows((await loadApps(u, q)).map((r) => r.date)), "заявок", { ordered: "time" }); },
  async progress(u, q) {
    const rows = (await loadApps(u, q)).flatMap((r) => {
      const p = calcProgress(r, r.practice.durationMonths, r.diary[0]?.date);
      return p ? [{ label: `${r.practice.title} · ${companyName(r)}`, value: p.percent }] : [];
    });
    return bars(sortRows(rows), "", { suffix: "%" });
  },
  async diary(u, q) {
    const rows = (await loadApps(u, q)).filter((r) => WITH_DIARY.includes(r.status))
      .map((r) => ({ label: `${r.practice.title} · ${companyName(r)}`, value: r._count.diary }));
    return bars(sortRows(rows), "записей");
  },
};

const company: Record<string, Metric> = {
  async summary(u, q) {
    const rows = await loadApps(u, q);
    const offers = await prisma.practice.count({ where: { companyId: u.id } });
    return kpi([
      { key: "offers", label: "Предложений", value: offers, icon: "bi-briefcase" },
      { key: "total", label: "Заявок", value: rows.length, icon: "bi-inbox" },
      { key: "fresh", label: "Новых", value: countIn(rows, ["PENDING"]), icon: "bi-bell" },
      { key: "approved", label: "Одобрено", value: countIn(rows, APPROVED), icon: "bi-check-circle" },
      { key: "rejected", label: "Отклонено", value: countIn(rows, ["REJECTED"]), icon: "bi-x-circle" },
      { key: "running", label: "Практика идёт", value: countIn(rows, RUNNING_NOW), icon: "bi-play-circle" },
      { key: "done", label: "Завершено", value: countIn(rows, ["COMPLETED"]), icon: "bi-patch-check" },
    ]);
  },
  statuses: async (u, q) => statusDoughnut(await loadApps(u, q)),
  async practices(u, q) { return bars(tally(await loadApps(u, q), (r) => r.practiceId, (r) => r.practice.title), "заявок"); },
  async universities(u, q) { return bars(tally(await loadApps(u, q), (r) => r.universityId, (r) => r.university.university?.shortName ?? ""), "заявок"); },
  async months(u, q) { return bars(monthRows((await loadApps(u, q)).map((r) => r.date)), "заявок", { ordered: "time" }); },
};

const countBy = (items: string[]): BarRow[] => tally(items, (x) => x, (x) => x);

const university: Record<string, Metric> = {
  async summary(u, q) {
    const rows = await loadApps(u, q);
    const [students, companies, offers] = await Promise.all([
      prisma.studentProfile.count({ where: studentWhere(u, q) }),
      prisma.companyProfile.count(),
      prisma.practice.count(),
    ]);
    const withPractice = new Set(rows.filter((r) => r.status !== "REJECTED").map((r) => r.studentId)).size;
    return kpi([
      { key: "students", label: "Студентов", value: students, icon: "bi-people" },
      { key: "companies", label: "Компаний", value: companies, icon: "bi-building" },
      { key: "offers", label: "Предложений", value: offers, icon: "bi-briefcase" },
      { key: "apps", label: "Заявок", value: rows.length, icon: "bi-inbox" },
      { key: "approved", label: "Одобрено", value: countIn(rows, APPROVED), icon: "bi-check-circle" },
      { key: "rejected", label: "Отклонено", value: countIn(rows, ["REJECTED"]), icon: "bi-x-circle" },
      { key: "coverage", label: "Студентов с практикой", value: pct(withPractice, students), suffix: "%", icon: "bi-mortarboard" },
    ]);
  },
  async statuses(u, q) {
    const rows = await loadApps(u, q);
    const segments: Segment[] = [
      { key: "practice", label: "На практике / завершено", value: countIn(rows, ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"]), color: "#178a3c" },
      { key: "process", label: "В процессе оформления", value: countIn(rows, IN_PROCESS), color: "#e0a800" },
      { key: "rejected", label: "Отклонено", value: countIn(rows, ["REJECTED"]), color: "#c62828" },
    ].filter((s) => s.value > 0);
    return { type: "doughnut", unit: "заявок", total: rows.length, segments };
  },
  async directions(u, q) {
    const rows = await prisma.practice.findMany({ where: listWhere(practicesList, u, q), select: { direction: true }, take: 50000 });
    return bars(countBy(rows.map((r) => r.direction)), "предложений");
  },
  async faculties(u, q) {
    const rows = await prisma.studentProfile.findMany({ where: listWhere(studentsList, u, q), select: { faculty: true }, take: 50000 });
    return bars(countBy(rows.map((r) => r.faculty)), "студентов");
  },
  async specialties(u, q) {
    const rows = await prisma.studentProfile.findMany({ where: listWhere(studentsList, u, q), select: { specialty: true }, take: 50000 });
    return bars(countBy(rows.map((r) => r.specialty)), "студентов");
  },
  byStatus: async (u, q) => statusBars(await loadApps(u, q)),
  async companies(u, q) {
    // «принятые» студенты: заявка дошла хотя бы до подписания; один студент у компании считается один раз
    const rows = (await loadApps(u, q)).filter((r) => APPROVED.includes(r.status));
    const per = new Map<string, { label: string; students: Set<string> }>();
    for (const r of rows) {
      const cur = per.get(r.companyId) ?? { label: companyName(r), students: new Set<string>() };
      cur.students.add(r.studentId);
      per.set(r.companyId, cur);
    }
    return bars(sortRows([...per.values()].map((c) => ({ label: c.label, value: c.students.size }))), "студентов");
  },
};

const METRICS: Record<string, Record<string, Metric>> = { student, company, university };

export const metricExists = (role: string, metric: string) => Object.hasOwn(METRICS[role] ?? {}, metric);
export const runStat = (role: string, metric: string, u: Actor, q: Query) => METRICS[role][metric](u, q);

export function statCsv(r: StatResult): string {
  if (r.type === "kpi")
    return toCsv(["Показатель", "Значение"], r.items.map((i) => [i.label, i.value == null ? "" : `${i.value}${i.suffix ?? ""}`]));
  if (r.type === "doughnut")
    return toCsv(["Категория", "Количество", "Доля, %"], r.segments.map((s) => [s.label, s.value, Math.round((s.value / r.total) * 100)]));
  return toCsv(["Название", `Значение${r.suffix ? ", " + r.suffix : r.unit ? ", " + r.unit : ""}`], r.rows.map((x) => [x.label, x.value]));
}
