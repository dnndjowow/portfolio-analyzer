import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompareResult, Metrics } from "@/types";
import { Segmented } from "@/components/ui/segmented";
import { chartTheme, cn, num, pct, PORTFOLIO_COLORS } from "@/lib/utils";

export function ReturnsCurve({ data, periodLabel, dark }: { data: CompareResult; periodLabel: string; dark: boolean }) {
  const [view, setView] = useState<"curve" | "dd">("curve");
  const theme = chartTheme(dark);
  const rows = data.index.map((label, t) => {
    const r: Record<string, number | string> = { label };
    data.series.forEach((s, i) => { r[`s${i}`] = view === "curve" ? s.curve[t] : s.drawdown[t]; });
    return r;
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="legend" aria-label="Портфели">
          {data.series.map((s, i) => (
            <li key={i} className="is-portfolio"><span className="lg-line" style={{ background: PORTFOLIO_COLORS[i % 5] }} />{s.name}</li>
          ))}
        </ul>
        <Segmented label="Что показать" value={view} onChange={setView}
          options={[{ value: "curve", label: "Капитал" }, { value: "dd", label: "Просадки" }]} />
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 22, left: 0 }}>
            <CartesianGrid strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="label" minTickGap={28} tickLine={false} stroke={theme.grid}
              label={{ value: periodLabel, position: "insideBottom", offset: -14, fill: theme.muted, fontSize: 12.5 }} />
            <YAxis width={56} domain={["auto", "auto"]} tickLine={false} axisLine={false}
              tickFormatter={(v) => (view === "curve" ? num(v, 0) : pct(v, 0))} />
            <Tooltip isAnimationActive={false} cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
              formatter={(v: number, name) => [view === "curve" ? num(v, 1) : pct(v, 1), name]} />
            <ReferenceLine y={view === "curve" ? 100 : 0} stroke={theme.muted} strokeOpacity={0.5} strokeDasharray="4 4" />
            {data.series.map((s, i) => (
              <Line key={i} dataKey={`s${i}`} name={s.name} stroke={PORTFOLIO_COLORS[i % 5]} type="linear"
                strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: theme.surface }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="panel-foot">
        {view === "curve"
          ? "Сколько стали бы 100 ₽, вложенные в начале периода. Доходности реальные, ребалансировка каждый период."
          : "Насколько портфель опускался ниже своего предыдущего максимума."}
      </p>
    </div>
  );
}

type Key = "expected_return" | "volatility" | "sharpe" | "max_drawdown" | "max_recovery_periods";
const BETTER: Record<Key, "max" | "min"> = {
  expected_return: "max", volatility: "min", sharpe: "max", max_drawdown: "max", max_recovery_periods: "min",
};

function bestIndex(series: { metrics: Metrics }[], key: Key) {
  if (series.length < 2) return -1;
  let best = -1;
  series.forEach((s, i) => {
    const v = s.metrics[key];
    if (v == null || !Number.isFinite(v)) return;
    const b = best < 0 ? null : series[best].metrics[key];
    if (b == null || (BETTER[key] === "max" ? v > b : v < b)) best = i;
  });
  return best;
}

export function MetricsTable({ data, ppyLabel }: { data: CompareResult; ppyLabel: string }) {
  const best = Object.fromEntries((Object.keys(BETTER) as Key[]).map((k) => [k, bestIndex(data.series, k)])) as Record<Key, number>;
  return (
    <div className="table-scroll">
      <table className="metrics-table">
        <thead>
          <tr>
            <th scope="col">Портфель</th>
            <th scope="col">Доходность<br />в год</th>
            <th scope="col">Волатильность<br />в год</th>
            <th scope="col">Коэф.<br />Шарпа</th>
            <th scope="col">Макс.<br />просадка</th>
            <th scope="col">Самое долгое<br />восстановление</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((s, i) => (
            <tr key={i}>
              <td><span className="pf-cell"><i style={{ background: PORTFOLIO_COLORS[i % 5] }} />{s.name}</span></td>
              <td className={cn(s.metrics.expected_return < 0 && "is-neg", best.expected_return === i && "best")}>
                {pct(s.metrics.expected_return)}
                <small>CAGR {pct(s.metrics.cagr)}</small>
              </td>
              <td className={cn(best.volatility === i && "best")}>{pct(s.metrics.volatility)}</td>
              <td className={cn(best.sharpe === i && "best")}>{num(s.metrics.sharpe)}</td>
              <td className={cn("is-neg", best.max_drawdown === i && "best")}>{pct(s.metrics.max_drawdown)}</td>
              <td className={cn(best.max_recovery_periods === i && "best")}>
                {s.metrics.max_recovery_periods} {ppyLabel}
                <small>{s.metrics.recovered ? `≈ ${num(s.metrics.max_recovery_years, 1)} г.` : "не восстановился к концу данных"}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.series.length > 1 && <p className="panel-foot">Жирным выделено лучшее значение в каждом столбце.</p>}
    </div>
  );
}
