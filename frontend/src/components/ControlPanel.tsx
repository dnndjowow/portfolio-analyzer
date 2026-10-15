import { Info } from "lucide-react";
import type { Frequency, Mode, Settings } from "@/types";
import { MODE_LABEL } from "@/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { pct } from "@/lib/utils";

const FREQ: { value: Frequency; label: string }[] = [
  { value: "daily", label: "день" }, { value: "weekly", label: "неделя" }, { value: "monthly", label: "месяц" },
  { value: "quarterly", label: "квартал" }, { value: "yearly", label: "год" },
];
const ORDER: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];

/** Поле для ввода процентов: хранит строку, наружу отдаёт долю. */
function PercentField({ id, label, value, onChange, hint, placeholder }:
  { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string; placeholder?: string }) {
  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      <div className="control-wrap">
        <Input id={id} inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <span className="control-suffix" aria-hidden>%</span>
      </div>
      {hint && <p className="field-hint">{hint}</p>}
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
    <div>
      <div className="field-row">
        <div>
          <Label htmlFor="units">Значения в файле</Label>
          <Select id="units" value={settings.units} onChange={(e) => set({ units: e.target.value as Settings["units"] })}>
            <option value="percent">в процентах</option><option value="fraction">в долях</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="frequency">Шаг данных</Label>
          <Select id="frequency" value={settings.frequency}
            onChange={(e) => set({ frequency: e.target.value as Frequency, resample_to: null })}>
            {FREQ.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
      </div>
      <div className="field-row">
        <div>
          <Label htmlFor="resample">Считать по</Label>
          <Select id="resample" disabled={!hasDates} value={settings.resample_to ?? settings.frequency}
            onChange={(e) => set({ resample_to: e.target.value === settings.frequency ? null : (e.target.value as Frequency) })}>
            {FREQ.filter((f) => ORDER.indexOf(f.value) >= ORDER.indexOf(settings.frequency))
              .map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="missing">Пропуски</Label>
          <Select id="missing" value={settings.missing} onChange={(e) => set({ missing: e.target.value as Settings["missing"] })}>
            <option value="ffill">заполнить</option><option value="drop">удалить строки</option>
          </Select>
        </div>
      </div>
      {!hasDates && <p className="field-hint">В столбце A нет дат, поэтому шаг влияет только на пересчёт в годовые значения.</p>}

      <div className="subtle-box mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold">Инфляция</span>
          <Segmented label="Источник инфляции" value={settings.inflation.source}
            onChange={(source) => set({ inflation: { ...settings.inflation, source } })}
            options={[{ value: "constant", label: "Ставка" }, { value: "series", label: "Свой ряд" }]} />
        </div>
        {settings.inflation.source === "constant" ? (
          <PercentField id="infl" label="Годовая инфляция" value={inflationText} onChange={setInflationText} />
        ) : (
          <div className="field">
            <Label htmlFor="infl-series">CSV с инфляцией за каждый период</Label>
            <Input id="infl-series" type="file" accept=".csv,.txt" className="control-file"
              onChange={(e) => e.target.files?.[0] && onInflationSeries(e.target.files[0])} />
            <p className="field-hint">
              {settings.inflation.series ? `Загружено значений: ${settings.inflation.series.length}.` : "Значения в тех же единицах, что и доходности."}
            </p>
          </div>
        )}
        <p className="field-hint">Все доходности пересчитываются в реальные: (1 + r) / (1 + π) − 1.</p>
      </div>
    </div>
  );
}

export interface OptimizeParams { mode: Mode; rf: string; targetReturn: string; targetVol: string; rfNominal: boolean }

const MODES: { mode: Mode; hint: string }[] = [
  { mode: "max_sharpe", hint: "Лучшая доходность на единицу риска" },
  { mode: "min_vol", hint: "Самый спокойный портфель из возможных" },
  { mode: "efficient_risk", hint: "Минимум риска при заданной доходности" },
  { mode: "efficient_return", hint: "Максимум доходности при заданном риске" },
];

export function OptimizePanel({ p, onChange, onRun, busy, disabled, range, rfReal }: {
  p: OptimizeParams; onChange: (p: OptimizeParams) => void; onRun: () => void; busy: boolean; disabled: boolean;
  range?: { retLo: number; retHi: number; volLo: number; volHi: number }; rfReal?: number;
}) {
  const set = (patch: Partial<OptimizeParams>) => onChange({ ...p, ...patch });
  return (
    <div>
      <div role="radiogroup" aria-label="Цель оптимизации" className="mode-list">
        {MODES.map(({ mode, hint }) => (
          <button key={mode} role="radio" aria-checked={p.mode === mode} type="button" onClick={() => set({ mode })}
            tabIndex={p.mode === mode ? 0 : -1}
            onKeyDown={(event) => {
              const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
              if (!direction && !["Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const current = MODES.findIndex((item) => item.mode === p.mode);
              const next = event.key === "Home" ? 0 : event.key === "End" ? MODES.length - 1 : (current + direction + MODES.length) % MODES.length;
              set({ mode: MODES[next].mode });
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}
            className="mode-option">
            <span className="radio" aria-hidden />
            <strong>{MODE_LABEL[mode]}</strong>
            <span>{hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        {p.mode === "efficient_risk" && (
          <PercentField id="tr" label="Целевая реальная доходность, % годовых" value={p.targetReturn} placeholder="например, 6"
            onChange={(targetReturn) => set({ targetReturn })}
            hint={range ? `Достижимо: от ${pct(range.retLo)} до ${pct(range.retHi)}` : undefined} />
        )}
        {p.mode === "efficient_return" && (
          <PercentField id="tv" label="Допустимая волатильность, % годовых" value={p.targetVol} placeholder="например, 15"
            onChange={(targetVol) => set({ targetVol })}
            hint={range ? `Имеет смысл: от ${pct(range.volLo)} до ${pct(range.volHi)}` : undefined} />
        )}
        <PercentField id="rf" label="Безрисковая ставка, % годовых" value={p.rf} onChange={(rf) => set({ rf })}
          hint={rfReal != null ? `В расчёте используется реальная ставка: ${pct(rfReal)}` : "Например, доходность ОФЗ или ключевая ставка."} />
        <div className="mt-3">
          <Switch id="rf-nominal" label="Ставка номинальная — вычесть инфляцию" checked={p.rfNominal} onChange={(rfNominal) => set({ rfNominal })} />
        </div>
      </div>

      <Button size="lg" className="mt-5 w-full" onClick={onRun} disabled={busy || disabled}>
        {busy ? "Считаем…" : "Построить портфель"}
      </Button>
      <p className="inline-note mt-3"><Info size={14} aria-hidden />Без коротких продаж: вес каждого актива от 0 до 100%, в сумме 100%.</p>
    </div>
  );
}
