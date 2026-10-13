import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../utils/httpError.js";
import { runFacets, type ListConfig } from "../utils/listEngine.js";
import { applicationsList } from "../lists/applications.js";
import { studentsList } from "../lists/students.js";
import { practicesList } from "../lists/practices.js";
import { metricExists, runStat, statCsv } from "../services/stats.js";

export const statsRouter = Router();
statsRouter.use(requireAuth);

// какие источники данных доступны какой роли (студентов и практики по всей платформе видит только университет)
const SOURCES: Record<string, { cfg: ListConfig; roles: string[] }> = {
  applications: { cfg: applicationsList, roles: ["STUDENT", "COMPANY", "UNIVERSITY"] },
  students: { cfg: studentsList, roles: ["UNIVERSITY"] },
  practices: { cfg: practicesList, roles: ["UNIVERSITY"] },
};

/** Счётчики для панели «Фильтр» в статистике: GET /api/stats/facets?source=applications|students|practices&... */
statsRouter.get("/facets", async (req, res) => {
  const key = String(req.query.source ?? "applications");
  const src = Object.hasOwn(SOURCES, key) ? SOURCES[key] : undefined; // не берём ключи из прототипа (constructor и т. п.)
  if (!src) throw new HttpError(400, "Неизвестный источник фильтров");
  if (!src.roles.includes(req.user!.role)) throw new HttpError(403, "Недостаточно прав");
  res.json({ facets: await runFacets(src.cfg, req.user!, req.query) });
});

/** GET /api/stats/:role/:metric[?фильтры][&format=csv] — роль в пути обязана совпадать с ролью пользователя. */
statsRouter.get("/:role/:metric", async (req, res) => {
  const role = String(req.params.role).toLowerCase();
  const metric = String(req.params.metric);
  if (role.toUpperCase() !== req.user!.role) throw new HttpError(403, "Недостаточно прав");
  if (!metricExists(role, metric)) throw new HttpError(404, "Такой статистики нет");
  const result = await runStat(role, metric, req.user!, req.query);
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="stats-${role}-${metric}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return void res.send(statCsv(result));
  }
  res.json(result);
});
