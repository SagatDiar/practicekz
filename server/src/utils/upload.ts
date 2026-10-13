import multer from "multer";
import sharp from "sharp";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import type { FileKind } from "@prisma/client";
import { prisma } from "./db.js";
import { HttpError } from "./httpError.js";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX = 5 * 1024 * 1024;

const mem = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX, files: 1 } });
export const uploadPhoto = mem.single("photo");
export const uploadCert = mem.single("file");

const CERT_TYPES: Record<string, { ext: string; exts: string[] }> = {
  "application/pdf": { ext: "pdf", exts: [".pdf"] },
  "image/jpeg": { ext: "jpg", exts: [".jpg", ".jpeg"] },
  "image/png": { ext: "png", exts: [".png"] },
  "image/webp": { ext: "webp", exts: [".webp"] },
};

export interface Prepared { buf: Buffer; mime: string; ext: string; originalName: string }

const cleanName = (n: string) => path.basename(n).replace(/[\r\n"]/g, "").slice(0, 120) || "file";

/** Аватар: только изображение, обрезка до 256×256 через sharp, всегда JPEG. */
export async function prepareAvatar(file?: Express.Multer.File): Promise<Prepared> {
  if (!file) throw new HttpError(400, "Выберите изображение");
  if (!file.mimetype.startsWith("image/")) throw new HttpError(400, "Допускаются только изображения");
  try {
    const buf = await sharp(file.buffer).rotate().resize(256, 256, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    return { buf, mime: "image/jpeg", ext: "jpg", originalName: cleanName(file.originalname) };
  } catch {
    throw new HttpError(400, "Файл не является изображением");
  }
}

/** Сертификат: PDF или изображение ≤5 МБ; проверяются MIME, расширение и содержимое. */
export async function prepareCertificate(file: Express.Multer.File): Promise<Prepared> {
  const t = CERT_TYPES[file.mimetype];
  const name = cleanName(file.originalname);
  if (!t || !t.exts.includes(path.extname(name).toLowerCase())) throw new HttpError(400, "Допускаются PDF, JPG, PNG или WEBP");
  if (file.mimetype === "application/pdf") {
    if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "Файл не является PDF");
  } else {
    try { await sharp(file.buffer).metadata(); } catch { throw new HttpError(400, "Файл не является изображением"); }
  }
  return { buf: file.buffer, mime: file.mimetype, ext: t.ext, originalName: name };
}

export async function storeFile(ownerId: string, kind: FileKind, f: Prepared) {
  const filename = `${crypto.randomUUID()}.${f.ext}`; // случайное имя на диске, оригинальное — только в БД
  await fs.writeFile(path.join(UPLOAD_DIR, filename), f.buf);
  return prisma.file.create({ data: { ownerId, kind, path: filename, mime: f.mime, size: f.buf.length, originalName: f.originalName } });
}

export async function removeFile(id: string | null | undefined) {
  if (!id) return;
  const f = await prisma.file.findUnique({ where: { id } });
  if (!f) return;
  await prisma.file.delete({ where: { id } });
  await fs.unlink(path.join(UPLOAD_DIR, f.path)).catch(() => undefined);
}
