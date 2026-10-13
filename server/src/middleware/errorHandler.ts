import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { HttpError } from "../utils/httpError.js";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Не найдено" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.extra ?? {}) });
  if (err instanceof ZodError) {
    return void res.status(400).json({ error: err.issues[0]?.message ?? "Некорректные данные", issues: err.issues });
  }
  if (err instanceof multer.MulterError) {
    return void res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Файл слишком большой (максимум 5 МБ)" : "Ошибка загрузки файла" });
  }
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
