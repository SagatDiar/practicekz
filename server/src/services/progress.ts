import type { AppStatus } from "@prisma/client";

const DAY = 86400000;
const RUNNING: AppStatus[] = ["ACTIVE", "FINISH_REQUESTED", "COMPLETED"];

export interface Progress { percent: number; elapsedDays: number; remainingDays: number; totalDays: number }

/** totalDays = durationMonths*30; старт — startDate, иначе первая запись дневника, иначе дата заявки. */
export function calcProgress(
  a: { status: AppStatus; startDate: Date | null; date: Date },
  durationMonths: number,
  firstDiaryDate?: Date | null,
  now = new Date()
): Progress | null {
  if (!RUNNING.includes(a.status)) return null;
  const totalDays = durationMonths * 30;
  if (a.status === "COMPLETED") return { percent: 100, elapsedDays: totalDays, remainingDays: 0, totalDays };
  const start = a.startDate ?? firstDiaryDate ?? a.date;
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY));
  const percent = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
  return { percent, elapsedDays, remainingDays: Math.max(0, totalDays - elapsedDays), totalDays };
}
