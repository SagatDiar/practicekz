import { describe, expect, it } from "vitest";
import { calcProgress } from "../src/services/progress.js";

const DAY = 86400000;
const NOW = new Date("2026-03-31T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);

describe("calcProgress", () => {
  it("до начала практики прогресса нет", () => {
    for (const status of ["PENDING", "INVITED", "REJECTED", "SIGNING"] as const) {
      expect(calcProgress({ status, startDate: null, date: ago(5) }, 2, null, NOW)).toBeNull();
    }
  });

  it("COMPLETED — всегда 100%", () => {
    const p = calcProgress({ status: "COMPLETED", startDate: ago(3), date: ago(10) }, 2, null, NOW);
    expect(p).toEqual({ percent: 100, elapsedDays: 60, remainingDays: 0, totalDays: 60 });
  });

  it("считает от startDate: 30 из 90 дней → 33%", () => {
    const p = calcProgress({ status: "ACTIVE", startDate: ago(30), date: ago(50) }, 3, null, NOW);
    expect(p).toEqual({ percent: 33, elapsedDays: 30, remainingDays: 60, totalDays: 90 });
  });

  it("нет startDate → первая запись дневника, иначе дата заявки", () => {
    const base = { status: "ACTIVE" as const, startDate: null, date: ago(40) };
    expect(calcProgress(base, 2, ago(15), NOW)?.elapsedDays).toBe(15);
    expect(calcProgress(base, 2, null, NOW)?.elapsedDays).toBe(40);
  });

  it("не больше 100% и остаток не уходит в минус", () => {
    const p = calcProgress({ status: "FINISH_REQUESTED", startDate: ago(200), date: ago(210) }, 1, null, NOW);
    expect(p?.percent).toBe(100);
    expect(p?.remainingDays).toBe(0);
  });

  it("старт в будущем не даёт отрицательных дней", () => {
    const p = calcProgress({ status: "ACTIVE", startDate: ago(-5), date: ago(10) }, 2, null, NOW);
    expect(p?.elapsedDays).toBe(0);
    expect(p?.percent).toBe(0);
  });
});
