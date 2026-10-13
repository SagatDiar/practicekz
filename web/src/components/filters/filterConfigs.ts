import type { GroupDef } from "./FilterDrawer";

export const check = (key: string, label: string, searchable = true): GroupDef => ({ kind: "check", key, label, searchable });
export const dates: GroupDef = { kind: "daterange", label: "Дата подачи", fromKey: "dateFrom", toKey: "dateTo" };

// Студент
export const studentPracticeGroups: GroupDef[] = [
  check("city", "Город"), check("format", "Формат"), check("direction", "Направление"),
  check("duration", "Срок"), check("company", "Компания"),
  { kind: "switch", key: "hideApplied", label: "Уже поданные", text: "Скрыть уже поданные" },
];
export const studentApplicationGroups: GroupDef[] = [
  check("status", "Статус"), check("company", "Компания"), check("practice", "Практика"),
  check("duration", "Срок"), check("city", "Город"), dates,
];

// Компания
export const companyPracticeGroups: GroupDef[] = [
  check("city", "Город"), check("direction", "Направление"), check("format", "Формат"), check("duration", "Срок"),
];
export const companyApplicationGroups: GroupDef[] = [
  check("specialty", "Специальность"), check("faculty", "Факультет"), check("course", "Курс"),
  check("university", "Университет"), check("studentCity", "Город студента"), check("practice", "Практика"),
  check("status", "Статус"), check("duration", "Срок"), dates,
];

// Университет
export const universityStudentGroups: GroupDef[] = [
  check("faculty", "Факультет"), check("specialty", "Специальность"), check("course", "Курс"),
  check("city", "Город"), check("company", "Компания"), check("status", "Статус практики"),
];
export const universityCompanyGroups: GroupDef[] = [check("city", "Город"), check("industry", "Сфера деятельности")];
export const universityPracticeGroups: GroupDef[] = [
  check("faculty", "Факультет"), check("specialty", "Специальность"), check("course", "Курс"),
  check("company", "Компания"), check("practice", "Практика"), check("status", "Статус"),
  check("duration", "Срок"), check("studentCity", "Город"),
];

export const filterKeys = (g: GroupDef[]) => g.filter((x) => x.kind === "check").map((x) => (x as { key: string }).key);
export const extraKeys = (g: GroupDef[]) =>
  g.flatMap((x) => (x.kind === "switch" ? [x.key] : x.kind === "daterange" ? [x.fromKey, x.toKey] : []));
