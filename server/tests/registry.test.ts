import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/utils/db.js";
import { makeBin } from "../src/utils/bin.js";
import { ensureUniversityCards, importLegalEntities, importUniversities } from "../src/registry/import.js";
import { createCompany, createEntity, createUniversity } from "./helpers/factories.js";
import { api, loginAs } from "./helpers/http.js";

const tmp = (name: string, content: string) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reg-")), name);
  fs.writeFileSync(f, content);
  return f;
};

describe("импорт юрлиц", () => {
  it("грузит CSV пачкой, пропускает плохие строки, повторный импорт обновляет без дублей", async () => {
    const b1 = makeBin("2301", 200), b2 = makeBin("2301", 300), b3 = makeBin("1905", 400);
    const csv = `БИН;Наименование;Город;Статус\n${b1};ТОО Первая;Астана;Действующий\n${b2};ТОО Вторая;г. Алматы;Ликвидирован\n123;Плохой БИН;Астана;\n${b3};ТОО Третья;Шымкент;\n${b1};ТОО Первая (дубль в файле);Астана;\n`;
    const rep = await importLegalEntities(tmp("e.csv", csv), "TEST");
    expect(rep.read).toBe(5);
    expect(rep.skipped).toBe(1);
    expect(rep.errors[0]).toContain("некорректный БИН");
    expect(await prisma.legalEntity.count()).toBe(3);
    const second = await prisma.legalEntity.findUniqueOrThrow({ where: { bin: b2 } });
    expect(second.status).toBe("LIQUIDATED");
    expect(second.city).toBe("Алматы");

    await importLegalEntities(tmp("e2.csv", `БИН;Наименование;Статус\n${b2};ТОО Вторая переименована;Действующий\n`), "TEST");
    expect(await prisma.legalEntity.count()).toBe(3);
    const upd = await prisma.legalEntity.findUniqueOrThrow({ where: { bin: b2 } });
    expect(upd.name).toBe("ТОО Вторая переименована");
    expect(upd.status).toBe("ACTIVE");
  });

  it("большой файл (5000 строк) загружается пачками", async () => {
    let csv = "БИН;Наименование\n";
    for (let i = 0; i < 5000; i++) csv += `${makeBin("2401", 10 + i * 3)};ТОО Организация ${i}\n`;
    const rep = await importLegalEntities(tmp("big.csv", csv));
    expect(rep.saved).toBe(5000);
    expect(await prisma.legalEntity.count()).toBe(5000);
  });
});

describe("импорт ВУЗов", () => {
  it("создаёт реестр и карточки университетов без входа; повторный импорт не дублирует", async () => {
    const f = tmp("u.json", JSON.stringify([
      { "Наименование": "Университет Альфа", "Город": "Астана", "Сокращение": "УА" },
      { "Наименование": "Университет Бета", "Город": "Алматы" },
      { "Наименование": "Без города" },
    ]));
    const rep = await importUniversities(f);
    expect(rep.saved).toBe(2);
    expect(rep.skipped).toBe(1);
    expect(await prisma.registryUniversity.count()).toBe(2);
    const cards = await prisma.user.findMany({ where: { role: "UNIVERSITY" } });
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.accountStatus === "UNCLAIMED")).toBe(true);

    await importUniversities(f);
    expect(await prisma.registryUniversity.count()).toBe(2);
    expect(await prisma.user.count({ where: { role: "UNIVERSITY" } })).toBe(2);
    expect(await ensureUniversityCards()).toBe(0);
  });

  it("встроенный список ВУЗов РК загружается целиком", async () => {
    const rep = await importUniversities(fileURLToPath(new URL("../data/universities-kz.json", import.meta.url)), "CURATED");
    expect(rep.skipped).toBe(0);
    expect(rep.saved).toBeGreaterThanOrEqual(80);
    expect(await prisma.registryUniversity.count({ where: { name: { contains: "Гумилёва" } } })).toBe(1);
  });
});

