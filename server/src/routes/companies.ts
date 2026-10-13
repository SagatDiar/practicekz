import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { mountList } from "../utils/listEngine.js";
import { companiesList } from "../lists/companies.js";

export const companiesRouter = Router();
mountList(companiesRouter, companiesList, [requireAuth, requireRole("UNIVERSITY")]);
