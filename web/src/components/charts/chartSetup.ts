import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip, type Plugin } from "chart.js";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip);
ChartJS.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
ChartJS.defaults.color = "#4a5472";

/** Белый фон, чтобы PNG не получался прозрачным. */
export const whiteBg: Plugin = {
  id: "whiteBg",
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    ctx.save();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  },
};

export const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
