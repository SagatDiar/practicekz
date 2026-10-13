// Сквозная проверка этапов 2–6. Запуск: npm run smoke (API должен работать, база — после свежего seed)
import { io } from "socket.io-client";

const BASE = process.env.API_URL ?? "http://localhost:4000/api";
let failed = 0;

class Client {
  jar = new Map();
  async call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  async form(method, path, fd) {
    const res = await fetch(BASE + path, { method, body: fd, headers: { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  async text(path) {
    const res = await fetch(BASE + path, { headers: { Cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
    return { status: res.status, type: res.headers.get("content-type"), body: await res.text() };
  }
  async login(email, password = "123456") {
    const r = await this.call("POST", "/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
    return this;
  }
}

function check(name, cond, extra = "") {
  console.log(`${cond ? "✔" : "✘"} ${name}${cond ? "" : "  " + extra}`);
  if (!cond) failed++;
}
const expect = (name, r, status) => check(name, r.status === status, `(ожидали ${status}, получили ${status === r.status ? "" : r.status} ${r.data.error ?? ""})`);

const aidos = await new Client().login("student@test.kz");
const daulet = await new Client().login("dauletqanatuly@test.kz");
const company = await new Client().login("company@test.kz");
const enu = await new Client().login("enu@test.kz");
const mnu = await new Client().login("mnu@test.kz");

// практика Tech Solutions, на которую Айдос ещё не подавал
const list = await aidos.call("GET", "/practices?mine=0&limit=100");
const target = list.data.items.find((p) => p.company.name === "Tech Solutions" && !p.applied);
check("найдена практика для заявки", !!target);

// --- создание
let r = await aidos.call("POST", "/applications", { practiceId: target.id });
expect("студент подаёт заявку → 201", r, 201);
const id = r.data.application.id;
check("статус PENDING", r.data.application.status === "PENDING");
expect("повторная заявка → 409", await aidos.call("POST", "/applications", { practiceId: target.id }), 409);
expect("компания не может подавать заявку → 403", await company.call("POST", "/applications", { practiceId: target.id }), 403);

// --- права и порядок
expect("студент не может приглашать → 403", await aidos.call("POST", `/applications/${id}/invite`), 403);
expect("чужой студент не видит заявку → 404", await daulet.call("GET", `/applications/${id}`), 404);
expect("чужой университет не видит заявку → 404", await mnu.call("GET", `/applications/${id}`), 404);
expect("подпись до одобрения → 409", await aidos.call("POST", `/applications/${id}/sign`), 409);
expect("дневник до начала практики → 409", await aidos.call("POST", `/applications/${id}/diary`, { text: "Слишком рано" }), 409);

// --- решения компании
r = await company.call("POST", `/applications/${id}/invite`);
check("PENDING → INVITED", r.data.application?.status === "INVITED");
r = await company.call("POST", `/applications/${id}/approve`);
check("INVITED → SIGNING", r.data.application?.status === "SIGNING");
expect("повторное одобрение → 409", await company.call("POST", `/applications/${id}/approve`), 409);

// --- три подписи
r = await aidos.call("POST", `/applications/${id}/sign`);
check("подпись студента, статус SIGNING", r.data.application?.status === "SIGNING" && r.data.application.signatures.student.signed);
expect("повторная подпись студента → 409", await aidos.call("POST", `/applications/${id}/sign`), 409);
expect("чужой университет не может подписать → 403", await mnu.call("POST", `/applications/${id}/sign`), 403);
await company.call("POST", `/applications/${id}/sign`);
r = await enu.call("POST", `/applications/${id}/sign`);
check("три подписи → ACTIVE", r.data.application?.status === "ACTIVE");
check("startDate установлен", !!r.data.application?.startDate);
check("прогресс 0%", r.data.application?.progress?.percent === 0);

// --- дневник и отчёт
expect("компания не может писать в дневник → 403", await company.call("POST", `/applications/${id}/diary`, { text: "Запись" }), 403);
expect("запись в дневник → 201", await aidos.call("POST", `/applications/${id}/diary`, { text: "Первый день практики: знакомство с командой" }), 201);
expect("отчёт сохранён", await aidos.call("PUT", `/applications/${id}/report`, { text: "Промежуточный отчёт по практике" }), 200);
r = await company.call("GET", `/applications/${id}`);
check("компания читает дневник и отчёт", r.data.application?.diary?.length === 1 && !!r.data.application.reportText);

// --- завершение
expect("компания не может завершить до запроса → 409", await company.call("POST", `/applications/${id}/confirm-finish`), 409);
r = await aidos.call("POST", `/applications/${id}/request-finish`);
check("ACTIVE → FINISH_REQUESTED", r.data.application?.status === "FINISH_REQUESTED");
r = await company.call("POST", `/applications/${id}/confirm-finish`);
check("FINISH_REQUESTED → COMPLETED", r.data.application?.status === "COMPLETED");
check("прогресс 100%", r.data.application?.progress?.percent === 100);

// --- уведомления записаны в БД (проверим через сид-заявку и счётчик заявок)
r = await enu.call("GET", "/applications?limit=100");
check("университет видит только своих студентов", r.data.items.every((a) => a.university.name === "ЕНУ"));

// --- практики
r = await company.call("POST", "/practices", { title: "DevOps Intern", direction: "IT", city: "Астана", description: "Поддержка CI/CD и инфраструктуры", requirements: "Linux, Git", durationMonths: 2, format: "Офис", places: 2 });
expect("компания создаёт практику → 201", r, 201);
const pid = r.data.practice?.id;
expect("студент не может создавать практику → 403", await aidos.call("POST", "/practices", {}), 403);
expect("срок 7 месяцев → 400", await company.call("POST", "/practices", { title: "X", direction: "IT", city: "Астана", description: "Длинное описание", requirements: "Y", durationMonths: 7, format: "Офис", places: 1 }), 400);
expect("другая компания не может удалить → 403", await (await new Client().login("qazaqsoft@test.kz")).call("DELETE", `/practices/${pid}`), 403);
expect("владелец удаляет практику без заявок", await company.call("DELETE", `/practices/${pid}`), 200);

// ================= ЭТАП 3: списки, фильтры, сортировка, CSV =================
const enc = encodeURIComponent;
const sorted = (a) => a.every((v, i) => i === 0 || a[i - 1].localeCompare(v, "ru") <= 0);

r = await aidos.call("GET", `/practices?mine=0&city=${enc("Алматы")}&city=${enc("Астана")}&limit=25`);
check("практики: фильтр по нескольким городам", r.data.items.length > 0 && r.data.items.every((p) => ["Алматы", "Астана"].includes(p.city)));
r = await aidos.call("GET", "/practices?limit=7");
expect("недопустимый limit → откат на 10", r, 200);
check("limit=7 → 10", r.data.limit === 10);
r = await aidos.call("GET", "/practices?sort=title:asc&limit=100");
check("практики: сортировка по названию А–Я", sorted(r.data.items.map((p) => p.title)));
r = await aidos.call("GET", "/practices?q=analyst");
check("практики: поиск «analyst»", r.data.total >= 1 && r.data.items.every((p) => /analyst/i.test(p.title + p.direction + p.city + p.company.name)));
r = await aidos.call("GET", "/practices?hideApplied=1&limit=100");
check("практики: «скрыть уже поданные»", r.data.items.every((p) => p.applied === false));
r = await aidos.call("GET", `/practices/facets?city=${enc("Астана")}`);
check("facets практик: город/формат/срок/компания", ["city", "format", "duration", "company"].every((k) => Array.isArray(r.data.facets?.[k])));
check("facets: счётчики положительные", Object.values(r.data.facets).flat().every((f) => f.count > 0));

r = await enu.call("GET", `/applications?status=COMPLETED&status=SIGNING&limit=100`);
check("заявки: фильтр по нескольким статусам", r.data.items.length > 0 && r.data.items.every((a) => ["COMPLETED", "SIGNING"].includes(a.status)));
r = await enu.call("GET", `/applications?dateFrom=2999-01-01`);
check("заявки: диапазон дат (пустой результат)", r.data.total === 0);
r = await enu.call("GET", "/applications?sort=student:asc&limit=100");
check("заявки: сортировка по студенту", sorted(r.data.items.map((a) => a.student.lastName)));
r = await enu.call("GET", "/applications/facets?facets=status&facets=company");
check("facets заявок: запрошены только status и company", Object.keys(r.data.facets).sort().join() === "company,status");
r = await enu.call("GET", `/applications/export.csv?status=COMPLETED`);
check("CSV заявок: BOM, ';', заголовок", r.status === 200 && r.type.startsWith("text/csv") && r.body.startsWith("\uFEFF") && r.body.split("\r\n")[0].includes(";"));
check("CSV заявок: только выбранный статус", r.body.split("\r\n").slice(1).every((l) => l.includes("Практика завершена")));

r = await enu.call("GET", "/students?limit=100");
check("студенты: список ЕНУ не пуст", r.data.items.length >= 2);
const names = r.data.items.map((s) => s.lastName);
check("студенты ЕНУ не включают студента МНУ", !names.includes("Канатулы"));
r = await enu.call("GET", "/students?course=3");
check("студенты: фильтр по курсу", r.data.items.length > 0 && r.data.items.every((s) => s.course === 3));
r = await enu.call("GET", "/students/facets");
check("facets студентов: есть company и status", Array.isArray(r.data.facets?.company) && Array.isArray(r.data.facets?.status));
expect("студент не видит список студентов → 403", await aidos.call("GET", "/students"), 403);
r = await mnu.call("GET", "/companies?sort=offers:desc");
check("компании: сортировка по числу предложений", r.data.items.length >= 5 && r.data.items.every((c, i, a) => i === 0 || a[i - 1].offers >= c.offers));
r = await mnu.call("GET", "/companies/export.csv");
check("CSV компаний", r.status === 200 && r.body.includes("Tech Solutions"));
expect("компания не видит список компаний → 403", await company.call("GET", "/companies"), 403);

// ================= ЭТАП 4: профиль, файлы, студент, сводки =================
r = await aidos.call("PATCH", "/profile", { skills: "Figma, Photoshop, Illustrator", course: 4 });
check("профиль студента обновлён", r.data.user?.student?.skills.includes("Illustrator") && r.data.user.student.course === 4);
expect("пустое имя → 400", await aidos.call("PATCH", "/profile", { firstName: "" }), 400);
r = await company.call("PATCH", "/profile", { industry: "IT и разработка" });
check("профиль компании обновлён", r.data.user?.company?.industry === "IT и разработка");

// фото: не изображение → 400
let fd = new FormData(); fd.append("photo", new Blob(["не картинка"], { type: "text/plain" }), "a.txt");
expect("фото: текстовый файл → 400", await aidos.form("POST", "/profile/photo", fd), 400);

// доп. образование
fd = new FormData(); fd.append("type", "CERTIFICATE"); fd.append("title", "Google UX Design"); fd.append("organization", "Coursera"); fd.append("date", "2025-05-01");
fd.append("file", new Blob(["%PDF-1.4 demo"], { type: "application/pdf" }), "cert.pdf");
r = await aidos.form("POST", "/profile/extra", fd);
expect("сертификат с PDF добавлен → 201", r, 201);
const ex = r.data.items?.[0];
check("файл привязан к записи", !!ex?.file?.id);
fd = new FormData(); fd.append("type", "CERTIFICATE"); fd.append("title", "Фейк"); fd.append("organization", "X1"); fd.append("date", "2025-05-01");
fd.append("file", new Blob(["MZ exe"], { type: "application/pdf" }), "fake.pdf");
expect("поддельный PDF → 400", await aidos.form("POST", "/profile/extra", fd), 400);
fd = new FormData(); fd.append("type", "CERTIFICATE"); fd.append("title", "Будущее"); fd.append("organization", "X1"); fd.append("date", "2999-01-01");
expect("дата в будущем → 400", await aidos.form("POST", "/profile/extra", fd), 400);

// доступ к файлу и профилю студента
r = await aidos.text(`/files/${ex.file.id}`);
check("владелец скачивает файл", r.status === 200);
r = await (await new Client().login("student@test.kz")).text(`/files/${ex.file.id}`);
check("файл: повторная проверка владельца", r.status === 200);
check("чужой университет (МНУ) не видит файл → 403", (await mnu.text(`/files/${ex.file.id}`)).status === 403);
check("чужой студент не видит файл → 403", (await daulet.text(`/files/${ex.file.id}`)).status === 403);
check("университет ЕНУ видит файл", (await enu.text(`/files/${ex.file.id}`)).status === 200);
r = await enu.call("GET", `/students/${(await enu.call("GET", "/students?limit=100")).data.items.find((s) => s.lastName === "Нурланов").id}`);
check("университет читает профиль своего студента с сертификатом", r.status === 200 && r.data.student.extra.length === 1);
const aidosId = r.data.student.id;
expect("МНУ не читает чужого студента → 403", await mnu.call("GET", `/students/${aidosId}`), 403);
expect("студент не читает чужой профиль → 403", await daulet.call("GET", `/students/${aidosId}`), 403);
r = await (await new Client().login("creativelab@test.kz")).call("GET", `/students/${aidosId}`);
check("компания с заявкой читает профиль студента", r.status === 200);
expect("компания без заявки не читает профиль → 403", await (await new Client().login("digitalgroup@test.kz")).call("GET", `/students/${aidosId}`), 403);
expect("чужая запись не удаляется → 404/403", await daulet.call("DELETE", `/profile/extra/${ex.id}`), 403);
expect("запись удалена владельцем", await aidos.call("DELETE", `/profile/extra/${ex.id}`), 200);
check("после удаления файл недоступен → 404", (await aidos.text(`/files/${ex.file.id}`)).status === 404);

// сводки
r = await aidos.call("GET", "/dashboard");
check("сводка студента", r.data.role === "STUDENT" && typeof r.data.stats.total === "number" && r.data.recommended.length > 0);
r = await company.call("GET", "/dashboard");
check("сводка компании", r.data.role === "COMPANY" && r.data.stats.practices >= 2);
r = await enu.call("GET", "/dashboard");
check("сводка университета", r.data.role === "UNIVERSITY" && typeof r.data.stats.awaiting === "number");

// ================= ЭТАП 5: уведомления и Socket.IO =================
const ORIGIN = BASE.replace(/\/api$/, "");
const connect = (client, withCookie = true) => new Promise((resolve, reject) => {
  const socket = io(ORIGIN, { transports: ["websocket"], reconnection: false,
    extraHeaders: withCookie ? { Cookie: [...client.jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {} });
  socket.on("connect", () => resolve(socket));
  socket.on("connect_error", (e) => reject(e));
});
const waitEvent = (socket, ms = 4000) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), ms);
  socket.once("notification", (n) => { clearTimeout(t); resolve(n); });
});

let denied = false;
try { (await connect(aidos, false)).disconnect(); } catch { denied = true; }
check("сокет без cookie отклоняется", denied);

const sCompany = await connect(company);
const sUni = await connect(mnu);
const sOther = await connect(await new Client().login("qazaqsoft@test.kz"));
const pCompany = waitEvent(sCompany), pUni = waitEvent(sUni), pOther = waitEvent(sOther, 1500);
const feList = await daulet.call("GET", "/practices?q=Frontend&mine=0");
const fe = feList.data.items.find((p) => p.company.name === "Tech Solutions");
r = await daulet.call("POST", "/applications", { practiceId: fe.id });
expect("студент МНУ подал заявку в Tech Solutions → 201", r, 201);
const nCompany = await pCompany, nUni = await pUni, nOther = await pOther;
check("компания получила событие в реальном времени", nCompany?.type === "APPLICATION_NEW" && nCompany.text.includes("Даулет"));
check("университет студента получил событие", nUni?.type === "APPLICATION_NEW");
check("посторонняя компания события не получила", nOther === null);
[sCompany, sUni, sOther].forEach((x) => x.disconnect());

// ошибка в транзакции не рассылает уведомления: повторная подача → 409 и тишина
const sCompany2 = await connect(company);
const quiet = waitEvent(sCompany2, 1200);
expect("повторная заявка → 409", await daulet.call("POST", "/applications", { practiceId: fe.id }), 409);
check("при отказе событие не отправлено", (await quiet) === null);
sCompany2.disconnect();

// REST
r = await company.call("GET", "/notifications?limit=5");
check("список уведомлений: пагинация и счётчик", r.data.items.length > 0 && r.data.items.length <= 5 && r.data.unread >= 1 && r.data.pages >= 1);
check("уведомления отсортированы от новых к старым", r.data.items.every((n, i, a) => i === 0 || new Date(a[i - 1].createdAt) >= new Date(n.createdAt)));
const nid = r.data.items[0].id;
r = await company.call("GET", "/notifications/unread-count");
const before = r.data.unread;
check("счётчик непрочитанных > 0", before > 0);
expect("чужое уведомление нельзя прочитать → 403", await daulet.call("PATCH", `/notifications/${nid}/read`), 403);
r = await company.call("PATCH", `/notifications/${nid}/read`);
check("уведомление отмечено прочитанным", r.data.notification?.read === true);
check("счётчик уменьшился", (await company.call("GET", "/notifications/unread-count")).data.unread === before - 1);
expect("несуществующее уведомление → 404", await company.call("PATCH", "/notifications/00000000-0000-0000-0000-000000000000/read"), 404);
await company.call("POST", "/notifications/read-all");
check("«прочитать все» обнуляет счётчик", (await company.call("GET", "/notifications/unread-count")).data.unread === 0);
r = await company.call("GET", "/notifications?unread=1");
check("фильтр unread=1 пуст после «прочитать все»", r.data.total === 0);
check("чужие уведомления в списке студента не появляются", (await daulet.call("GET", "/notifications?limit=50")).data.items.every((n) => n.id !== nid));

// ================= ЭТАП 6: статистика =================
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sortedDesc = (rows) => rows.every((x, i) => i === 0 || rows[i - 1].value >= x.value);

// доступ
expect("статистика без входа → 401", await new Client().call("GET", "/stats/student/overview"), 401);
expect("студент не видит статистику компании → 403", await daulet.call("GET", "/stats/company/summary"), 403);
expect("компания не видит статистику университета → 403", await company.call("GET", "/stats/university/summary"), 403);
expect("неизвестная метрика → 404", await daulet.call("GET", "/stats/student/nope"), 404);
expect("метрика чужой роли у своей роли → 404", await daulet.call("GET", "/stats/student/faculties"), 404);
expect("студенты как источник фильтров только для университета → 403", await company.call("GET", "/stats/facets?source=students"), 403);
expect("неизвестный источник фильтров → 400", await mnu.call("GET", "/stats/facets?source=users"), 400);

// студент: сводка согласуется со списком заявок
const dApps = (await daulet.call("GET", "/applications?limit=100")).data;
r = await daulet.call("GET", "/stats/student/overview");
const kv = Object.fromEntries((r.data.items ?? []).map((i) => [i.key, i.value]));
check("студент: 8 показателей обзора", r.data.type === "kpi" && r.data.items.length === 8);
check("студент: «Всего заявок» = число заявок в списке", kv.total === dApps.total, `(${kv.total} vs ${dApps.total})`);
check("студент: части складываются в общее число", kv.process + kv.running + kv.done + kv.rejected === kv.total);

r = await daulet.call("GET", "/stats/student/statuses");
check("студент: круговая диаграмма суммируется в total", r.data.type === "doughnut" && sum(r.data.segments.map((x) => x.value)) === r.data.total && r.data.total === dApps.total);
const pendingOnly = await daulet.call("GET", "/stats/student/statuses?status=PENDING");
check("фильтр status=PENDING сужает диаграмму", pendingOnly.data.segments.every((x) => x.key === "PENDING") && pendingOnly.data.total <= r.data.total);
const multi = await daulet.call("GET", "/stats/student/statuses?status=PENDING&status=REJECTED");
check("фильтр с несколькими значениями", multi.data.segments.every((x) => ["PENDING", "REJECTED"].includes(x.key)));

r = await daulet.call("GET", "/stats/student/months");
check("заявки по месяцам: ровно 6 месяцев по порядку", r.data.type === "bars" && r.data.rows.length === 6 && r.data.ordered === "time");
check("заявки по месяцам: сумма ≤ числу заявок", sum(r.data.rows.map((x) => x.value)) <= dApps.total);
r = await daulet.call("GET", "/stats/student/progress");
check("прогресс практик: значения 0–100, по убыванию", r.data.rows.every((x) => x.value >= 0 && x.value <= 100) && sortedDesc(r.data.rows) && r.data.suffix === "%");
r = await daulet.call("GET", "/stats/student/diary");
check("дневник: по убыванию", r.data.type === "bars" && sortedDesc(r.data.rows));

// CSV
const csv = await daulet.text("/stats/student/statuses?format=csv");
check("CSV статистики: text/csv, BOM, разделитель «;»", csv.status === 200 && csv.type?.includes("text/csv") && csv.body.startsWith("\uFEFF") && csv.body.includes(";"));

// компания
r = await company.call("GET", "/stats/company/summary");
const cAll = (await company.call("GET", "/applications?limit=100")).data;
check("компания: «Заявок» = числу заявок в списке", r.data.items.find((i) => i.key === "total")?.value === cAll.total);
r = await company.call("GET", "/stats/company/practices");
check("компания: заявки по практикам, по убыванию, сумма = числу заявок", sortedDesc(r.data.rows) && sum(r.data.rows.map((x) => x.value)) === cAll.total);
r = await company.call("GET", "/stats/company/universities");
check("компания: заявки по университетам, сумма = числу заявок", sum(r.data.rows.map((x) => x.value)) === cAll.total);
const otherCompany = await new Client().login("qazaqsoft@test.kz");
check("компания видит только свои заявки (чужая — другие цифры)",
  sum((await otherCompany.call("GET", "/stats/company/practices")).data.rows.map((x) => x.value)) === (await otherCompany.call("GET", "/applications?limit=100")).data.total);

// университет
const mnuStudents = (await mnu.call("GET", "/students?limit=100")).data;
r = await mnu.call("GET", "/stats/university/faculties");
check("университет: факультеты суммируются в число своих студентов", sum(r.data.rows.map((x) => x.value)) === mnuStudents.total && sortedDesc(r.data.rows), `(${sum(r.data.rows.map((x) => x.value))} vs ${mnuStudents.total})`);
r = await mnu.call("GET", "/stats/university/specialties");
check("университет: специальности суммируются в число своих студентов", sum(r.data.rows.map((x) => x.value)) === mnuStudents.total);
r = await enu.call("GET", "/stats/university/faculties");
check("другой университет считает только своих студентов", sum(r.data.rows.map((x) => x.value)) === (await enu.call("GET", "/students?limit=100")).data.total);
r = await mnu.call("GET", "/stats/university/statuses");
check("университет: 3 группы статусов суммируются в total", sum(r.data.segments.map((x) => x.value)) === r.data.total && r.data.segments.length <= 3);
r = await mnu.call("GET", "/stats/university/byStatus");
check("университет: 7 статусов, по убыванию", r.data.rows.length === 7 && sortedDesc(r.data.rows));
r = await mnu.call("GET", "/stats/university/directions");
check("университет: направления практик по убыванию", r.data.type === "bars" && r.data.rows.length > 0 && sortedDesc(r.data.rows));
r = await mnu.call("GET", "/stats/university/summary");
const cov = r.data.items.find((i) => i.key === "coverage");
check("университет: сводка с процентом студентов с практикой", r.data.items.length === 7 && (cov.value === null || (cov.value >= 0 && cov.value <= 100)));
r = await mnu.call("GET", "/stats/university/companies");
check("университет: компании по принятым студентам", r.data.type === "bars" && sortedDesc(r.data.rows));

// фильтры и счётчики для вкладок
r = await mnu.call("GET", "/stats/facets?source=students");
const fac = r.data.facets?.faculty ?? [];
check("счётчики фильтров (студенты): есть факультеты", fac.length > 0);
r = await mnu.call("GET", `/stats/university/faculties?faculty=${encodeURIComponent(fac[0]?.value ?? "")}`);
check("фильтр по факультету оставляет только его", r.data.rows.length === 1 && r.data.rows[0].label === fac[0]?.value);
check("счётчики фильтров (заявки, практики) отвечают", (await mnu.call("GET", "/stats/facets?source=applications")).status === 200 && (await mnu.call("GET", "/stats/facets?source=practices")).status === 200);
r = await daulet.call("GET", "/stats/student/statuses?dateFrom=2999-01-01");
check("фильтр по дате: пустой период → пустая диаграмма", r.data.total === 0 && r.data.segments.length === 0);

console.log(failed ? `\nОшибок: ${failed}` : "\nВсе проверки пройдены");
process.exit(failed ? 1 : 0);
