import request from "supertest";
import { expect } from "vitest";
import { app } from "../../src/app.js";
import { PASSWORD, type TestUser } from "./factories.js";

export const api = () => request(app);

/** Агент с cookie: входит под пользователем и дальше ходит как он. */
export async function loginAs(user: TestUser) {
  const agent = request.agent(app);
  const r = await agent.post("/api/auth/login").send({ email: user.email, password: PASSWORD });
  expect(r.status, `вход ${user.email}: ${JSON.stringify(r.body)}`).toBe(200);
  return agent;
}

/** Для CSV: забираем сырые байты, чтобы проверить BOM (текстовый парсер мог бы его съесть). */
export const rawBody = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
