import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/db.js";
import { createCompany, daysAgo, ymd } from "./helpers/factories.js";
import { api, loginAs, rawBody } from "./helpers/http.js";
import { makeMarket, type Market } from "./helpers/market.js";

let m: Market;
beforeEach(async () => { m = await makeMarket(); });

const enc = encodeURIComponent;
const titles = (r: any) => r.body.items.map((p: any) => p.title);
const isSorted = (a: string[], dir: "asc" | "desc" = "asc") => a.every((v, i) => i === 0 || (dir === "asc" ? a[i - 1] <= v : a[i - 1] >= v));

// =============== практики ===============
describe("GET /api/practices", () => {
  it("пагинация: по умолчанию 10 на страницу, 12 всего, 2 страницы", async () => {
    const stu = await loginAs(m.s1);
    const p1 = await stu.get("/api/practices");
    expect(p1.status).toBe(200);
    expect(p1.body).toMatchObject({ total: 12, page: 1, limit: 10, pages: 2 });
    expect(p1.body.items).toHaveLength(10);
    const p2 = await stu.get("/api/practices?page=2");
    expect(p2.body.items).toHaveLength(2);
    const ids = new Set([...p1.body.items, ...p2.body.items].map((p: any) => p.id));
    expect(ids.size).toBe(12); // страницы не пересекаются
  });

  it("limit 25/50/100 допустимы, остальные значения → 10", async () => {
    const stu = await loginAs(m.s1);
    for (const limit of [25, 50, 100]) expect((await stu.get(`/api/practices?limit=${limit}`)).body.limit).toBe(limit);
    for (const limit of ["7", "1000", "-5", "abc"]) expect((await stu.get(`/api/practices?limit=${limit}`)).body.limit, limit).toBe(10);
    expect((await stu.get("/api/practices?limit=100")).body.items).toHaveLength(12);
  });

  it("page: мусор и 0 → первая страница; за пределами → пустой список", async () => {
    const stu = await loginAs(m.s1);
    for (const page of ["0", "-3", "abc"]) expect((await stu.get(`/api/practices?page=${page}`)).body.page, page).toBe(1);
    const far = await stu.get("/api/practices?page=99");
    expect(far.status).toBe(200);
    expect(far.body.items).toEqual([]);
    expect(far.body.total).toBe(12);
  });

  it("повторяющийся параметр city=A&city=B работает как IN", async () => {
    const stu = await loginAs(m.s1);
    const r = await stu.get(`/api/practices?city=${enc("Алматы")}&city=${enc("Астана")}&limit=100`);
    expect(r.body.total).toBe(6);
    expect(r.body.items.every((p: any) => ["Алматы", "Астана"].includes(p.city))).toBe(true);
  });

  it("разные фильтры соединяются через AND", async () => {
    const stu = await loginAs(m.s1);
    const r = await stu.get(`/api/practices?city=${enc("Астана")}&format=${enc("Гибридный")}&limit=100`);
    expect(titles(r).sort()).toEqual(["Bravo Intern", "Echo Analyst"]);
    const dur = await stu.get(`/api/practices?city=${enc("Астана")}&duration=3&duration=1&limit=100`);
    expect(titles(dur).sort()).toEqual(["Bravo Intern", "Echo Analyst"]);
  });

  it("пустое значение параметра игнорируется", async () => {
    const r = await (await loginAs(m.s1)).get("/api/practices?city=&format=");
    expect(r.body.total).toBe(12);
  });

  it("поиск нечувствителен к регистру: по названию, городу и компании", async () => {
    const stu = await loginAs(m.s1);
    expect((await stu.get("/api/practices?q=ANALYST")).body.total).toBe(2);
    expect((await stu.get(`/api/practices?q=${enc("Шымкент")}`)).body.total).toBe(6);
    expect(titles(await stu.get("/api/practices?q=creative lab")).sort()).toEqual(["Charlie Designer", "Delta Marketing"]);
  });

  it("поиск и фильтр вместе", async () => {
    const r = await (await loginAs(m.s1)).get(`/api/practices?q=analyst&format=${enc("Офис")}`);
    expect(titles(r)).toEqual(["Foxtrot Analyst"]);
  });

  it("ничего не найдено: 200, пустой список, total 0, pages 1", async () => {
    const r = await (await loginAs(m.s1)).get("/api/practices?q=zzzzzz");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ items: [], total: 0, pages: 1 });
  });

  it("спецсимволы в поиске не ломают запрос", async () => {
    const stu = await loginAs(m.s1);
    for (const q of ["%", "_", "'; DROP TABLE \"User\"; --", "\\"]) {
      expect((await stu.get(`/api/practices?q=${enc(q)}`)).status, q).toBe(200);
    }
    expect((await stu.get("/api/practices")).body.total).toBe(12); // данные на месте
  });

  it("сортировка по названию: asc и desc", async () => {
    const stu = await loginAs(m.s1);
    expect(isSorted(titles(await stu.get("/api/practices?sort=title:asc&limit=100")), "asc")).toBe(true);
    expect(isSorted(titles(await stu.get("/api/practices?sort=title:desc&limit=100")), "desc")).toBe(true);
  });

  it("сортировка по числу мест", async () => {
    const r = await (await loginAs(m.s1)).get("/api/practices?sort=places:desc&limit=100");
    expect(r.body.items[0].title).toBe("Alpha Intern"); // 3 места — максимум
  });

  it("по умолчанию — сначала новые; неизвестный ключ сортировки откатывается к умолчанию", async () => {
    const stu = await loginAs(m.s1);
    const def = await stu.get("/api/practices?limit=100");
    expect(titles(def).slice(0, 3)).toEqual(["Alpha Intern", "Bravo Intern", "Charlie Designer"]);
    expect(titles(await stu.get("/api/practices?sort=hack:asc&limit=100"))).toEqual(titles(def));
  });

  it("ключи сортировки из прототипа объекта (constructor, __proto__) не роняют запрос", async () => {
    const stu = await loginAs(m.s1);
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const r = await stu.get(`/api/practices?sort=${key}:asc&limit=100`);
      expect(r.status, key).toBe(200);
      expect(r.body.total, key).toBe(12);
    }
  });

  it("студент: applied и «скрыть уже поданные»", async () => {
    const stu = await loginAs(m.s1); // подавал на Alpha, Bravo, Echo
    const all = await stu.get("/api/practices?limit=100");
    expect(all.body.items.filter((p: any) => p.applied).map((p: any) => p.title).sort()).toEqual(["Alpha Intern", "Bravo Intern", "Echo Analyst"]);
    const hidden = await stu.get("/api/practices?hideApplied=1&limit=100");
    expect(hidden.body.total).toBe(9);
    expect(hidden.body.items.every((p: any) => p.applied === false)).toBe(true);
  });

  it("компания по умолчанию видит только свои практики, mine=0 — все", async () => {
    const tech = await loginAs(m.tech);
    expect((await tech.get("/api/practices?limit=100")).body.total).toBe(8);
    expect((await tech.get("/api/practices?mine=0&limit=100")).body.total).toBe(12);
    const own = await tech.get("/api/practices?limit=100");
    expect(own.body.items.every((p: any) => p.company.name === "Tech Solutions")).toBe(true);
  });

  it("facets: счётчики по группам, своя группа не сужается своим же фильтром", async () => {
    const stu = await loginAs(m.s1);
    const r = await stu.get(`/api/practices/facets?city=${enc("Астана")}`);
    expect(r.status).toBe(200);
    const f = r.body.facets;
    for (const k of ["city", "format", "direction", "duration", "company"]) expect(Array.isArray(f[k]), k).toBe(true);
    // в группе «город» остаются все города — иначе нельзя было бы выбрать второй
    expect(Object.fromEntries(f.city.map((x: any) => [x.value, x.count]))).toEqual({ "Шымкент": 6, "Астана": 4, "Алматы": 2 });
    // остальные группы считаются только внутри выбранного города (4 практики)
    expect(f.format.reduce((n: number, x: any) => n + x.count, 0)).toBe(4);
    expect(f.duration.map((x: any) => x.value)).toEqual(["2", "3"]); // numeric order
    expect(Object.values(f).flat().every((x: any) => x.count > 0)).toBe(true);
  });

  it("facets: параметр facets ограничивает набор групп", async () => {
    const r = await (await loginAs(m.s1)).get("/api/practices/facets?facets=city&facets=format");
    expect(Object.keys(r.body.facets).sort()).toEqual(["city", "format"]);
  });
});

