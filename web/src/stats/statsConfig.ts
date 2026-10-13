import type { Role } from "../api/types";
import type { GroupDef } from "../components/filters/FilterDrawer";
import {
  check, dates, companyApplicationGroups, studentApplicationGroups, universityPracticeGroups, universityStudentGroups,
} from "../components/filters/filterConfigs";

/** Откуда берутся значения фильтров и какие поля фильтров применимы к вкладке. */
export type Source = "applications" | "students" | "practices";

export interface StatTab { key: string; label: string; icon: string; source: Source; groups: GroupDef[] }

const universityAppGroups: GroupDef[] = [...universityPracticeGroups, dates];
// предложения практик: фильтруются по параметрам самого предложения
const offerGroups: GroupDef[] = [check("city", "Город"), check("format", "Формат"), check("duration", "Срок"), check("company", "Компания")];

const tab = (key: string, label: string, icon: string, source: Source, groups: GroupDef[]): StatTab => ({ key, label, icon, source, groups });

export const statTabs: Record<Role, StatTab[]> = {
  STUDENT: [
    tab("overview", "Обзор", "bi-grid", "applications", studentApplicationGroups),
    tab("statuses", "Статусы заявок", "bi-pie-chart", "applications", studentApplicationGroups),
    tab("months", "Заявки по месяцам", "bi-calendar3", "applications", studentApplicationGroups),
    tab("progress", "Прогресс практик", "bi-hourglass-split", "applications", studentApplicationGroups),
    tab("diary", "Дневник", "bi-journal-text", "applications", studentApplicationGroups),
  ],
  COMPANY: [
    tab("summary", "Сводка", "bi-grid", "applications", companyApplicationGroups),
    tab("statuses", "Статусы заявок", "bi-pie-chart", "applications", companyApplicationGroups),
    tab("practices", "Заявки по практикам", "bi-briefcase", "applications", companyApplicationGroups),
    tab("universities", "Заявки по университетам", "bi-mortarboard", "applications", companyApplicationGroups),
    tab("months", "Заявки по месяцам", "bi-calendar3", "applications", companyApplicationGroups),
  ],
  UNIVERSITY: [
    tab("summary", "Сводка", "bi-grid", "applications", universityAppGroups),
    tab("statuses", "Статусы заявок", "bi-pie-chart", "applications", universityAppGroups),
    tab("directions", "Направления практик", "bi-compass", "practices", offerGroups),
    tab("faculties", "Факультеты", "bi-diagram-3", "students", universityStudentGroups),
    tab("specialties", "Специальности", "bi-mortarboard", "students", universityStudentGroups),
    tab("byStatus", "Заявки по статусам", "bi-list-check", "applications", universityAppGroups),
    tab("companies", "Компании", "bi-building", "applications", universityAppGroups),
  ],
};
