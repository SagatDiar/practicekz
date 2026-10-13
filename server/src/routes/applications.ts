import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { mountList } from "../utils/listEngine.js";
import { applicationsList } from "../lists/applications.js";
import { createApplicationSchema, diarySchema, reportSchema } from "../validators/application.js";
import {
  addDiary, companyDecision, confirmFinish, createApplication, getVisible,
  requestFinish, saveReport, serialize, signApplication,
} from "../services/applications.js";

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth);

// GET /, /facets, /export.csv — фильтры, поиск, сортировка, пагинация на сервере (utils/listEngine)
mountList(applicationsRouter, applicationsList);

applicationsRouter.get("/:id", async (req, res) => {
  const a = await getVisible(String(req.params.id), req.user!);
  res.json({ application: { ...serialize(a), diary: a.diary } });
});

applicationsRouter.post("/", requireRole("STUDENT"), async (req, res) => {
  const { practiceId } = createApplicationSchema.parse(req.body);
  res.status(201).json({ application: serialize(await createApplication(req.user!.id, practiceId)) });
});

for (const action of ["invite", "approve", "reject"] as const) {
  applicationsRouter.post(`/:id/${action}`, requireRole("COMPANY"), async (req, res) => {
    res.json({ application: serialize(await companyDecision(String(req.params.id), req.user!.id, action)) });
  });
}

// Каждая сторона подписывает только за себя — роль берётся из токена
applicationsRouter.post("/:id/sign", async (req, res) => {
  res.json({ application: serialize(await signApplication(String(req.params.id), req.user!)) });
});

applicationsRouter.post("/:id/request-finish", requireRole("STUDENT"), async (req, res) => {
  res.json({ application: serialize(await requestFinish(String(req.params.id), req.user!.id)) });
});

applicationsRouter.post("/:id/confirm-finish", requireRole("COMPANY"), async (req, res) => {
  res.json({ application: serialize(await confirmFinish(String(req.params.id), req.user!.id)) });
});

applicationsRouter.post("/:id/diary", requireRole("STUDENT"), async (req, res) => {
  const { text, date } = diarySchema.parse(req.body);
  res.status(201).json({ entry: await addDiary(String(req.params.id), req.user!.id, text, date) });
});

applicationsRouter.put("/:id/report", requireRole("STUDENT"), async (req, res) => {
  const { text } = reportSchema.parse(req.body);
  res.json({ application: serialize(await saveReport(String(req.params.id), req.user!.id, text)) });
});
