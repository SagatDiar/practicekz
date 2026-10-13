import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeBin } from "../src/utils/bin.js";
import { normalizeCity, readRecords, slugify, splitCsvLine, toEntityRow, toUniRow } from "../src/registry/parse.js";

describe("разбор реестров", () => {
  it("CSV: кавычки, разделитель ; и запятая", () => {
    expect(splitCsvLine('1;"a;b";"c ""q"""', ";")).toEqual(["1", "a;b", 'c "q"']);
    expect(splitCsvLine("1,2,3", ",")).toEqual(["1", "2", "3"]);
  });

  it("заголовки на русском, казахском и английском сводятся к одним полям", () => {
    const bin = makeBin("2301", 50);
    const a = toEntityRow({ "БИН": bin, "Наименование": "ТОО А", "Статус": "Действующий" });
    const b = toEntityRow({ BIN: bin, Name: "ТОО А", Status: "active" });
    expect("row" in a && "row" in b && a.row.name === b.row.name && a.row.status === "ACTIVE" && b.row.status === "ACTIVE").toBe(true);
  });

  it("ликвидированные распознаются, дата dd.mm.yyyy разбирается, город нормализуется", () => {
    const r = toEntityRow({ "БИН": makeBin("2301", 60), "Наименование": "ТОО Б", "Статус": "Ликвидирован", "Дата регистрации": "15.03.2023", "Город": "г. Нур-Султан" });
    if (!("row" in r)) throw new Error(r.error);
    expect(r.row.status).toBe("LIQUIDATED");
    expect(r.row.registeredAt?.toISOString().slice(0, 10)).toBe("2023-03-15");
    expect(r.row.city).toBe("Астана");
  });

  it("плохой БИН и пустое название отбрасываются с причиной", () => {
    expect(toEntityRow({ "БИН": "123", "Наименование": "X" })).toHaveProperty("error");
    expect(toEntityRow({ "БИН": makeBin("2301", 70), "Наименование": "" })).toHaveProperty("error");
    expect(toEntityRow({ "Наименование": "X" })).toHaveProperty("error");
  });

  it("города: префиксы и казахские названия", () => {
    expect(normalizeCity("г.Алма-Ата")).toBe("Алматы");
    expect(normalizeCity("Қарағанды")).toBe("Караганда");
    expect(normalizeCity("город Шымкент")).toBe("Шымкент");
    expect(normalizeCity("")).toBeUndefined();
  });

  it("ВУЗ: сокращение выводится из названия, без города запись отклоняется; slug не зависит от кавычек и регистра", () => {
    const r = toUniRow({ name: "Test University", city: "Алматы" });
    expect("row" in r && r.row.shortName).toBe("TU");
    expect(toUniRow({ name: "X" })).toHaveProperty("error");
    expect(slugify("Университет «Туран»", "Алматы")).toBe(slugify("университет туран", "алматы"));
  });

  it("readRecords читает CSV с BOM, JSON и JSONL", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-"));
    fs.writeFileSync(path.join(dir, "a.csv"), "\uFEFFБИН;Наименование\n111;А\n\n222;Б\n");
    fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify({ items: [{ a: 1 }, { a: 2 }] }));
    fs.writeFileSync(path.join(dir, "a.jsonl"), '{"a":1}\n{"a":2}\n{"a":3}\n');
    const read = async (f: string) => { const out: unknown[] = []; for await (const r of readRecords(path.join(dir, f))) out.push(r); return out; };
    expect(await read("a.csv")).toEqual([{ "БИН": "111", "Наименование": "А" }, { "БИН": "222", "Наименование": "Б" }]);
    expect(await read("a.json")).toHaveLength(2);
    expect(await read("a.jsonl")).toHaveLength(3);
  });
});