// =============== заявки ===============
describe("GET /api/applications", () => {
  const list = async (who: { id: string; email: string }, qs = "") => (await loginAs(who)).get(`/api/applications?limit=100${qs}`);

  it("видимость: студент — свои, компания — по своим практикам, университет — своих студентов", async () => {
    expect((await list(m.s1)).body.total).toBe(3);
    expect((await list(m.s4)).body.total).toBe(0);
    expect((await list(m.tech)).body.total).toBe(4);
    expect((await list(m.creative)).body.total).toBe(2);
    expect((await list(m.datakz)).body.total).toBe(1);
    expect((await list(m.enu)).body.total).toBe(5);
    expect((await list(m.mnu)).body.total).toBe(2);
    const own = (await list(m.s1)).body.items;
    expect(own.every((a: any) => a.student.id === m.s1.id)).toBe(true);
  });

  it("чужие данные нельзя получить фильтром: company=<чужая> у компании → пусто", async () => {
    const r = await list(m.creative, `&company=${m.tech.id}`);
    expect(r.body.total).toBe(0);
    const r2 = await list(m.mnu, `&university=${m.enu.id}`);
    expect(r2.body.total).toBe(0);
  });

  it("несколько статусов через IN", async () => {
    const r = await list(m.tech, "&status=PENDING&status=INVITED");
    expect(r.body.items.map((a: any) => a.status).sort()).toEqual(["INVITED", "PENDING"]);
    expect((await list(m.enu, "&status=COMPLETED&status=SIGNING")).body.total).toBe(2);
  });

  it("неизвестное значение статуса не даёт 500", async () => {
    const r = await list(m.tech, "&status=BOGUS");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect((await list(m.tech, "&status=BOGUS&status=PENDING")).body.total).toBe(1); // остаётся только PENDING (a1)
  });

  it("фильтры студента: факультет, специальность, курс, город", async () => {
    expect((await list(m.enu, `&faculty=${enc("Дизайна и искусств")}`)).body.total).toBe(2);
    expect((await list(m.enu, `&specialty=${enc("Информационные системы")}`)).body.total).toBe(3);
    expect((await list(m.tech, "&course=4")).body.total).toBe(3);
    expect((await list(m.tech, "&course=3&course=4")).body.total).toBe(4);
    expect((await list(m.tech, `&studentCity=${enc("Алматы")}`)).body.total).toBe(1);
    expect((await list(m.tech, "&course=abc")).body.total).toBe(0);
  });

  it("фильтры практики: срок и город", async () => {
    expect((await list(m.tech, "&duration=3")).body.total).toBe(1);
    expect((await list(m.enu, `&city=${enc("Алматы")}`)).body.total).toBe(1);
  });

  it("диапазон даты подачи: dateFrom / dateTo", async () => {
    expect((await list(m.tech, `&dateFrom=${ymd(daysAgo(4))}`)).body.total).toBe(2); // a1 (−1 д), a2 (−3 д)
    expect((await list(m.tech, `&dateTo=${ymd(daysAgo(2))}`)).body.total).toBe(3);   // a2, a3, a4
    expect((await list(m.tech, `&dateFrom=${ymd(daysAgo(6))}&dateTo=${ymd(daysAgo(2))}`)).body.total).toBe(2); // a2, a3
    expect((await list(m.tech, "&dateFrom=2999-01-01")).body.total).toBe(0);
  });

  it("некорректные даты игнорируются", async () => {
    const r = await list(m.tech, "&dateFrom=garbage&dateTo=nonsense");
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(4);
  });

  it("поиск: по фамилии студента, названию практики, компании", async () => {
    expect((await list(m.tech, "&q=brown")).body.total).toBe(1);
    expect((await list(m.enu, "&q=ALPHA")).body.total).toBe(2); // a1, a2
    expect((await list(m.enu, "&q=bravo")).body.total).toBe(1);
    expect((await list(m.s1, "&q=data")).body.total).toBe(1); // DataKZ
  });

  it("сортировка: по студенту, по дате, по статусу; неизвестный ключ → date:desc", async () => {
    const byName = await list(m.tech, "&sort=student:asc");
    expect(isSorted(byName.body.items.map((a: any) => a.student.lastName), "asc")).toBe(true);
    expect(isSorted((await list(m.tech, "&sort=student:desc")).body.items.map((a: any) => a.student.lastName), "desc")).toBe(true);
    const dates = (await list(m.tech, "&sort=date:asc")).body.items.map((a: any) => a.date);
    expect(isSorted(dates, "asc")).toBe(true);
    expect((await list(m.tech, "&sort=status:asc")).status).toBe(200);
    const def = (await list(m.tech)).body.items.map((a: any) => a.id);
    expect((await list(m.tech, "&sort=nonsense:asc")).body.items.map((a: any) => a.id)).toEqual(def);
    expect(isSorted((await list(m.tech)).body.items.map((a: any) => a.date), "desc")).toBe(true);
  });

  it("в элементе списка нет чужих и служебных данных", async () => {
    const a = (await list(m.tech)).body.items[0];
    expect(a).toHaveProperty("statusLabel");
    expect(JSON.stringify(a)).not.toMatch(/passwordHash|email/);
  });

  it("facets: сумма по статусам равна total, своя группа не сужается", async () => {
    const stu = await loginAs(m.tech);
    const r = await stu.get("/api/applications/facets?facets=status&facets=city&status=PENDING");
    expect(Object.keys(r.body.facets).sort()).toEqual(["city", "status"]);
    const status = r.body.facets.status;
    expect(status.reduce((n: number, x: any) => n + x.count, 0)).toBe(4); // фильтр status не применяется к своей группе
    expect(status.map((x: any) => x.value).sort()).toEqual(["COMPLETED", "INVITED", "PENDING", "REJECTED"]);
    expect(r.body.facets.city.reduce((n: number, x: any) => n + x.count, 0)).toBe(1); // а город уже сужен до PENDING
  });
});

