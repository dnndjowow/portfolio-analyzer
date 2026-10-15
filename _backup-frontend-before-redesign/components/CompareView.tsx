import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CompareResult } from "@/types";
import { Segmented } from "@/components/ui/segmented";
import { cn, num, pct, PORTFOLIO_COLORS } from "@/lib/utils";

export function ReturnsCurve({ data, periodLabel }: { data: CompareResult; periodLabel: string }) {
  const [view, setView] = useState<"curve" | "dd">("curve");
  const rows = data.index.map((label, t) => {
    const r: Record<string, number | string> = { label };
    data.series.forEach((s, i) => { r[`s${i}`] = view === "curve" ? s.curve[t] : s.drawdown[t]; });
    return r;
  });
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Segmented label="Вид графика" value={view} onChange={setView}
          options={[{ value: "curve", label: "Капитал" }, { value: "dd", label: "Просадка" }]} />
      </div>
      <div className="h-[340px]">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 22, left: 4 }}>
            <CartesianGrid strokeDasharray="2 4" />
            <XAxis dataKey="label" minTickGap={24}
              label={{ value: periodLabel, position: "insideBottom", offset: -12, fill: "currentColor", fontSize: 12 }} />
            <YAxis width={60} domain={["auto", "auto"]}
              tickFormatter={(v) => (view === "curve" ? num(v, 0) : pct(v, 0))} />
            <Tooltip formatter={(v: number, name) => [view === "curve" ? num(v, 2) : pct(v, 1), name]} />
            <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: 13 }} />
            <ReferenceLine y={view === "curve" ? 100 : 0} stroke="currentColor" strokeOpacity={0.35} />
            {data.series.map((s, i) => (
              <Line key={i} dataKey={`s${i}`} name={s.name} stroke={PORTFOLIO_COLORS[i % 5]}
                strokeWidth={i === 0 ? 2.5 : 1.75} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[12px] text-muted">Mₜ = Mₜ₋₁·(1 + rₜ), старт 100; доходности реальные.</p>
    </div>
  );
}

export function MetricsTable({ data, ppyLabel }: { data: CompareResult; ppyLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm num">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-muted">
            <th className="py-2 pr-3 font-medium">Портфель</th>
            <th className="px-3 py-2 text-right font-medium">Ожидаемый доход, год</th>
            <th className="px-3 py-2 text-right font-medium">Волатильность, год</th>
            <th className="px-3 py-2 text-right font-medium">Шарп</th>
            <th className="px-3 py-2 text-right font-medium">Макс. просадка</th>
            <th className="py-2 pl-3 text-right font-medium">Макс. восстановление</th>
          </tr>
        </thead>
        <tbody>
          {data.series.map((s, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0">
              <td className="py-2 pr-3">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: PORTFOLIO_COLORS[i % 5] }} />
                {s.name}
              </td>
              <td className={cn("px-3 py-2 text-right", s.metrics.expected_return < 0 && "text-neg")}>
                {pct(s.metrics.expected_return)}
                <span className="block text-[12px] text-muted">CAGR {pct(s.metrics.cagr)}</span>
              </td>
              <td className="px-3 py-2 text-right">{pct(s.metrics.volatility)}</td>
              <td className="px-3 py-2 text-right">{num(s.metrics.sharpe)}</td>
              <td className="px-3 py-2 text-right text-neg">{pct(s.metrics.max_drawdown)}</td>
              <td className="py-2 pl-3 text-right">
                {s.metrics.max_recovery_periods} {ppyLabel}
                <span className="block text-[12px] text-muted">
                  {s.metrics.recovered ? `≈ ${num(s.metrics.max_recovery_years, 1)} г.` : "не восстановился к концу выборки"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
