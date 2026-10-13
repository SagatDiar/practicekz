import { beforeEach, describe, expect, it } from "vitest";
import { api, loginAs, rawBody } from "./helpers/http.js";
import { makeMarket, type Market } from "./helpers/market.js";

let m: Market;
beforeEach(async () => { m = await makeMarket(); });

const kpi = (body: any) => Object.fromEntries(body.items.map((i: any) => [i.key, i.value]));
const sum = (rows: { value: number }[]) => rows.reduce((n, r) => n + r.value, 0);

describe("доступ к статистике", () => {
  it("без входа → 401", async () => {
    expect((await api().get("/api/stats/student/overview")).status).toBe(401);
  });

  it("роль в пути должна совпадать с ролью пользователя, иначе 403", async () => {
    const stu = await loginAs(m.s1);
    const cmp = await loginAs(m.tech);
    const uni = await loginAs(m.enu);
    expect((await stu.get("/api/stats/company/summary")).status).toBe(403);
    expect((await stu.get("/api/stats/university/summary")).status).toBe(403);
    expect((await cmp.get("/api/stats/student/overview")).status).toBe(403);
    expect((await cmp.get("/api/stats/university/summary")).status).toBe(403);
    expect((await uni.get("/api/stats/company/summary")).status).toBe(403);
  });

  it("своя роль в любом регистре → 200", async () => {
    expect((await (await loginAs(m.enu)).get("/api/stats/UNIVERSITY/summary")).status).toBe(200);
  });

  it("неизвестная метрика → 404, в том числе метрика чужой роли и ключи прототипа", async () => {
    const stu = await loginAs(m.s1);
    expect((await stu.get("/api/stats/student/nonexistent")).status).toBe(404);
    expect((await stu.get("/api/stats/student/summary")).status).toBe(404); // «summary» есть у компании, не у студента
    expect((await stu.get("/api/stats/student/constructor")).status).toBe(404);
  });

  it("facets: источник «students» и «practices» только для университета; неизвестный источник → 400", async () => {
    const stu = await loginAs(m.s1);
    expect((await stu.get("/api/stats/facets?source=students")).status).toBe(403);
    expect((await stu.get("/api/stats/facets?source=practices")).status).toBe(403);
    expect((await stu.get("/api/stats/facets?source=applications")).status).toBe(200);
    expect((await stu.get("/api/stats/facets?source=bogus")).status).toBe(400);
    expect((await stu.get("/api/stats/facets?source=constructor")).status).toBe(400);
    const uni = await loginAs(m.enu);
    expect((await uni.get("/api/stats/facets?source=students")).status).toBe(200);
    expect((await uni.get("/api/stats/facets?source=practices")).status).toBe(200);
  });
});

describe("студент", () => {
  it("overview: показатели совпадают с его заявками (PENDING×2, COMPLETED×1)", async () => {
    const r = await (await loginAs(m.s1)).get("/api/stats/student/overview");
    expect(r.status).toBe(200);
    expect(r.body.type).toBe("kpi");
    expect(r.body.items).toHaveLength(8);
    expect(kpi(r.body)).toMatchObject({ total: 3, process: 2, running: 0, done: 1, rejected: 0, success: 100, diary: 0, certs: 0 });
    expect(r.body.progress.percent).toBe(100); // единственная практика в прогрессе — завершённая
  });

  it("statuses: сумма сегментов = total = числу заявок в списке", async () => {
    const stu = await loginAs(m.s1);
    const stat = (await stu.get("/api/stats/student/statuses")).body;
    const list = (await stu.get("/api/applications")).body;
    expect(stat.type).toBe("doughnut");
    expect(stat.total).toBe(list.total);
    expect(sum(stat.segments)).toBe(stat.total);
    expect(Object.fromEntries(stat.segments.map((s: any) => [s.key, s.value]))).toEqual({ PENDING: 2, COMPLETED: 1 });
  });

  it("months: 6 месяцев по порядку времени, сумма = числу заявок", async () => {
    const r = await (await loginAs(m.s1)).get("/api/stats/student/months");
    expect(r.body).toMatchObject({ type: "bars", ordered: "time" });
    expect(r.body.rows).toHaveLength(6);
    expect(sum(r.body.rows)).toBe(3);
  });

  it("progress: только практики, которые идут или завершены", async () => {
    const r = await (await loginAs(m.s1)).get("/api/stats/student/progress");
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.rows[0]).toMatchObject({ value: 100 });
    expect(r.body.rows[0].label).toContain("Bravo Intern");
  });

  it("фильтры работают так же, как в списке: status=PENDING", async () => {
    const stu = await loginAs(m.s1);
    const stat = (await stu.get("/api/stats/student/statuses?status=PENDING")).body;
    expect(stat.total).toBe((await stu.get("/api/applications?status=PENDING")).body.total);
    expect(stat.total).toBe(2);
  });

  it("студент без заявок: нули и пустые диаграммы без ошибок", async () => {
    const stu = await loginAs(m.s4);
    const o = (await stu.get("/api/stats/student/overview")).body;
    expect(kpi(o).total).toBe(0);
    expect(kpi(o).success).toBeNull();
    expect(o.progress).toBeNull();
    expect((await stu.get("/api/stats/student/statuses")).body).toMatchObject({ total: 0, segments: [] });
    expect((await stu.get("/api/stats/student/progress")).body.rows).toEqual([]);
  });
});

