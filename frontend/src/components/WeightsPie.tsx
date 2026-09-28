import { useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSET_COLORS, cn, pct } from "@/lib/utils";

interface Slice { name: string; weight: number; abs: number; color: string; idx: number }

export function WeightsPie({ assets, weights, title }: { assets: string[]; weights: number[]; title: string }) {
  const [isolated, setIsolated] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const slices: Slice[] = assets
    .map((name, i) => ({ name, weight: weights[i], abs: Math.abs(weights[i]), color: ASSET_COLORS[i], idx: i }))
    .filter((s) => s.abs > 1e-4);
  const focus = isolated ?? hover;
  const focused = slices.find((s) => s.idx === focus);
  const toggle = (i: number) => setIsolated((cur) => (cur === i ? null : i));

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
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
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
    <div className="grid gap-4 sm:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)]">
      <div ref={wrap} className="relative h-[260px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="abs" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={1}
              isAnimationActive={false} stroke="none"
              activeIndex={focused ? slices.indexOf(focused) : undefined}
              activeShape={(p: any) => <Sector {...p} outerRadius={p.outerRadius + 6} />}
              onMouseEnter={(_, i) => setHover(slices[i].idx)} onMouseLeave={() => setHover(null)}
              onClick={(_, i) => toggle(slices[i].idx)} style={{ cursor: "pointer" }}>
              {slices.map((s) => (
                <Cell key={s.idx} fill={s.color} fillOpacity={isolated == null || isolated === s.idx ? 1 : 0.15} />
              ))}
            </Pie>
            <Tooltip formatter={(_, __, item: any) => [pct(item.payload.weight, 1), item.payload.name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {focused ? (
            <>
              <span className="max-w-[120px] truncate text-[13px] text-muted">{focused.name}</span>
              <span className="text-2xl font-semibold num">{pct(focused.weight, 1)}</span>
            </>
          ) : (
            <span className="text-[13px] text-muted">{slices.length} из {assets.length}<br />в портфеле</span>
          )}
        </div>
      </div>

      <div className="flex flex-col">
        <ul className="space-y-0.5">
          {assets.map((name, i) => {
            const w = weights[i];
            const off = Math.abs(w) <= 1e-4;
            return (
              <li key={name}>
                <button type="button" disabled={off} onClick={() => toggle(i)}
                  className={cn("flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left text-[13px]",
                    isolated === i ? "bg-bg font-medium" : "hover:bg-bg", off && "opacity-40")}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ASSET_COLORS[i] }} />
                  <span className="flex-1 truncate">{name}</span>
                  <span className={cn("num", w < 0 && "text-neg")}>{pct(w, 1)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          <Button variant="outline" size="sm" onClick={exportPng}><Download className="h-4 w-4" aria-hidden />PNG</Button>
          {isolated != null && <Button variant="ghost" size="sm" onClick={() => setIsolated(null)}>Показать все</Button>}
        </div>
      </div>
    </div>
  );
}
