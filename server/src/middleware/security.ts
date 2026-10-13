import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

// CSRF: SameSite=Lax + проверка Origin для небезопасных методов
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && origin !== env.WEB_ORIGIN) throw new HttpError(403, "Недопустимый источник запроса");
  next();
}
