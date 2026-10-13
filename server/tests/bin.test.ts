import { describe, expect, it } from "vitest";
import { binCheckDigit, isValidBin, makeBin, normalizeBin } from "../src/utils/bin.js";

describe("БИН", () => {
  it("makeBin собирает валидные номера", () => {
    for (let i = 0; i < 200; i++) expect(isValidBin(makeBin("2301", i * 13))).toBe(true);
  });

  it("неверная контрольная цифра, длина, буквы, месяц, признак ИИН → невалидно", () => {
    const ok = makeBin("2301", 5);
    expect(isValidBin(ok)).toBe(true);
    expect(isValidBin(ok.slice(0, 11) + ((Number(ok[11]) + 1) % 10))).toBe(false);
    expect(isValidBin(ok.slice(0, 11))).toBe(false);
    expect(isValidBin(ok + "0")).toBe(false);
    expect(isValidBin("abcdefghijkl")).toBe(false);
    expect(isValidBin("")).toBe(false);
    // 5-я цифра 0–3 — это ИИН физлица, а не БИН
    const iin = "230100" + "000000";
    expect(isValidBin(iin.slice(0, 11) + (binCheckDigit(iin.slice(0, 11)) ?? 0))).toBe(false);
  });

  it("normalizeBin убирает всё, кроме цифр", () => {
    expect(normalizeBin(" 2301 4000-0054 ")).toBe("230140000054");
  });
});
