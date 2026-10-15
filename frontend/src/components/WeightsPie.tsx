import { useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSET_COLORS, chartTheme, cn, pct } from "@/lib/utils";

interface Slice { name: string; weight: number; abs: number; color: string; idx: number }

export function WeightsPie({ assets, weights, title, dark }: { assets: string[]; weights: number[]; title: string; dark: boolean }) {
  const [isolated, setIsolated] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const theme = chartTheme(dark);

  const colorOf = (i: number) => ASSET_COLORS[i % ASSET_COLORS.length];
  const slices: Slice[] = assets
    .map((name, i) => ({ name, weight: weights[i], abs: Math.abs(weights[i]), color: colorOf(i), idx: i }))
    .filter((s) => s.abs > 1e-4);
  const focus = isolated ?? hover;
  const focused = slices.find((s) => s.idx === focus);
  const toggle = (i: number) => setIsolated((cur) => (cur === i ? null : i));
  // шкала полос: от самого крупного веса, но не мельче 30%, чтобы равные веса не выглядели «полными»
  const scaleMax = Math.max(...weights.map(Math.abs), 0.3);

  // Список: сначала активы с весом (по убыванию), затем нулевые.
  const order = assets.map((_, i) => i).sort((a, b) => Math.abs(weights[b]) - Math.abs(weights[a]));

  const exportPng = () => {
    const svg = wrap.current?.querySelector("svg");
    if (!svg) return;
    const { width, height } = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const c = document.createElement("canvas");
      c.width = width * scale; c.height = height * scale;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = theme.surface;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, width, height);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `${title.replace(/\s+/g, "_")}_веса.png`;
      a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  };

  return (
    <div className="weights">
      <div>
        <div ref={wrap} className="donut">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={slices} dataKey="abs" nameKey="name" innerRadius="70%" outerRadius="94%" paddingAngle={slices.length > 1 ? 1.5 : 0}
                isAnimationActive={false} stroke={theme.surface} strokeWidth={2} cornerRadius={3}
                activeIndex={focused ? slices.indexOf(focused) : undefined}
                activeShape={(p: any) => <Sector {...p} outerRadius={p.outerRadius + 5} />}
                onMouseEnter={(_, i) => setHover(slices[i].idx)} onMouseLeave={() => setHover(null)}
                onClick={(_, i) => toggle(slices[i].idx)} style={{ cursor: "pointer" }}>
                {slices.map((s) => (
                  <Cell key={s.idx} fill={s.color} fillOpacity={isolated == null || isolated === s.idx ? 1 : 0.18} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="donut-center">
            {focused ? (
              <>
                <span>{focused.name}</span>
                <strong className="num">{pct(focused.weight, 1)}</strong>
              </>
            ) : (
              <>
                <strong className="num">{slices.length}</strong>
                <span>из {assets.length} активов</span>
              </>
            )}
          </div>
        </div>
        <div className="weights-actions justify-center">
          <Button variant="outline" size="sm" onClick={exportPng}><Download size={15} aria-hidden />Сохранить PNG</Button>
          {isolated != null && <Button variant="ghost" size="sm" onClick={() => setIsolated(null)}>Показать все</Button>}
        </div>
      </div>

      <ul className="weight-list" aria-label="Веса активов">
        {order.map((i) => {
          const w = weights[i];
          const off = Math.abs(w) <= 1e-4;
          return (
            <li key={assets[i]}>
              <button type="button" disabled={off} onClick={() => toggle(i)} aria-pressed={isolated === i}
                onMouseEnter={() => !off && setHover(i)} onMouseLeave={() => setHover(null)}
                className={cn("weight-row", isolated === i && "is-isolated")}>
                <span className="sw" style={{ background: off ? theme.grid : colorOf(i) }} />
                <span className="nm">{assets[i]}</span>
                <span className={cn("val", w < 0 && "is-neg")}>{pct(w, 1)}</span>
                <span className="bar" aria-hidden><i style={{ width: `${Math.min(100, (Math.abs(w) / scaleMax) * 100)}%`, background: colorOf(i) }} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
