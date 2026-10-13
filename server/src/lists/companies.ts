import { prisma } from "../utils/db.js";
import type { ListConfig } from "../utils/listEngine.js";

const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
const plain = (key: string) => ({
  where: (v: string[]) => ({ [key]: { in: v } }),
  select: { [key]: true },
  pick: (r: any) => ({ value: r[key], label: r[key] }),
});

export const companiesList: ListConfig = {
  model: prisma.companyProfile,
  fileName: "companies",
  base: () => ({}),
  include: { user: { include: { _count: { select: { practices: true } } } } },
  fields: { city: plain("city"), industry: plain("industry") },
  search: (q) => ({ OR: [{ companyName: ci(q) }, { industry: ci(q) }, { city: ci(q) }] }),
  sorts: {
    name: (d) => ({ companyName: d }),
    industry: (d) => ({ industry: d }),
    city: (d) => ({ city: d }),
    offers: (d) => ({ user: { practices: { _count: d } } }),
  },
  defaultSort: "name:asc",
  serialize: (c) => ({ id: c.userId, name: c.companyName, industry: c.industry, city: c.city, offers: c.user._count.practices }),
  csv: () => ({
    headers: ["Компания", "Сфера деятельности", "Город", "Предложений"],
    row: (c) => [c.name, c.industry, c.city, c.offers],
  }),
};
