import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

// Лимит читается при загрузке приложения, поэтому сначала задаём его, потом импортируем app.
describe("лимит запросов на вход и регистрацию", () => {
  let app: import("express").Express;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = "5";
    ({ app } = await import("../src/app.js"));
  });

  it("после 5 запросов вход и регистрация отвечают 429 (счётчик общий)", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post("/api/auth/login").send({ email: "x@test.kz", password: "wrong-pass" });
      expect(r.status).toBe(401);
    }
    for (let i = 0; i < 2; i++) {
      const r = await request(app).post("/api/auth/register").send({});
      expect(r.status).toBe(400);
    }
    const login = await request(app).post("/api/auth/login").send({ email: "x@test.kz", password: "wrong-pass" });
    expect(login.status).toBe(429);
    expect(login.body.error).toBe("Слишком много попыток. Повторите позже");
    const register = await request(app).post("/api/auth/register").send({});
    expect(register.status).toBe(429);
  });

  it("остальные маршруты лимитом не затронуты", async () => {
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
  });
});