describe("компания", () => {
  it("summary: считает только заявки на её практики", async () => {
    const r = await (await loginAs(m.tech)).get("/api/stats/company/summary");
    expect(kpi(r.body)).toMatchObject({ offers: 8, total: 4, fresh: 1, approved: 1, rejected: 1, running: 0, done: 1 });
    const other = await (await loginAs(m.creative)).get("/api/stats/company/summary");
    expect(kpi(other.body)).toMatchObject({ offers: 2, total: 2, approved: 2, running: 1 });
  });

  it("practices: по убыванию числа заявок", async () => {
    const r = await (await loginAs(m.tech)).get("/api/stats/company/practices");
    expect(r.body.rows).toMatchObject([{ label: "Alpha Intern", value: 3 }, { label: "Bravo Intern", value: 1 }]);
  });

  it("universities: заявки по вузам", async () => {
    const r = await (await loginAs(m.tech)).get("/api/stats/company/universities");
    expect(r.body.rows).toMatchObject([{ label: "ЕНУ", value: 3 }, { label: "МНУ", value: 1 }]);
  });

  it("statuses и months сходятся со списком", async () => {
    const cmp = await loginAs(m.tech);
    const total = (await cmp.get("/api/applications")).body.total;
    expect((await cmp.get("/api/stats/company/statuses")).body.total).toBe(total);
    expect(sum((await cmp.get("/api/stats/company/months")).body.rows)).toBe(total);
  });
});

describe("университет", () => {
  it("summary: студенты — свои, компании и предложения — по платформе", async () => {
    const r = await (await loginAs(m.enu)).get("/api/stats/university/summary");
    expect(kpi(r.body)).toMatchObject({ students: 3, companies: 3, offers: 12, apps: 5, approved: 2, rejected: 0, coverage: 67 });
    const mnu = await (await loginAs(m.mnu)).get("/api/stats/university/summary");
    expect(kpi(mnu.body)).toMatchObject({ students: 1, apps: 2, rejected: 1 });
  });

  it("statuses: три группы, сумма = числу заявок", async () => {
    const uni = await loginAs(m.enu);
    const stat = (await uni.get("/api/stats/university/statuses")).body;
    expect(stat.total).toBe((await uni.get("/api/applications")).body.total);
    expect(Object.fromEntries(stat.segments.map((s: any) => [s.key, s.value]))).toEqual({ practice: 1, process: 4 }); // «Отклонено» с нулём скрыто
    expect(sum(stat.segments)).toBe(stat.total);
  });

  it("faculties и specialties считают студентов своего вуза", async () => {
    const uni = await loginAs(m.enu);
    const f = (await uni.get("/api/stats/university/faculties")).body;
    expect(f.unit).toBe("студентов");
    expect(f.rows).toMatchObject([{ label: "Информационных технологий", value: 2 }, { label: "Дизайна и искусств", value: 1 }]);
    expect(sum(f.rows)).toBe((await uni.get("/api/students")).body.total);
    const s = (await uni.get("/api/stats/university/specialties")).body;
    expect(s.rows).toMatchObject([{ label: "Информационные системы", value: 2 }, { label: "Дизайн", value: 1 }]);
  });

  it("directions считает предложения; фильтр по городу сужает результат", async () => {
    const uni = await loginAs(m.enu);
    const all = (await uni.get("/api/stats/university/directions")).body;
    expect(all.rows[0]).toMatchObject({ label: "IT", value: 8 });
    expect(sum(all.rows)).toBe(12);
    const almaty = (await uni.get(`/api/stats/university/directions?city=${encodeURIComponent("Алматы")}`)).body;
    expect(sum(almaty.rows)).toBe(2);
  });

  it("byStatus: 7 строк, сумма = числу заявок", async () => {
    const r = (await (await loginAs(m.enu)).get("/api/stats/university/byStatus")).body;
    expect(r.rows).toHaveLength(7);
    expect(sum(r.rows)).toBe(5);
  });

  it("companies: сколько студентов дошло до подписания и дальше", async () => {
    const r = (await (await loginAs(m.enu)).get("/api/stats/university/companies")).body;
    expect(r.rows.map((x: any) => [x.label, x.value]).sort()).toEqual([["Creative Lab", 1], ["Tech Solutions", 1]]);
  });

  it("фильтр по статусу действует на сводку", async () => {
    const r = await (await loginAs(m.enu)).get("/api/stats/university/summary?status=COMPLETED");
    expect(kpi(r.body).apps).toBe(1);
  });

  it("чужой вуз не видит данные ЕНУ ни через фильтры", async () => {
    const r = await (await loginAs(m.mnu)).get(`/api/stats/university/byStatus?university=${m.enu.id}`);
    expect(sum(r.body.rows)).toBe(0);
  });
});

describe("CSV статистики", () => {
  it("format=csv: BOM, «;», те же данные, что в JSON", async () => {
    const uni = await loginAs(m.enu);
    const r = await uni.get("/api/stats/university/faculties?format=csv").buffer(true).parse(rawBody);
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/^text\/csv; charset=utf-8/);
    expect(r.headers["content-disposition"]).toMatch(/filename="stats-university-faculties-\d{4}-\d{2}-\d{2}\.csv"/);
    const buf = r.body as Buffer;
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = buf.toString("utf8").replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe("Название;Значение, студентов");
    expect(lines.slice(1)).toEqual(["Информационных технологий;2", "Дизайна и искусств;1"]);
  });

  it("CSV для KPI и круговой диаграммы", async () => {
    const uni = await loginAs(m.enu);
    const kpiCsv = (await uni.get("/api/stats/university/summary?format=csv")).text;
    expect(kpiCsv).toContain("Показатель;Значение");
    expect(kpiCsv).toContain("Студентов с практикой;67%");
    const dn = (await uni.get("/api/stats/university/statuses?format=csv")).text;
    expect(dn).toContain("Категория;Количество;Доля, %");
  });

  it("CSV не обходит права: чужая роль → 403", async () => {
    const r = await (await loginAs(m.s1)).get("/api/stats/university/faculties?format=csv");
    expect(r.status).toBe(403);
  });
});