describe("API реестров", () => {
  it("список ВУЗов открыт без входа, ищет по названию и сокращению, фильтрует по городу", async () => {
    await importUniversities(tmp("u.json", JSON.stringify([
      { name: "Евразийский национальный университет", city: "Астана", shortName: "ЕНУ" },
      { name: "Казахский национальный университет", city: "Алматы", shortName: "КазНУ" },
    ])));
    const all = await api().get("/api/registry/universities");
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);
    expect(all.body.items[0]).toEqual(expect.objectContaining({ id: expect.any(String), onPlatform: false }));
    expect((await api().get("/api/registry/universities").query({ q: "ену" })).body.items.map((i: any) => i.shortName)).toEqual(["ЕНУ"]);
    expect((await api().get("/api/registry/universities").query({ city: "Алматы" })).body.total).toBe(1);
  });

  it("id в списке ВУЗов — это то, что принимает регистрация студента", async () => {
    await importUniversities(tmp("u.json", JSON.stringify([{ name: "Университет Альфа", city: "Астана" }])));
    const id = (await api().get("/api/registry/universities")).body.items[0].id;
    const r = await api().post("/api/auth/register").send({
      role: "STUDENT", firstName: "А", lastName: "Б", specialty: "Дизайн", course: 1, faculty: "Дизайна и искусств",
      city: "Астана", universityId: id, email: "s@test.kz", password: "secret123",
    });
    expect(r.status).toBe(201);
  });

  it("lookup по БИН: найден / не найден / некорректный / занят", async () => {
    const e = await createEntity({ name: "ТОО Искомая" });
    const ok = await api().get("/api/registry/legal-entities/lookup").query({ bin: e.bin });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual(expect.objectContaining({ bin: e.bin, name: "ТОО Искомая", active: true, registered: false }));

    const missing = await api().get("/api/registry/legal-entities/lookup").query({ bin: makeBin("2301", 777) });
    expect(missing.status).toBe(404);
    expect((await api().get("/api/registry/legal-entities/lookup").query({ bin: "12345" })).status).toBe(400);

    const c = await createCompany();
    await prisma.companyProfile.update({ where: { userId: c.id }, data: { bin: e.bin, verified: true } });
    expect((await api().get("/api/registry/legal-entities/lookup").query({ bin: e.bin })).body.registered).toBe(true);
  });

  it("список юрлиц требует входа; поиск по названию и по началу БИН; пагинация", async () => {
    expect((await api().get("/api/registry/legal-entities")).status).toBe(401);
    const a = await createEntity({ name: "ТОО Альфа Строй" });
    await createEntity({ name: "ТОО Бета Логистик", status: "LIQUIDATED" });
    for (let i = 0; i < 30; i++) await createEntity({ name: `ТОО Массовая ${String(i).padStart(2, "0")}` });
    const agent = await loginAs(await createCompany());

    const byName = await agent.get("/api/registry/legal-entities").query({ q: "альфа" });
    expect(byName.body.items.map((x: any) => x.name)).toEqual(["ТОО Альфа Строй"]);
    const byBin = await agent.get("/api/registry/legal-entities").query({ q: a.bin.slice(0, 8) });
    expect(byBin.body.items.some((x: any) => x.bin === a.bin)).toBe(true);
    const liquidated = await agent.get("/api/registry/legal-entities").query({ status: "LIQUIDATED" });
    expect(liquidated.body.total).toBe(1);

    const p1 = await agent.get("/api/registry/legal-entities").query({ limit: 10 });
    expect(p1.body).toEqual(expect.objectContaining({ total: 32, pages: 4, page: 1, limit: 10 }));
    expect(p1.body.items).toHaveLength(10);
    const p4 = await agent.get("/api/registry/legal-entities").query({ limit: 10, page: 4 });
    expect(p4.body.items).toHaveLength(2);
  });

  it("сводка считает реестры", async () => {
    await createEntity();
    await createEntity({ status: "LIQUIDATED" });
    await createUniversity();
    const r = await api().get("/api/registry/summary");
    expect(r.status).toBe(200);
    expect(r.body).toEqual(expect.objectContaining({ legalEntities: 2, activeLegalEntities: 1, universitiesOnPlatform: 1 }));
  });
});
