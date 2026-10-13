import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { prisma } from "../utils/db.js";
import { HttpError } from "../utils/httpError.js";
import { clearTokens, issueTokens, verifyRefresh } from "../utils/tokens.js";
import { isValidBin, normalizeBin } from "../utils/bin.js";
import { requireAuth } from "../middleware/auth.js";
import { loadMe } from "../services/me.js";
import { consumeEmailCode, issueEmailCode } from "../services/emailCodes.js";
import { loginSchema, passwordChangeSchema, registerSchema, resendSchema, verifyEmailSchema } from "../validators/auth.js";

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: env.AUTH_RATE_LIMIT, standardHeaders: true, legacyHeaders: false,
  message: { error: "Слишком много попыток. Повторите позже" },
});

/** Отправка кода; повторный запрос раньше минуты не считается ошибкой (чтобы не выдавать, есть ли такой email). */
async function sendCodeQuietly(user: { id: string; email: string }) {
  try { return await issueEmailCode(user); }
  catch (e) { if (e instanceof HttpError && e.status === 429) return {}; throw e; }
}

authRouter.post("/register", limiter, async (req, res) => {
  const d = registerSchema.parse(req.body);

  // Неподтверждённая регистрация доступа не давала и данных не содержит — её можно перезаписать
  // (человек не дошёл до кода, или кто-то занял чужой email/БИН, не подтвердив его).
  await prisma.user.deleteMany({ where: { email: d.email, accountStatus: "PENDING_VERIFICATION" } });
  if (await prisma.user.findUnique({ where: { email: d.email } })) {
    throw new HttpError(409, "Пользователь с таким email уже зарегистрирован");
  }
  const passwordHash = await bcrypt.hash(d.password, 10);

  let user;
  if (d.role === "STUDENT") {
    const uni = await prisma.user.findFirst({ where: { id: d.universityId, role: "UNIVERSITY" } });
    if (!uni) throw new HttpError(400, "Выбранный университет не найден");
    user = await prisma.user.create({
      data: {
        role: "STUDENT", email: d.email, passwordHash, city: d.city, accountStatus: "PENDING_VERIFICATION",
        student: { create: { firstName: d.firstName, lastName: d.lastName, universityId: d.universityId,
          faculty: d.faculty, specialty: d.specialty, course: d.course, skills: d.skills, city: d.city } },
      },
    });
  } else {
    const bin = normalizeBin(d.bin);
    if (!isValidBin(bin)) throw new HttpError(400, "Некорректный БИН: проверьте 12 цифр");
    const entity = await prisma.legalEntity.findUnique({ where: { bin } });
    if (!entity) throw new HttpError(400, "Организация с таким БИН не найдена в реестре юридических лиц РК");
    if (entity.status !== "ACTIVE") throw new HttpError(400, "Организация с таким БИН не действует (ликвидирована)");
    await prisma.user.deleteMany({ where: { accountStatus: "PENDING_VERIFICATION", company: { is: { bin } } } });
    if (await prisma.companyProfile.findUnique({ where: { bin } })) {
      throw new HttpError(409, "Компания с таким БИН уже зарегистрирована");
    }
    user = await prisma.user.create({
      data: {
        role: "COMPANY", email: d.email, passwordHash, city: d.city, accountStatus: "PENDING_VERIFICATION",
        company: { create: { companyName: entity.name, industry: d.industry || entity.industry || "Не указана", city: d.city, bin, verified: true } },
      },
    });
  }

  const sent = await issueEmailCode(user);
  res.status(201).json({ verificationRequired: true, email: user.email, ...sent });
});

authRouter.post("/verify-email", limiter, async (req, res) => {
  const { email, code } = verifyEmailSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.accountStatus === "UNCLAIMED") throw new HttpError(400, "Неверный код");
  if (user.accountStatus === "ACTIVE") throw new HttpError(400, "Email уже подтверждён — просто войдите");
  await consumeEmailCode(user.id, code);
  issueTokens(res, { sub: user.id, role: user.role });
  res.json({ user: await loadMe(user.id) });
});

authRouter.post("/resend-code", limiter, async (req, res) => {
  const { email } = resendSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const sent = user && user.accountStatus === "PENDING_VERIFICATION" ? await sendCodeQuietly(user) : {};
  res.json({ ok: true, ...sent });
});

authRouter.post("/login", limiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && user.accountStatus !== "UNCLAIMED" ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, "Неверный email или пароль");
  if (user.accountStatus === "PENDING_VERIFICATION") {
    const sent = await sendCodeQuietly(user);
    throw new HttpError(403, "Подтвердите email: мы отправили код на вашу почту", "EMAIL_NOT_VERIFIED", { email: user.email, ...sent });
  }
  issueTokens(res, { sub: user.id, role: user.role });
  res.json({ user: await loadMe(user.id) });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) throw new HttpError(401, "Требуется авторизация");
  let p;
  try { p = verifyRefresh(token); } catch { throw new HttpError(401, "Сессия истекла"); }
  const user = await prisma.user.findUnique({ where: { id: p.sub } });
  if (!user || user.accountStatus !== "ACTIVE") throw new HttpError(401, "Пользователь не найден");
  issueTokens(res, { sub: user.id, role: user.role });
  res.json({ ok: true });
});

authRouter.post("/logout", (_req, res) => {
  clearTokens(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await loadMe(req.user!.id) });
});

authRouter.patch("/me/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(400, "Неверный текущий пароль");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  res.json({ ok: true });
});
