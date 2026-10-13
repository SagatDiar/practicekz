import { randomUUID } from "node:crypto";
import { prisma } from "../utils/db.js";
import { readRecords, slugify, toEntityRow, toUniRow, type EntityRow, type UniRow } from "./parse.js";

export interface ImportReport { read: number; saved: number; skipped: number; errors: string[] }
const MAX_ERRORS = 20;

const BATCH = 2000;

/** Массовая загрузка юрлиц: один INSERT … ON CONFLICT на пачку из 2000 строк (миллионы строк — минуты, а не часы). */
export async function upsertEntities(rows: EntityRow[], source: string): Promise<number> {
  const uniq = new Map<string, EntityRow>();
  for (const r of rows) uniq.set(r.bin, r);
  const list = [...uniq.values()];
  if (!list.length) return 0;
  const col = (f: (r: EntityRow) => string | undefined) => list.map((r) => f(r) ?? "");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "LegalEntity" (bin, name, "nameKz", "legalForm", industry, oked, city, region, address, head, "registeredAt", status, source, "updatedAt")
     SELECT t.bin, t.name, NULLIF(t.kz,''), NULLIF(t.form,''), NULLIF(t.ind,''), NULLIF(t.oked,''), NULLIF(t.city,''), NULLIF(t.region,''),
            NULLIF(t.addr,''), NULLIF(t.head,''), NULLIF(t.reg,'')::timestamp, t.status::"EntityStatus", $13::text, now()
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[])
          AS t(bin, name, kz, form, ind, oked, city, region, addr, head, reg, status)
     ON CONFLICT (bin) DO UPDATE SET name = EXCLUDED.name, "nameKz" = EXCLUDED."nameKz", "legalForm" = EXCLUDED."legalForm",
       industry = EXCLUDED.industry, oked = EXCLUDED.oked, city = EXCLUDED.city, region = EXCLUDED.region, address = EXCLUDED.address,
       head = EXCLUDED.head, "registeredAt" = EXCLUDED."registeredAt", status = EXCLUDED.status, source = EXCLUDED.source, "updatedAt" = now()`,
    col((r) => r.bin), col((r) => r.name), col((r) => r.nameKz), col((r) => r.legalForm), col((r) => r.industry), col((r) => r.oked),
    col((r) => r.city), col((r) => r.region), col((r) => r.address), col((r) => r.head),
    col((r) => r.registeredAt?.toISOString().replace("Z", "")), col((r) => r.status), source,
  );
  return list.length;
}

export async function importLegalEntities(file: string, source = "IMPORT", onProgress?: (n: number) => void): Promise<ImportReport> {
  const rep: ImportReport = { read: 0, saved: 0, skipped: 0, errors: [] };
  let batch: EntityRow[] = [];
  const flush = async () => { rep.saved += await upsertEntities(batch, source); batch = []; onProgress?.(rep.read); };
  for await (const rec of readRecords(file)) {
    rep.read++;
    const r = toEntityRow(rec);
    if ("error" in r) { rep.skipped++; if (rep.errors.length < MAX_ERRORS) rep.errors.push(`строка ${rep.read}: ${r.error}`); continue; }
    batch.push(r.row);
    if (batch.length >= BATCH) await flush();
  }
  if (batch.length) await flush();
  return rep;
}

/** Ключ дедупликации: БИН, иначе нормализованное «название|город». Повторный импорт обновляет, а не дублирует. */
export async function upsertUniversity(u: UniRow, source: string) {
  const slug = slugify(u.name, u.city);
  const existing = (u.bin ? await prisma.registryUniversity.findUnique({ where: { bin: u.bin } }) : null)
    ?? (await prisma.registryUniversity.findUnique({ where: { slug } }));
  const data = { slug, name: u.name, nameKz: u.nameKz, shortName: u.shortName, city: u.city, bin: u.bin, ownership: u.ownership, website: u.website, region: u.region, source, active: true };
  return existing
    ? prisma.registryUniversity.update({ where: { id: existing.id }, data })
    : prisma.registryUniversity.create({ data });
}

/**
 * Для каждого ВУЗа из реестра гарантирует карточку-университет (User + UniversityProfile), чтобы студенты могли
 * выбрать любой ВУЗ РК. Карточка без владельца — UNCLAIMED: войти в неё нельзя, пока её не «заберёт» представитель ВУЗа
 * (npm run uni:account).
 */
export async function ensureUniversityCards(): Promise<number> {
  const missing = await prisma.registryUniversity.findMany({ where: { active: true, profile: { is: null } } });
  for (const r of missing) {
    await prisma.user.create({
      data: {
        role: "UNIVERSITY", accountStatus: "UNCLAIMED", city: r.city,
        email: `registry-${randomUUID()}@practicekz.invalid`, passwordHash: "!",
        university: { create: { universityName: r.name, shortName: r.shortName, city: r.city, registryId: r.id } },
      },
    });
  }
  return missing.length;
}

export async function importUniversities(file: string, source = "IMPORT"): Promise<ImportReport> {
  const rep: ImportReport = { read: 0, saved: 0, skipped: 0, errors: [] };
  for await (const rec of readRecords(file)) {
    rep.read++;
    const r = toUniRow(rec);
    if ("error" in r) { rep.skipped++; if (rep.errors.length < MAX_ERRORS) rep.errors.push(`запись ${rep.read}: ${r.error}`); continue; }
    await upsertUniversity(r.row, source);
    rep.saved++;
  }
  await ensureUniversityCards();
  return rep;
}
