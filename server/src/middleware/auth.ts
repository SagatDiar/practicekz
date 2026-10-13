import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { HttpError } from "../utils/httpError.js";
import { verifyAccess } from "../utils/tokens.js";

declare global {
  namespace Express {
    interface Request { user?: { id: string; role: Role } }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.access_token;
  if (!token) throw new HttpError(401, "Требуется авторизация");
  try {
    const p = verifyAccess(token);
    req.user = { id: p.sub, role: p.role };
  } catch {
    throw new HttpError(401, "Сессия истекла");
  }
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw new HttpError(401, "Требуется авторизация");
  if (!roles.includes(req.user.role)) throw new HttpError(403, "Недостаточно прав");
  next();
};