// =============== CSV ===============
describe("CSV-экспорт", () => {
  const csv = async (who: { id: string; email: string }, path: string) => {
    const r = await (await loginAs(who)).get(path).buffer(true).parse(rawBody);
    const buf = r.body as Buffer;
    return { r, buf, text: buf.toString("utf8") };
  };
  const lines = (t: string) => t.split("\r\n");

  it("заявки компании: заголовки, UTF-8 BOM, разделитель «;», без колонки «Действия»", async () => {
    const { r, buf, text } = await csv(m.tech, "/api/applications/export.csv");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toMatch(/^text\/csv; charset=utf-8/);
    expect(r.headers["content-disposition"]).toMatch(/^attachment; filename="applications-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const [head, ...rows] = lines(text.replace(/^\uFEFF/, ""));
    expect(head).toBe("Студент;Специальность;Навыки;Практика;Дата подачи;Статус;Подписи (студент / компания / университет)");
    expect(head).not.toContain("Действия");
    expect(rows).toHaveLength(4);
  });

  it("CSV уважает те же фильтры, что и список", async () => {
    const { text } = await csv(m.tech, "/api/applications/export.csv?status=PENDING");
    const rows = lines(text).slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("На рассмотрении");
    const none = await csv(m.tech, "/api/applications/export.csv?q=zzzz");
    expect(lines(none.text)).toHaveLength(1); // только заголовок
  });

  it("CSV студента и университета видят только свои строки", async () => {
    expect(lines((await csv(m.s1, "/api/applications/export.csv")).text).slice(1)).toHaveLength(3);
    expect(lines((await csv(m.mnu, "/api/applications/export.csv")).text).slice(1)).toHaveLength(2);
  });

  it("защита от формул: значение, начинающееся с «=», экранируется апострофом", async () => {
    const { text } = await csv(m.tech, "/api/applications/export.csv");
    expect(text).toContain(";'=1+1;");
    expect(text).not.toMatch(/;=1\+1;/);
  });

  it("студенты вуза: только свой университет", async () => {
    const { text } = await csv(m.enu, "/api/students/export.csv");
    const rows = lines(text).slice(1);
    expect(rows).toHaveLength(3); // s1, s2, s4
    expect(text).not.toContain("Clark");
    expect(text).toContain("Без практики");
  });

  it("компании: CSV для университета, с «Предложений»", async () => {
    const { text } = await csv(m.mnu, "/api/companies/export.csv");
    expect(lines(text)[0].replace("\uFEFF", "")).toBe("Компания;Сфера деятельности;Город;Предложений");
    expect(text).toContain("Tech Solutions;IT;Астана;8");
  });

  it("без входа → 401, роль без доступа → 403", async () => {
    expect((await api().get("/api/applications/export.csv")).status).toBe(401);
    expect((await (await loginAs(m.s1)).get("/api/students/export.csv")).status).toBe(403);
    expect((await (await loginAs(m.tech)).get("/api/companies/export.csv")).status).toBe(403);
  });
});

// =============== студенты и компании (университет) ===============
describe("GET /api/students", () => {
  const list = async (qs = "") => (await loginAs(m.enu)).get(`/api/students?limit=100${qs}`);

  it("университет видит только своих студентов", async () => {
    const r = await list();
    expect(r.body.items.map((s: any) => s.lastName).sort()).toEqual(["Adams", "Brown", "Davis"]);
    expect((await (await loginAs(m.mnu)).get("/api/students")).body.items.map((s: any) => s.lastName)).toEqual(["Clark"]);
  });

  it("студент и компания получают 403, без входа 401", async () => {
    expect((await (await loginAs(m.s1)).get("/api/students")).status).toBe(403);
    expect((await (await loginAs(m.tech)).get("/api/students")).status).toBe(403);
    expect((await api().get("/api/students")).status).toBe(401);
  });

  it("фильтры: курс, факультет, специальность, город", async () => {
    expect((await list("&course=3")).body.items.map((s: any) => s.lastName)).toEqual(["Brown"]);
    expect((await list("&course=2&course=3")).body.total).toBe(2);
    expect((await list(`&faculty=${enc("Информационных технологий")}`)).body.total).toBe(2);
    expect((await list(`&specialty=${enc("Дизайн")}`)).body.total).toBe(1);
    expect((await list(`&city=${enc("Алматы")}`)).body.total).toBe(0); // Clark учится в МНУ
  });

  it("«Без практики»: company=none", async () => {
    const r = await list("&company=none");
    expect(r.body.items.map((s: any) => s.lastName)).toEqual(["Davis"]);
    expect(r.body.items[0].statusLabel).toBe("Без практики");
  });

  it("фильтр по компании и по статусу практики", async () => {
    expect((await list(`&company=${m.creative.id}`)).body.items.map((s: any) => s.lastName)).toEqual(["Brown"]);
    expect((await list("&status=COMPLETED")).body.items.map((s: any) => s.lastName)).toEqual(["Adams"]);
    expect((await list("&status=BOGUS")).status).toBe(200);
  });

  it("отклонённая заявка не считается практикой", async () => {
    const r = await (await loginAs(m.mnu)).get("/api/students?limit=100");
    expect(r.body.items[0].status).toBe("ACTIVE"); // у Clark: ACTIVE (Delta) и REJECTED (Alpha) — берётся ACTIVE
  });

  it("поиск, сортировка по имени desc, пагинация", async () => {
    expect((await list("&q=BORIS")).body.total).toBe(1);
    expect((await list("&sort=name:desc")).body.items.map((s: any) => s.lastName)).toEqual(["Davis", "Brown", "Adams"]);
    const p = await (await loginAs(m.enu)).get("/api/students?limit=10&page=2");
    expect(p.body.items).toEqual([]);
  });

  it("facets: есть company и status, «Без практики» учитывается", async () => {
    const r = await (await loginAs(m.enu)).get("/api/students/facets");
    expect(r.status).toBe(200);
    expect(r.body.facets.company.some((x: any) => x.value === "none" && x.count === 1)).toBe(true);
    expect(Array.isArray(r.body.facets.status)).toBe(true);
  });
});

describe("GET /api/students/:id — доступ к профилю", () => {
  it("сам студент и его университет — 200", async () => {
    expect((await (await loginAs(m.s2)).get(`/api/students/${m.s2.id}`)).status).toBe(200);
    expect((await (await loginAs(m.enu)).get(`/api/students/${m.s2.id}`)).status).toBe(200);
  });

  it("компания с заявкой от студента — 200, без заявки — 403", async () => {
    expect((await (await loginAs(m.creative)).get(`/api/students/${m.s2.id}`)).status).toBe(200);
    expect((await (await loginAs(m.datakz)).get(`/api/students/${m.s2.id}`)).status).toBe(403);
  });

  it("чужой студент и чужой университет — 403; несуществующий — 404", async () => {
    expect((await (await loginAs(m.s1)).get(`/api/students/${m.s2.id}`)).status).toBe(403);
    expect((await (await loginAs(m.mnu)).get(`/api/students/${m.s2.id}`)).status).toBe(403);
    expect((await (await loginAs(m.enu)).get("/api/students/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("ответ не содержит пароль", async () => {
    const r = await (await loginAs(m.enu)).get(`/api/students/${m.s1.id}`);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash/);
    expect(r.body.student.email).toBe(m.s1.email);
  });
});

describe("GET /api/companies", () => {
  it("университет видит все компании; студент и компания — 403", async () => {
    const r = await (await loginAs(m.enu)).get("/api/companies?limit=100");
    expect(r.body.total).toBe(3);
    expect((await (await loginAs(m.s1)).get("/api/companies")).status).toBe(403);
    expect((await (await loginAs(m.tech)).get("/api/companies")).status).toBe(403);
  });

  it("сортировка по числу предложений, поиск, фильтр по городу", async () => {
    const enu = await loginAs(m.enu);
    const byOffers = await enu.get("/api/companies?sort=offers:desc");
    expect(byOffers.body.items.map((c: any) => c.offers)).toEqual([8, 2, 2]);
    expect(byOffers.body.items[0].name).toBe("Tech Solutions");
    expect((await enu.get("/api/companies?q=creative")).body.items.map((c: any) => c.name)).toEqual(["Creative Lab"]);
    expect((await enu.get(`/api/companies?city=${enc("Алматы")}`)).body.total).toBe(1);
  });

  it("компания без практик показывает 0 предложений", async () => {
    const empty = await createCompany({ companyName: "Empty Co" });
    const r = await (await loginAs(m.enu)).get("/api/companies?q=empty");
    expect(r.body.items[0]).toMatchObject({ id: empty.id, offers: 0 });
  });
});

describe("масштаб: 5000+ записей", () => {
  it("список практик с пагинацией на 5000 строк отвечает быстро и считает total", async () => {
    const co = await createCompany();
    const data = Array.from({ length: 5000 }, (_, i) => ({
      companyId: co.id, title: `Bulk ${i}`, city: i % 2 ? "Астана" : "Алматы", direction: "IT",
      description: "Описание практики для нагрузки", requirements: "Требования", durationMonths: (i % 6) + 1, format: "Офис", places: 1,
    }));
    await prisma.practice.createMany({ data });
    const stu = await loginAs(m.s1);
    const t0 = Date.now();
    const r = await stu.get(`/api/practices?city=${enc("Астана")}&sort=title:asc&page=3&limit=50`);
    const ms = Date.now() - t0;
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2500 + 4); // 2500 «Bulk» + 4 практики в Астане из makeMarket()
    expect(r.body.items).toHaveLength(50);
    expect(ms).toBeLessThan(2000);
  });
});
