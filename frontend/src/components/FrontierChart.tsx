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
    const [from, to] = dark ? ["#2A3842", "#6FA8D6"] : ["#C9D2CE", "#1D5C8C"];
    return data.cloud.map((c) => ({ ...c, fill: mix(from, to, hi > lo ? (c.sharpe - lo) / (hi - lo) : 0.5) }));
  }, [data.cloud, dark]);

  const special: Marked[] = [
    { ...data.min_vol, name: "Мин. волатильность" },
    ...(data.max_sharpe ? [{ ...data.max_sharpe, name: "Макс. Шарп" }] : []),
  ];

  return (
    <div className="h-[440px] w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 84, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="2 4" />
          <XAxis type="number" dataKey="vol" name="Волатильность" tickFormatter={(v) => pct(v, 1)} domain={["auto", "auto"]}
            label={{ value: "Волатильность, годовых", position: "insideBottom", offset: -18, fill: "currentColor", fontSize: 12 }} />
          <YAxis type="number" dataKey="ret" name="Доходность" tickFormatter={(v) => pct(v, 1)} domain={["auto", "auto"]} width={64}
            label={{ value: "Реальная доходность", angle: -90, position: "insideLeft", offset: 4, fill: "currentColor", fontSize: 12, dy: 60 }} />
          <ZAxis range={[14, 14]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<Tip />} />
          <Legend verticalAlign="top" height={32} iconSize={10} wrapperStyle={{ fontSize: 13 }} />
          <Scatter name="Случайные портфели" data={cloud} isAnimationActive={false} shape="circle" legendType="circle" fill="#9FB3C2">
            {cloud.map((c, i) => <Cell key={i} fill={c.fill} fillOpacity={0.55} />)}
          </Scatter>
          <Scatter name="Эффективная граница" data={data.frontier} line={{ stroke: dark ? "#E4EAEE" : "#15202A", strokeWidth: 2 }}
            shape={() => <g />} isAnimationActive={false} legendType="line" fill={dark ? "#E4EAEE" : "#15202A"} />
          <Scatter name="Индикаторы" data={data.assets} isAnimationActive={false} legendType="diamond" fill="#8C9AA5"
            shape={(p: { cx?: number; cy?: number; payload?: Marked }) => (
              <g>
                <path d={`M${p.cx} ${p.cy! - 5}l5 5-5 5-5-5z`} fill="#8C9AA5" />
                <text x={p.cx! + 7} y={p.cy! + 4} fontSize={11} fill="#8C9AA5">{p.payload?.name}</text>
              </g>
            )} />
          <Scatter name="Оптимумы" data={special} isAnimationActive={false} legendType="star" fill="#C4862B"
            shape={(p: { cx?: number; cy?: number }) => (
              <circle cx={p.cx} cy={p.cy} r={7} fill="#C4862B" stroke={dark ? "#10171D" : "#fff"} strokeWidth={2} />
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
