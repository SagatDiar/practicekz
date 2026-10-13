import fs from "node:fs";
import readline from "node:readline";
import { isValidBin, normalizeBin } from "../utils/bin.js";

/** Разбор одной строки CSV с учётом кавычек (многострочные поля в ячейках не поддерживаются — для реестров они не нужны). */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export const detectDelimiter = (header: string) => {
  const counts = [";", "\t", ","].map((d) => [d, header.split(d).length] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
};

/** Читает .csv / .json (массив) / .jsonl построчно, не загружая большой файл целиком в память (кроме .json). */
export async function* readRecords(file: string): AsyncGenerator<Record<string, unknown>> {
  const lower = file.toLowerCase();
  if (lower.endsWith(".json")) {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const arr = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
    for (const r of arr) yield r;
    return;
  }
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) {
    for await (const line of rl) if (line.trim()) yield JSON.parse(line);
    return;
  }
  let header: string[] | null = null, delim = ";";
  for await (let line of rl) {
    if (header === null) {
      line = line.replace(/^\uFEFF/, "");
      delim = detectDelimiter(line);
      header = splitCsvLine(line, delim);
      continue;
    }
    if (!line.trim()) continue;
    const cells = splitCsvLine(line, delim);
    const rec: Record<string, unknown> = {};
    header.forEach((h, i) => { rec[h] = cells[i] ?? ""; });
    yield rec;
  }
}

// ---------- нормализация ----------

const key = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-яәіңғүұқөһ0-9]/g, "");

const ALIASES: Record<string, string[]> = {
  bin: ["бин", "bin", "бинииин", "biniin", "бизнесидентификационныйномер"],
  name: ["наименование", "название", "name", "nameru", "наименованиеру", "наименованиеюл", "наименованиеорганизации", "полноенаименование"],
  nameKz: ["наименованиекз", "namekz", "атауы", "наименованиенаказахском"],
  legalForm: ["организационноправоваяформа", "опф", "legalform", "форма"],
  industry: ["сфера", "сферадеятельности", "industry", "видэкономическойдеятельности", "видыдеятельности", "основнойвиддеятельности"],
  oked: ["окэд", "oked", "кодокэд", "оked"],
  city: ["город", "city", "населенныйпункт", "населпункт"],
  region: ["область", "region", "регион"],
  address: ["адрес", "address", "юридическийадрес"],
  head: ["руководитель", "head", "director", "первыйруководитель"],
  registeredAt: ["датарегистрации", "registrationdate", "registeredat", "датаегрюл", "датапостановкинаучет"],
  status: ["статус", "status", "состояние"],
  shortName: ["сокращение", "shortname", "аббревиатура", "краткоенаименование"],
  ownership: ["формасобственности", "ownership", "собственность"],
  website: ["сайт", "website", "url"],
};
const aliasIndex = new Map<string, string>();
for (const [field, list] of Object.entries(ALIASES)) for (const a of list) aliasIndex.set(key(a), field);

/** Приводит запись с любыми (русскими, казахскими, английскими) заголовками к единому виду. */
export function mapHeaders(rec: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    const f = aliasIndex.get(key(k));
    if (f && out[f] === undefined && v !== null && v !== undefined) out[f] = String(v).trim();
  }
  return out;
}

const CITY_ALIASES: Record<string, string> = { "нурсултан": "Астана", "целиноград": "Астана", "акмола": "Астана", "алмаата": "Алматы", "орал": "Уральск", "өскемен": "Усть-Каменогорск", "усткаменогорск": "Усть-Каменогорск", "қарағанды": "Караганда", "караганды": "Караганда", "шымкент": "Шымкент", "қызылорда": "Кызылорда", "ақтөбе": "Актобе", "ақтау": "Актау" };

export function normalizeCity(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let c = raw.replace(/^(г\.\s*|г\s+|город\s+|қ\.\s*)/i, "").replace(/\s+г\.?$/i, "").replace(/\s*\(.*\)\s*/g, "").trim();
  if (!c) return undefined;
  const k = key(c);
  if (CITY_ALIASES[k]) return CITY_ALIASES[k];
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const m = raw.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(raw);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getTime() > Date.now() + 86400000 ? undefined : d;
}

export interface EntityRow {
  bin: string; name: string; nameKz?: string; legalForm?: string; industry?: string; oked?: string; city?: string;
  region?: string; address?: string; head?: string; registeredAt?: Date; status: "ACTIVE" | "LIQUIDATED";
}

/** Возвращает строку реестра или причину отказа (для отчёта об импорте). */
export function toEntityRow(rec: Record<string, unknown>): { row: EntityRow } | { error: string } {
  const r = mapHeaders(rec);
  const bin = normalizeBin(r.bin ?? "");
  if (!bin) return { error: "нет БИН" };
  if (!isValidBin(bin)) return { error: `некорректный БИН ${bin}` };
  if (!r.name) return { error: `БИН ${bin}: нет наименования` };
  const status = /ликвид|прекращ|исключ|liquidat|inactive|закрыт/i.test(r.status ?? "") ? "LIQUIDATED" : "ACTIVE";
  const nz = (s?: string) => (s ? s : undefined);
  return { row: {
    bin, name: r.name.slice(0, 500), nameKz: nz(r.nameKz)?.slice(0, 500), legalForm: nz(r.legalForm), industry: nz(r.industry)?.slice(0, 300),
    oked: nz(r.oked), city: normalizeCity(r.city), region: nz(r.region), address: nz(r.address)?.slice(0, 500), head: nz(r.head),
    registeredAt: parseDate(r.registeredAt), status,
  } };
}

export const slugify = (name: string, city: string) =>
  `${name}|${city}`.toLowerCase().replace(/ё/g, "е").replace(/["«»'’.,()]/g, "").replace(/\s+/g, " ").trim();

export interface UniRow { name: string; nameKz?: string; shortName: string; city: string; bin?: string; ownership?: string; website?: string; region?: string }

export function toUniRow(rec: Record<string, unknown>): { row: UniRow } | { error: string } {
  const r = mapHeaders(rec);
  const city = normalizeCity(r.city);
  if (!r.name) return { error: "нет наименования" };
  if (!city) return { error: `${r.name}: нет города` };
  const bin = r.bin ? normalizeBin(r.bin) : "";
  if (bin && !isValidBin(bin)) return { error: `${r.name}: некорректный БИН ${bin}` };
  const short = r.shortName || r.name.split(/\s+/).filter((w) => w.length > 2).map((w) => w[0].toUpperCase()).join("").slice(0, 8) || r.name.slice(0, 8);
  return { row: { name: r.name, nameKz: r.nameKz || undefined, shortName: short, city, bin: bin || undefined, ownership: r.ownership || undefined, website: r.website || undefined, region: r.region || undefined } };
}
