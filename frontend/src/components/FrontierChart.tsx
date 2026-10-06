import { useMemo } from "react";
import {
  CartesianGrid, Cell, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import type { FrontierResult, Point } from "@/types";
import { pct, num, PORTFOLIO_COLORS } from "@/lib/utils";

type Marked = Point & { name: string };

/** Смешивает два hex-цвета. */
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};

export function FrontierChart({ data, portfolios, dark }: { data: FrontierResult; portfolios: Marked[]; dark: boolean }) {
  const cloud = useMemo(() => {
    const s = data.cloud.map((c) => c.sharpe);
    const lo = Math.min(...s), hi = Math.max(...s);
    const [from, to] = dark ? ["#30343e", "#2997ff"] : ["#d9eafa", "#0071e3"];
    return data.cloud.map((c) => ({ ...c, fill: mix(from, to, hi > lo ? (c.sharpe - lo) / (hi - lo) : 0.5) }));
  }, [data.cloud, dark]);

  const special: Marked[] = [
    { ...data.min_vol, name: "Мин. волатильность" },
    ...(data.max_sharpe ? [{ ...data.max_sharpe, name: "Макс. Шарп" }] : []),
  ];

  return (
    <div className="h-[370px] w-full sm:h-[440px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 14, bottom: 26, left: 0 }}>
          <CartesianGrid strokeDasharray="3 6" />
          <XAxis type="number" dataKey="vol" name="Волатильность" tickFormatter={(v) => pct(v, 1)} domain={["auto", "auto"]}
            label={{ value: "Волатильность, годовых", position: "insideBottom", offset: -18, fill: "currentColor", fontSize: 12 }} />
          <YAxis type="number" dataKey="ret" name="Доходность" tickFormatter={(v) => pct(v, 1)} domain={["auto", "auto"]} width={54}
            label={{ value: "Реальная доходность", angle: -90, position: "insideLeft", offset: 4, fill: "currentColor", fontSize: 12, dy: 60 }} />
          <ZAxis range={[14, 14]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<Tip />} />
          <Legend verticalAlign="top" height={76} iconSize={8} wrapperStyle={{ fontSize: 10, lineHeight: "20px" }} />
          <Scatter name="Случайные портфели" data={cloud} isAnimationActive={false} shape="circle" legendType="circle" fill="#9FB3C2">
            {cloud.map((c, i) => <Cell key={i} fill={c.fill} fillOpacity={0.45} />)}
          </Scatter>
          <Scatter name="Эффективная граница" data={data.frontier} line={{ stroke: dark ? "#f5f5f7" : "#1d1d1f", strokeWidth: 2.5 }}
            shape={() => <g />} isAnimationActive={false} legendType="line" fill={dark ? "#f5f5f7" : "#1d1d1f"} />
          <Scatter name="Индикаторы" data={data.assets} isAnimationActive={false} legendType="diamond" fill="#8C9AA5"
            shape={(p: { cx?: number; cy?: number; payload?: Marked }) => (
              <g>
                <path d={`M${p.cx} ${p.cy! - 5}l5 5-5 5-5-5z`} fill="#8C9AA5" />
                <text className="frontier-asset-label" x={p.cx! + 7} y={p.cy! + 4} fontSize={10} fill="#8e8e93">{p.payload?.name}</text>
              </g>
            )} />
          <Scatter name="Оптимумы" data={special} isAnimationActive={false} legendType="star" fill="#30a46c"
            shape={(p: { cx?: number; cy?: number }) => (
              <circle cx={p.cx} cy={p.cy} r={7} fill="#30a46c" stroke={dark ? "#1c1c1e" : "#fff"} strokeWidth={2} />
            )} />
          {portfolios.map((pt, i) => (
            <Scatter key={pt.name + i} name={pt.name} data={[pt]} isAnimationActive={false} fill={PORTFOLIO_COLORS[i % 5]}
              shape={(p: { cx?: number; cy?: number }) => (
                <rect x={p.cx! - 6} y={p.cy! - 6} width={12} height={12} rx={2} fill={PORTFOLIO_COLORS[i % 5]}
                  stroke={dark ? "#10171D" : "#fff"} strokeWidth={2} />
              )} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point & { name?: string; sharpe?: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] shadow-sm num">
      {p.name && <p className="font-medium">{p.name}</p>}
      <p>Доходность: {pct(p.ret)}</p>
      <p>Волатильность: {pct(p.vol)}</p>
      {p.sharpe != null && <p>Шарп: {num(p.sharpe)}</p>}
    </div>
  );
}
