import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/utils/db.js";
import { resetDb } from "./helpers/db.js";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
