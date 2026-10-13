import { PrismaClient, Role, AppStatus, RefKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureUniversityCards, importUniversities, upsertEntities, upsertUniversity } from "../src/registry/import.js";
import { makeBin } from "../src/utils/bin.js";

const db = new PrismaClient();

const CITIES = ["Астана","Алматы","Шымкент","Караганда","Актобе","Тараз","Павлодар","Усть-Каменогорск","Семей","Атырау","Костанай","Кызылорда","Уральск","Петропавловск","Актау","Темиртау","Туркестан","Кокшетау","Талдыкорган","Экибастуз","Рудный","Жезказган"];
const FACULTIES = ["Информационных технологий","Экономики и финансов","Права и международных отношений","Инженерно-технический","Естественных наук","Педагогики и филологии","Дизайна и искусств","Менеджмента и маркетинга"];
const SPECIALTIES = ["Информационные системы","Вычислительная техника и ПО","Информационная безопасность","Data Science / Аналитика данных","Экономика и финансы","Учёт и аудит","Менеджмент","Маркетинг","Управление персоналом","Логистика","Юриспруденция","Международные отношения","Дизайн","Журналистика","Архитектура","Строительство","Электроэнергетика","Машиностроение","Нефтегазовое дело","Педагогика","Лингвистика / Переводческое дело","Психология","Медицина","Другое"];

// Демо-юрлица с тестовыми БИН (контрольная цифра верна, но в реальном реестре таких нет) — source = DEMO
export const DEMO_ENTITIES = [
  { name: "Tech Solutions", industry: "IT", city: "Астана", legalForm: "ТОО" },
  { name: "QazaqSoft", industry: "IT", city: "Астана", legalForm: "ТОО" },
  { name: "Creative Lab", industry: "Дизайн и маркетинг", city: "Алматы", legalForm: "ТОО" },
  { name: "DataKZ", industry: "Аналитика данных", city: "Астана", legalForm: "ТОО" },
  { name: "Digital Group", industry: "Финансы и логистика", city: "Алматы", legalForm: "ТОО" },
].map((e, i) => ({ ...e, bin: makeBin("2201", 100 + i) }));

const days = (n: number) => new Date(Date.now() + n * 86400000);

