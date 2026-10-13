import type { Progress } from "../../api/models";

/** Два цвета: «Пройдено: N%» (зелёный) и «Осталось: M% (≈ K дн.)». */
export default function ProgressBar({ p }: { p: Progress }) {
  const left = 100 - p.percent;
  return (
    <div className="progress" style={{ height: 24 }} role="progressbar" aria-valuenow={p.percent} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-bar bg-success" style={{ width: `${p.percent}%` }}>{p.percent >= 18 ? `Пройдено: ${p.percent}%` : p.percent > 0 ? `${p.percent}%` : ""}</div>
      {left > 0 && <div className="progress-bar bg-secondary-subtle text-dark" style={{ width: `${left}%` }}>{left >= 25 ? `Осталось: ${left}% (≈ ${p.remainingDays} дн.)` : `${left}%`}</div>}
    </div>
  );
}
