export interface Kpi { key: string; label: string; value: number | null; suffix?: string; icon: string }
export interface BarRow { label: string; value: number; color?: string }
export interface Segment { key: string; label: string; value: number; color: string }

export type KpiResult = { type: "kpi"; items: Kpi[]; progress: { label: string; percent: number } | null };
export type DoughnutResult = { type: "doughnut"; unit: string; total: number; segments: Segment[] };
export type BarsResult = { type: "bars"; unit: string; suffix: string; ordered: "value" | "time"; rows: BarRow[] };
export type StatResult = KpiResult | DoughnutResult | BarsResult;
