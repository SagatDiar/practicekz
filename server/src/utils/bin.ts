/**
 * БИН/ИИН РК — 12 цифр, последняя — контрольная.
 * Алгоритм: сумма цифр 1..11 с весами 1..11 по модулю 11; если получилось 10 — веса сдвигаются (3..11, 1, 2);
 * если и тогда 10 — номер не выдаётся. У БИН пятая цифра 4, 5 или 6 (у ИИН там часть дня рождения: 0–3).
 */
const W1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const W2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

export function binCheckDigit(first11: string): number | null {
  const d = first11.split("").map(Number);
  let c = d.reduce((s, x, i) => s + x * W1[i], 0) % 11;
  if (c === 10) c = d.reduce((s, x, i) => s + x * W2[i], 0) % 11;
  return c === 10 ? null : c;
}

export function normalizeBin(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isValidBin(raw: string): boolean {
  const bin = normalizeBin(raw);
  if (bin.length !== 12) return false;
  const month = Number(bin.slice(2, 4));
  if (month < 1 || month > 12) return false;
  if (!["4", "5", "6"].includes(bin[4])) return false;
  return binCheckDigit(bin.slice(0, 11)) === Number(bin[11]);
}

/** Для демо-данных и тестов: собирает валидный БИН (серийный номер подбирается так, чтобы контрольная цифра существовала). */
export function makeBin(yymm: string, serial: number): string {
  for (let s = serial; s < serial + 1000; s++) {
    const first11 = `${yymm}4${String(s % 1_000_000).padStart(6, "0")}`;
    const c = binCheckDigit(first11);
    if (c !== null) return first11 + c;
  }
  throw new Error("Не удалось собрать БИН");
}
