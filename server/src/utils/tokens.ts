import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { Role } from "@prisma/client";
import { env } from "../config/env.js";

export interface TokenPayload { sub: string; role: Role }

const base = { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV === "production", path: "/" };

export function issueTokens(res: Response, payload: TokenPayload) {
  const access = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
  const refresh = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  res.cookie("access_token", access, { ...base, maxAge: 15 * 60 * 1000 });
  res.cookie("refresh_token", refresh, { ...base, path: "/api/auth", maxAge: 7 * 24 * 3600 * 1000 });
}

export function clearTokens(res: Response) {
  res.clearCookie("access_token", base);
  res.clearCookie("refresh_token", { ...base, path: "/api/auth" });
}

export const verifyAccess = (t: string) => jwt.verify(t, env.JWT_ACCESS_SECRET) as unknown as TokenPayload;
export const verifyRefresh = (t: string) => jwt.verify(t, env.JWT_REFRESH_SECRET) as unknown as TokenPayload;