async function main() {
  // чистим в порядке зависимостей
  await db.notification.deleteMany();
  await db.diaryEntry.deleteMany();
  await db.application.deleteMany();
  await db.practice.deleteMany();
  await db.extraEducation.deleteMany();
  await db.file.deleteMany();
  await db.studentProfile.deleteMany();
  await db.companyProfile.deleteMany();
  await db.universityProfile.deleteMany();
  await db.user.deleteMany();           // вместе с профилями и кодами подтверждения (CASCADE)
  await db.legalEntity.deleteMany();
  await db.registryUniversity.deleteMany();
  await db.reference.deleteMany();

  const refs = [
    ...CITIES.map((value, sort) => ({ kind: RefKind.CITY, value, sort })),
    ...FACULTIES.map((value, sort) => ({ kind: RefKind.FACULTY, value, sort })),
    ...SPECIALTIES.map((value, sort) => ({ kind: RefKind.SPECIALTY, value, sort })),
  ];
  await db.reference.createMany({ data: refs });

  const h6 = await bcrypt.hash("123456", 10);
  const h5 = await bcrypt.hash("12345", 10);

  // Реестр ВУЗов РК → карточки университетов (UNCLAIMED). Демо-ВУЗы «забирают» свою карточку и получают вход.
  const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../data");
  const imported = await importUniversities(path.join(dataDir, "universities-kz.json"), "CURATED");
  await upsertUniversity({ name: "Международный научный университет", shortName: "МНУ", city: "Алматы" }, "DEMO");
  await ensureUniversityCards();

  const claim = async (name: string, email: string) => {
    const reg = await db.registryUniversity.findFirstOrThrow({ where: { name }, include: { profile: true } });
    return db.user.update({ where: { id: reg.profile!.userId },
      data: { email, passwordHash: h6, accountStatus: "ACTIVE", emailVerifiedAt: new Date() } });
  };
  const enu = await claim("Евразийский национальный университет имени Л.Н. Гумилёва", "enu@test.kz");
  const mnu = await claim("Международный научный университет", "mnu@test.kz");

  const stu = async (email: string, hash: string, universityId: string, p: {
    firstName: string; lastName: string; faculty: string; specialty: string; course: number; skills: string; city: string }) =>
    db.user.create({ data: { role: Role.STUDENT, email, passwordHash: hash, city: p.city, emailVerifiedAt: new Date(),
      student: { create: { ...p, universityId } } } });
  const arlan = await stu("serikbayarlan@test.kz", h5, enu.id, { firstName: "Арлан", lastName: "Серикбай", faculty: FACULTIES[0], specialty: "Информационные системы", course: 4, skills: "JavaScript, SQL, React", city: "Астана" });
  const daulet = await stu("dauletqanatuly@test.kz", h6, mnu.id, { firstName: "Даулет", lastName: "Канатулы", faculty: FACULTIES[1], specialty: "Экономика и финансы", course: 4, skills: "Excel, Аналитика, 1С", city: "Алматы" });
  const aidos = await stu("student@test.kz", h6, enu.id, { firstName: "Айдос", lastName: "Нурланов", faculty: FACULTIES[6], specialty: "Дизайн", course: 3, skills: "Figma, Photoshop", city: "Астана" });

  await upsertEntities(DEMO_ENTITIES.map((e) => ({ ...e, status: "ACTIVE" as const })), "DEMO");
  const comp = async (email: string, companyName: string, industry: string, city: string) => {
    const e = DEMO_ENTITIES.find((x) => x.name === companyName)!;
    return db.user.create({ data: { role: Role.COMPANY, email, passwordHash: h6, city, emailVerifiedAt: new Date(),
      company: { create: { companyName, industry, city, isDemo: true, bin: e.bin, verified: true } } } });
  };
  const tech = await comp("company@test.kz", "Tech Solutions", "IT", "Астана");
  const qazaq = await comp("qazaqsoft@test.kz", "QazaqSoft", "IT", "Астана");
  const creative = await comp("creativelab@test.kz", "Creative Lab", "Дизайн и маркетинг", "Алматы");
  const datakz = await comp("datakz@test.kz", "DataKZ", "Аналитика данных", "Астана");
  const digital = await comp("digitalgroup@test.kz", "Digital Group", "Финансы и логистика", "Алматы");

  const P = (companyId: string, city: string, title: string, direction: string, durationMonths: number,
    format: string, places: number, description: string, requirements: string) =>
    db.practice.create({ data: { companyId, city, title, direction, durationMonths, format, places, description, requirements } });

  const frontend = await P(tech.id, "Астана", "Frontend Intern", "IT", 2, "Офис", 3, "Разработка интерфейсов на React в команде продукта.", "HTML, CSS, JavaScript, основы React");
  const backend = await P(tech.id, "Астана", "Backend Intern", "IT", 3, "Гибридный", 2, "Разработка REST API на Node.js.", "Node.js, SQL, Git");
  await P(qazaq.id, "Астана", "Java Intern", "IT", 3, "Офис", 2, "Разработка сервисов на Java и Spring.", "Java, ООП, SQL");
  await P(qazaq.id, "Астана", "QA Intern", "IT", 2, "Удалённо", 2, "Ручное и автоматизированное тестирование.", "Тест-дизайн, внимательность");
  const uiux = await P(creative.id, "Алматы", "UI/UX Designer", "Дизайн", 2, "Гибридный", 1, "Проектирование интерфейсов и прототипов.", "Figma, портфолио");
  const marketing = await P(creative.id, "Алматы", "Marketing Intern", "Маркетинг", 2, "Офис", 2, "Ведение соцсетей и подготовка контента.", "Копирайтинг, аналитика");
  const analyst = await P(datakz.id, "Астана", "Data Analyst", "Аналитика данных", 3, "Гибридный", 2, "Анализ данных и построение дашбордов.", "SQL, Python, Excel");
  const finance = await P(datakz.id, "Астана", "Financial Analyst", "Финансы", 2, "Офис", 1, "Финансовый анализ и отчётность.", "Excel, финансы");
  await P(digital.id, "Алматы", "HR Assistant", "HR", 1, "Офис", 1, "Подбор персонала и кадровый документооборот.", "Коммуникабельность");
  await P(digital.id, "Алматы", "Logistics Intern", "Логистика", 2, "Офис", 2, "Планирование маршрутов и учёт поставок.", "Excel, логистика");

  const app = (student: typeof arlan, practice: typeof frontend, company: typeof tech, uniId: string, data: object) =>
    db.application.create({ data: { studentId: student.id, practiceId: practice.id, companyId: company.id, universityId: uniId, ...data } });

  // PENDING
  await app(daulet, marketing, creative, mnu.id, { status: AppStatus.PENDING, date: days(-2) });
  // INVITED
  await app(aidos, uiux, creative, enu.id, { status: AppStatus.INVITED, date: days(-5) });
  // REJECTED
  await app(daulet, finance, datakz, mnu.id, { status: AppStatus.REJECTED, date: days(-9) });
  // SIGNING (студент и компания уже подписали, университет — нет)
  await app(arlan, analyst, datakz, enu.id, { status: AppStatus.SIGNING, date: days(-7),
    signedByStudent: true, signedByStudentAt: days(-3), signedByCompany: true, signedByCompanyAt: days(-4) });
  // COMPLETED с дневником и отчётом
  const done = await app(arlan, backend, tech, enu.id, { status: AppStatus.COMPLETED, date: days(-120),
    signedByStudent: true, signedByStudentAt: days(-110), signedByCompany: true, signedByCompanyAt: days(-110),
    signedByUniversity: true, signedByUniversityAt: days(-109), startDate: days(-105), completedDate: days(-15),
    reportDate: days(-16),
    reportText: "За время практики освоил разработку REST API на Node.js, работу с PostgreSQL и Git-процессами. Реализовал модуль авторизации и покрыл его тестами." });
  const diary = [
    "Знакомство с командой, настройка окружения, разбор архитектуры проекта.",
    "Изучил кодовую базу, взял первую задачу по исправлению ошибок в API.",
    "Реализовал эндпоинт списка заказов с пагинацией и фильтрами.",
    "Написал интеграционные тесты для модуля авторизации.",
    "Code review, исправление замечаний, деплой на тестовый стенд.",
    "Подготовил итоговую презентацию и документацию по модулю.",
  ];
  await db.diaryEntry.createMany({ data: diary.map((text, i) => ({ applicationId: done.id, text, date: days(-100 + i * 15) })) });

  console.log(`Seed OK: справочники, реестр ВУЗов РК (${imported.saved} + демо), 2 демо-университета с входом, 3 студента, 5 компаний (демо-БИН в реестре юрлиц), 10 практик, 5 заявок`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
