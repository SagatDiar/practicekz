import { Router } from "express";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { requireAuth } from "../middleware/auth.js";
import { notificationView } from "../services/notify.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// Только свои уведомления: userId всегда берётся из токена
notificationsRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const where = { userId, ...(req.query.unread === "1" ? { read: false } : {}) };
  const [total, unread, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
  ]);
  res.json({ items: rows.map(notificationView), total, unread, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

notificationsRouter.get("/unread-count", async (req, res) => {
  res.json({ unread: await prisma.notification.count({ where: { userId: req.user!.id, read: false } }) });
});

notificationsRouter.post("/read-all", async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
  res.json({ updated: r.count });
});

notificationsRouter.patch("/:id/read", async (req, res) => {
  const id = String(req.params.id);
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) throw new HttpError(404, "Уведомление не найдено");
  if (n.userId !== req.user!.id) throw new HttpError(403, "Это не ваше уведомление");
  res.json({ notification: notificationView(await prisma.notification.update({ where: { id }, data: { read: true } })) });
});
