import { createApplication, createCompany, createPractice, createStudent, createUniversity, daysAgo } from "./factories.js";

/**
 * Небольшой «рынок» для тестов списков. Все названия латиницей, чтобы порядок сортировки
 * не зависел от collation базы.
 *
 * Практики (12): 6 именованных + 6 «Filler», города: Астана 4, Алматы 2, Шымкент 6.
 * Заявки (7): компания Tech видит 4, Creative 2, DataKZ 1; ЕНУ — 5, МНУ — 2; студент s1 — 3.
 */
export async function makeMarket() {
  const enu = await createUniversity({ shortName: "ЕНУ" });
  const mnu = await createUniversity({ shortName: "МНУ" });

  const s1 = await createStudent(enu.id, { firstName: "Anna", lastName: "Adams", faculty: "Информационных технологий", specialty: "Информационные системы", course: 4, city: "Астана", skills: "=1+1" });
  const s2 = await createStudent(enu.id, { firstName: "Boris", lastName: "Brown", faculty: "Дизайна и искусств", specialty: "Дизайн", course: 3, city: "Астана" });
  const s3 = await createStudent(mnu.id, { firstName: "Clara", lastName: "Clark", faculty: "Экономики и финансов", specialty: "Экономика и финансы", course: 4, city: "Алматы" });
  const s4 = await createStudent(enu.id, { firstName: "Dan", lastName: "Davis", faculty: "Информационных технологий", specialty: "Информационные системы", course: 2, city: "Астана" }); // без заявок

  const tech = await createCompany({ companyName: "Tech Solutions", industry: "IT", city: "Астана" });
  const creative = await createCompany({ companyName: "Creative Lab", industry: "Дизайн", city: "Алматы" });
  const datakz = await createCompany({ companyName: "DataKZ", industry: "Аналитика", city: "Астана" });

  const P = (c: { id: string }, title: string, city: string, format: string, durationMonths: number, direction: string, places: number, d: number) =>
    createPractice(c.id, { title, city, format, durationMonths, direction, places, datePublished: daysAgo(d) });

  const alpha = await P(tech, "Alpha Intern", "Астана", "Офис", 2, "IT", 3, 1);
  const bravo = await P(tech, "Bravo Intern", "Астана", "Гибридный", 3, "IT", 2, 2);
  const charlie = await P(creative, "Charlie Designer", "Алматы", "Гибридный", 2, "Дизайн", 1, 3);
  const delta = await P(creative, "Delta Marketing", "Алматы", "Офис", 2, "Маркетинг", 2, 4);
  const echo = await P(datakz, "Echo Analyst", "Астана", "Гибридный", 3, "Аналитика", 2, 5);
  await P(datakz, "Foxtrot Analyst", "Астана", "Офис", 2, "Финансы", 1, 6);
  for (let i = 7; i <= 12; i++) await P(tech, `Filler ${String(i).padStart(2, "0")}`, "Шымкент", "Удалённо", 1, "IT", 1, i);

  const a = (studentId: string, practiceId: string, status: any, d: number) =>
    createApplication({ studentId, practiceId, status, date: daysAgo(d) });
  const a1 = await a(s1.id, alpha.id, "PENDING", 1);
  const a2 = await a(s2.id, alpha.id, "INVITED", 3);
  const a3 = await a(s3.id, alpha.id, "REJECTED", 5);
  const a4 = await a(s1.id, bravo.id, "COMPLETED", 40);
  const a5 = await a(s2.id, charlie.id, "SIGNING", 2);
  const a6 = await a(s3.id, delta.id, "ACTIVE", 10);
  const a7 = await a(s1.id, echo.id, "PENDING", 20);

  return { enu, mnu, s1, s2, s3, s4, tech, creative, datakz, alpha, bravo, charlie, delta, echo, apps: { a1, a2, a3, a4, a5, a6, a7 } };
}
export type Market = Awaited<ReturnType<typeof makeMarket>>;
