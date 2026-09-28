import type { Frequency, Mode, Settings } from "@/types";
import { MODE_LABEL } from "@/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, pct } from "@/lib/utils";

const FREQ: { value: Frequency; label: string }[] = [
  { value: "daily", label: "день" }, { value: "weekly", label: "неделя" }, { value: "monthly", label: "месяц" },
  { value: "quarterly", label: "квартал" }, { value: "yearly", label: "год" },
];
const ORDER: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];

/** Поле для ввода процентов: хранит строку, наружу отдаёт долю. */
function PercentField({ id, label, value, onChange, hint }:
  { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="pr-8" />
        <span className="pointer-events-none absolute right-3 top-2 text-sm text-muted">%</span>
      </div>
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

export const parsePct = (s: string) => {
  const v = Number(s.replace(",", ".").trim());
  return Number.isFinite(v) && s.trim() !== "" ? v / 100 : null;
};

export function SettingsPanel({ settings, onChange, hasDates, inflationText, setInflationText, onInflationSeries }: {
  settings: Settings; onChange: (s: Settings) => void; hasDates: boolean;
  inflationText: string; setInflationText: (v: string) => void; onInflationSeries: (f: File) => void;
}) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="units">Единицы в файле</Label>
          <Select id="units" value={settings.units} onChange={(e) => set({ units: e.target.value as Settings["units"] })}>
            <option value="percent">проценты</option><option value="fraction">доли</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="frequency">Одно наблюдение</Label>
          <Select id="frequency" value={settings.frequency}
            onChange={(e) => set({ frequency: e.target.value as Frequency, resample_to: null })}>
            {FREQ.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="resample">Таймфрейм расчёта</Label>
          <Select id="resample" disabled={!hasDates} value={settings.resample_to ?? settings.frequency}
            onChange={(e) => set({ resample_to: e.target.value === settings.frequency ? null : (e.target.value as Frequency) })}>
            {FREQ.filter((f) => ORDER.indexOf(f.value) >= ORDER.indexOf(settings.frequency))
              .map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="missing">Пропуски</Label>
          <Select id="missing" value={settings.missing} onChange={(e) => set({ missing: e.target.value as Settings["missing"] })}>
            <option value="ffill">заполнить вперёд</option><option value="drop">удалить строки</option>
          </Select>
        </div>
      </div>
      {!hasDates && <p className="text-[12px] text-muted">Без дат в столбце A таймфрейм задаёт только годовую нормировку.</p>}

      <div className="rounded-md bg-bg/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Инфляция</span>
          <Select aria-label="Источник инфляции" className="h-8 w-auto text-[13px]" value={settings.inflation.source}
            onChange={(e) => set({ inflation: { ...settings.inflation, source: e.target.value as "constant" | "series" } })}>
            <option value="constant">постоянная</option><option value="series">свой ряд</option>
          </Select>
        </div>
        {settings.inflation.source === "constant" ? (
          <PercentField id="infl" label="Годовая, по Росстату или своя" value={inflationText} onChange={setInflationText} />
        ) : (
          <div>
            <Label htmlFor="infl-series">CSV: инфляция за каждый период, в единицах файла</Label>
            <Input id="infl-series" type="file" accept=".csv,.txt" className="py-1.5 text-[13px]"
              onChange={(e) => e.target.files?.[0] && onInflationSeries(e.target.files[0])} />
            <p className="mt-1 text-[12px] text-muted">
              {settings.inflation.series ? `Загружено ${settings.inflation.series.length} значений.` : "Ряд не загружен."}
            </p>
          </div>
        )}
        <p className="mt-2 text-[12px] text-muted">Все доходности пересчитываются в реальные: (1+r)/(1+π)−1.</p>
      </div>
    </div>
  );
}

export interface OptimizeParams { mode: Mode; rf: string; targetReturn: string; targetVol: string; allowShort: boolean; rfNominal: boolean }

const MODES: { mode: Mode; hint: string }[] = [
  { mode: "min_vol", hint: "Наименьший риск без ограничений на доходность" },
  { mode: "max_sharpe", hint: "Лучшее отношение премии к риску" },
  { mode: "efficient_risk", hint: "Минимум риска при заданной доходности" },
  { mode: "efficient_return", hint: "Максимум доходности при заданной волатильности" },
];

export function OptimizePanel({ p, onChange, onRun, busy, disabled, range, rfReal }: {
  p: OptimizeParams; onChange: (p: OptimizeParams) => void; onRun: () => void; busy: boolean; disabled: boolean;
  range?: { retLo: number; retHi: number; volLo: number; volHi: number }; rfReal?: number;
}) {
  const set = (patch: Partial<OptimizeParams>) => onChange({ ...p, ...patch });
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Режим оптимизации" className="space-y-1">
        {MODES.map(({ mode, hint }) => (
          <button key={mode} role="radio" aria-checked={p.mode === mode} type="button" onClick={() => set({ mode })}
            className={cn("w-full rounded-md border px-3 py-2 text-left transition-colors",
              p.mode === mode ? "border-accent bg-accent/[0.06]" : "border-transparent hover:bg-bg")}>
            <span className="block text-sm font-medium">{MODE_LABEL[mode]}</span>
            <span className="block text-[12px] text-muted">{hint}</span>
          </button>
        ))}
      </div>

      <PercentField id="rf" label="Безрисковая ставка r_f, годовых" value={p.rf} onChange={(rf) => set({ rf })}
        hint={rfReal != null ? `В расчёте — реальная: ${pct(rfReal)}` : undefined} />
      <Switch id="rf-nominal" label="r_f номинальная (пересчитать в реальную)" checked={p.rfNominal} onChange={(rfNominal) => set({ rfNominal })} />

      {p.mode === "efficient_risk" && (
        <PercentField id="tr" label="Целевая реальная доходность, годовых" value={p.targetReturn}
          onChange={(targetReturn) => set({ targetReturn })}
          hint={range ? `Достижимо: от ${pct(range.retLo)} до ${pct(range.retHi)}` : undefined} />
      )}
      {p.mode === "efficient_return" && (
        <PercentField id="tv" label="Целевая волатильность, годовых" value={p.targetVol}
          onChange={(targetVol) => set({ targetVol })}
          hint={range ? `Имеет смысл: от ${pct(range.volLo)} до ${pct(range.volHi)}` : undefined} />
      )}
      <Switch id="short" label="Разрешить шорты (|wᵢ| ≤ 100%)" checked={p.allowShort} onChange={(allowShort) => set({ allowShort })} />

      <Button size="lg" className="w-full" onClick={onRun} disabled={busy || disabled}>
        {busy ? "Считаю…" : "Оптимизировать"}
      </Button>
    </div>
  );
}
