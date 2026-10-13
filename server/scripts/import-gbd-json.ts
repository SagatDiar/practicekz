// server/scripts/import-gbd-json.ts
// Импорт юрлиц из gbd_ul.json (выгрузка реестра) в таблицу LegalEntity.
// Идемпотентен: ключ — БИН, повторный запуск обновляет записи, дубликатов нет.
// Запуск: npx tsx scripts/import-gbd-json.ts   (DRY_RUN=1 — только показать разбор, без БД)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "data", "gbd_ul.json");

type Raw = Record<string, string>;

const FORMS: [RegExp, string][] = [
  [/товарищество с ограниченной ответственностью/i, "ТОО"],
  [/товарищество с дополнительной ответственностью/i, "ТДО"],
  [/акционерное общество/i, "АО"],
  [/республиканское государственное предприятие/i, "РГП"],
  [/государственное учреждение/i, "ГУ"],
  [/государственное коммунальное предприятие/i, "ГКП"],
  [/индивидуальный предприниматель/i, "ИП"],
  [/производственный кооператив/i, "ПК"],
  [/некоммерческое акционерное общество/i, "НАО"],
];
const legalForm = (n: string) => FORMS.find(([re]) => re.test(n))?.[1] ?? null;

const clean = (s?: string) => (s && s.trim() ? s.trim() : null);
const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s\-.])([а-яёa-z])/g, (_, a, b) => a + b.toUpperCase());

function parseRegionCity(addr: string) {
  const parts = addr.split(",").map((p) => p.trim());
  let region: string | null = null;
  let city: string | null = null;
  for (const p of parts) {
    if (!region && /област|обл\./i.test(p)) region = titleCase(p);
    const m = p.match(/^(?:г\.\s*|город\s+)(.+)$/i);
    if (!city && m) city = titleCase(m[1]);
  }
  return { region, city };
}

function toEntity(r: Raw) {
  const addr = r.addressru || "";
  const { region, city } = parseRegionCity(addr);
  const reg = r.datereg ? new Date(r.datereg.slice(0, 10)) : null;
  return {
    bin: r.bin.trim(),
    name: r.nameru.trim(),
    nameKz: clean(r.namekz),
    legalForm: legalForm(r.nameru),
    industry: clean(r.okedru),
    oked: null as string | null,
    city,
    region,
    address: clean(addr) ?? clean(r.addresskz),
    head: clean(r.director),
    registeredAt: reg && !isNaN(reg.getTime()) ? reg : null,
    status: /ликвид|прекращ|исключ/i.test(r.statusru || "") ? ("LIQUIDATED" as const) : ("ACTIVE" as const),
    source: "GBD_JSON",
  };
}

const score = (e: ReturnType<typeof toEntity>) =>
  [e.address, e.industry, e.head, e.nameKz, e.city].filter(Boolean).length;

async function main() {
  const rows: Raw[] = JSON.parse(fs.readFileSync(file, "utf8"));
  const byBin = new Map<string, ReturnType<typeof toEntity>>();
  let skipped = 0;
  for (const r of rows) {
    if (!r.bin || !/^\d{12}$/.test(r.bin.trim())) { skipped++; continue; }
    const e = toEntity(r);
    const prev = byBin.get(e.bin);
    if (!prev || score(e) > score(prev)) byBin.set(e.bin, e);
  }
  console.log(`Строк: ${rows.length}, без БИН: ${skipped}, уникальных БИН: ${byBin.size}`);

  if (process.env.DRY_RUN) {
    console.log([...byBin.values()].slice(0, 3));
    return;
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    for (const e of byBin.values()) {
      const { bin, ...data } = e;
      await prisma.legalEntity.upsert({
        where: { bin },
        create: { bin, ...data },
        update: { ...data, updatedAt: new Date() },
      });
    }
    console.log(`Юрлиц загружено/обновлено: ${byBin.size}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
