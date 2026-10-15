import { useMemo } from "react";
import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { FrontierResult, Point } from "@/types";
import { chartTheme, num, pct, PORTFOLIO_COLORS } from "@/lib/utils";

type Marked = Point & { name: string };
type ShapeProps = { cx?: number; cy?: number; payload?: Marked };

/** Смешивает два hex-цвета. */
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};

export function FrontierChart({ data, portfolios, dark }: { data: FrontierResult; portfolios: Marked[]; dark: boolean }) {
  const theme = chartTheme(dark);
  const frontierColor = dark ? "#57bfa0" : "#1e5a4c";
  const markColor = dark ? "#f5c55b" : "#f2c14e";

  const cloud = useMemo(() => {
    const s = data.cloud.map((c) => c.sharpe).filter(Number.isFinite);
    const lo = s.length ? Math.min(...s) : 0, hi = s.length ? Math.max(...s) : 0;
    return data.cloud.map((c) => ({
      ...c, fill: mix(theme.cloudFrom, theme.cloudTo, hi > lo && Number.isFinite(c.sharpe) ? (c.sharpe - lo) / (hi - lo) : 0.5),
    }));
  }, [data.cloud, theme.cloudFrom, theme.cloudTo]);

  const special: Marked[] = [
    { ...data.min_vol, name: "Мин. риск" },
    ...(data.max_sharpe ? [{ ...data.max_sharpe, name: "Макс. Шарп" }] : []),
  ];

  return (
    <div className="w-full">
      <ul className="legend mb-3" aria-label="Обозначения">
        <li><span className="lg-dot" style={{ background: theme.cloudTo, opacity: 0.6 }} />Возможные портфели</li>
        <li><span className="lg-line" style={{ background: frontierColor }} />Эффективная граница</li>
        <li><span className="lg-diamond" style={{ background: theme.asset }} />Отдельные активы</li>
        <li><span className="lg-ring" style={{ background: markColor }} />Оптимумы</li>
        {portfolios.map((pt, i) => (
          <li key={pt.name + i} className="is-portfolio"><span className="lg-square" style={{ background: PORTFOLIO_COLORS[i % 5] }} />{pt.name}</li>
        ))}
      </ul>
      <div className="h-[360px] sm:h-[460px]">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 18, bottom: 28, left: 8 }}>
            <CartesianGrid strokeDasharray="2 6" />
            <XAxis type="number" dataKey="vol" name="Волатильность" tickFormatter={(v) => pct(v, 0)} domain={["auto", "auto"]}
              tickLine={false} stroke={theme.grid}
              label={{ value: "Риск — волатильность, % годовых", position: "insideBottom", offset: -18, fill: theme.muted, fontSize: 12.5 }} />
            <YAxis type="number" dataKey="ret" name="Доходность" tickFormatter={(v) => pct(v, 0)} domain={["auto", "auto"]} width={52}
              tickLine={false} stroke={theme.grid}
              label={{ value: "Реальная доходность, % годовых", angle: -90, position: "insideLeft", offset: 6, fill: theme.muted, fontSize: 12.5, dy: 90 }} />
            <ZAxis range={[16, 16]} />
            <Tooltip cursor={{ strokeDasharray: "3 3", stroke: theme.muted }} content={<Tip />} isAnimationActive={false} />
            <Scatter name="Возможные портфели" data={cloud} isAnimationActive={false} shape="circle">
              {cloud.map((c, i) => <Cell key={i} fill={c.fill} fillOpacity={0.55} />)}
            </Scatter>
            <Scatter name="Эффективная граница" data={data.frontier} lineType="joint" lineJointType="linear"
              line={{ stroke: frontierColor, strokeWidth: 3, strokeLinecap: "round" }}
              shape={(p: ShapeProps) => <circle cx={p.cx} cy={p.cy} r={2.5} fill={frontierColor} />}
              isAnimationActive={false} fill={frontierColor} />
            <Scatter name="Активы" data={data.assets} isAnimationActive={false} fill={theme.asset}
              shape={(p: ShapeProps) => (
                <g>
                  <path d={`M${p.cx} ${p.cy! - 5.5}l5.5 5.5-5.5 5.5-5.5-5.5z`} fill={theme.asset} stroke={theme.surface} strokeWidth={1.5} />
                  <text className="frontier-asset-label" x={p.cx! + 9} y={p.cy! + 4} fontSize={11.5} fill={theme.muted}>{p.payload?.name}</text>
                </g>
              )} />
            <Scatter name="Оптимумы" data={special} isAnimationActive={false} fill={markColor}
              shape={(p: ShapeProps) => (
                <g>
                  <circle cx={p.cx} cy={p.cy} r={8} fill={markColor} stroke={theme.ink} strokeWidth={2.5} />
                  <text x={p.cx! - 12} y={p.cy! - 13} fontSize={12} fontWeight={600} fill={theme.ink} textAnchor="end"
                    stroke={theme.surface} strokeWidth={4} paintOrder="stroke">{p.payload?.name}</text>
                </g>
              )} />
            {portfolios.map((pt, i) => (
              <Scatter key={pt.name + i} name={pt.name} data={[pt]} isAnimationActive={false} fill={PORTFOLIO_COLORS[i % 5]}
                shape={(p: ShapeProps) => (
                  <rect x={p.cx! - 7} y={p.cy! - 7} width={14} height={14} rx={3.5} fill={PORTFOLIO_COLORS[i % 5]}
                    stroke={theme.surface} strokeWidth={2.5} />
                )} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="panel-foot">Каждая точка облака — случайный набор весов. Граница — лучшие портфели: выше по ней не подняться без роста риска.</p>
    </div>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Point & { name?: string; sharpe?: number } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      {p.name && <p className="tip-title">{p.name}</p>}
      <p><span>Доходность</span> {pct(p.ret)}</p>
      <p><span>Риск</span> {pct(p.vol)}</p>
      {p.sharpe != null && <p><span>Шарп</span> {num(p.sharpe)}</p>}
    </div>
  );
}
