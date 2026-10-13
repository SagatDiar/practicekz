import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { verifyAccess } from "./utils/tokens.js";

let io: Server | null = null;

function cookieValue(header: string | undefined, name: string) {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Socket.IO: авторизация по тому же httpOnly-cookie с access-токеном; каждый пользователь — в своей комнате user:<id>. */
export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.WEB_ORIGIN, credentials: true } });
  io.use((socket, next) => {
    const token = cookieValue(socket.handshake.headers.cookie, "access_token");
    if (!token) return next(new Error("unauthorized"));
    try {
      socket.data.userId = verifyAccess(token).sub;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => { void socket.join(`user:${socket.data.userId}`); });
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}
