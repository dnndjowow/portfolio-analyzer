import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Moon, Sun } from "lucide-react";
import { api, type AssistantContext, type AssistantStage, type Common } from "@/api/client";
import type { CompareResult, FrontierResult, Portfolio, Settings, UploadResult } from "@/types";
import { MODE_LABEL } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataSource, PreviewTable } from "@/components/DataSource";
import { OptimizePanel, parsePct, SettingsPanel, type OptimizeParams } from "@/components/ControlPanel";
import { FrontierChart } from "@/components/FrontierChart";
import { WeightsPie } from "@/components/WeightsPie";
import { MetricsTable, ReturnsCurve } from "@/components/CompareView";
import { PortfolioList } from "@/components/PortfolioList";
import { loadPortfolios, savePortfolios } from "@/lib/storage";
import { pct, uid } from "@/lib/utils";

const DEFAULT_SETTINGS: Settings = {
  units: "percent", frequency: "monthly", resample_to: null, missing: "ffill", risk_free_nominal: true,
  inflation: { source: "constant", annual_rate: 0.08, series: null },
};
const PERIOD_SHORT: Record<string, string> = { daily: "дн.", weekly: "нед.", monthly: "мес.", quarterly: "кв.", yearly: "г." };
const PERIOD_AXIS: Record<string, string> = { daily: "День", weekly: "Неделя", monthly: "Месяц", quarterly: "Квартал", yearly: "Год" };

function useTheme() {
  const [dark, setDark] = useState(() => {
    try { const s = localStorage.getItem("theme"); if (s) return s === "dark"; } catch { /* нет доступа */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* нет доступа */ }
  }, [dark]);
  return [dark, setDark] as const;
}

function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function Dashboard() {
  const [dark, setDark] = useTheme();
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [inflationText, setInflationText] = useState("8");
  const [params, setParams] = useState<OptimizeParams>({
    mode: "max_sharpe", rf: "5", targetReturn: "", targetVol: "", allowShort: false, rfNominal: true,
  });
  const [frontier, setFrontier] = useState<FrontierResult | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [assistantAnalysis, setAssistantAnalysis] = useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const assistantBusy = useRef(false);
  const lastAssistantFailure = useRef("");

  useEffect(() => { loadPortfolios().then(setPortfolios); }, []);
  useEffect(() => { savePortfolios(portfolios); }, [portfolios]);

  // итоговые настройки: инфляция из текстового поля, флаг номинальной r_f
  const effSettings = useMemo<Settings>(() => ({
    ...settings, risk_free_nominal: params.rfNominal,
    inflation: { ...settings.inflation, annual_rate: parsePct(inflationText) ?? 0 },
  }), [settings, inflationText, params.rfNominal]);

  const common = useMemo<Common | null>(() => upload && {
    returns: upload.dataset, settings: effSettings, risk_free: parsePct(params.rf) ?? 0, allow_short: params.allowShort,
  }, [upload, effSettings, params.rf, params.allowShort]);
  const debCommon = useDebounced(common);

  const columns = upload?.dataset.columns ?? [];
  const visible = useMemo(
    () => portfolios.filter((p) => p.assets.join("|") === columns.join("|")),
    [portfolios, columns],
  );
  const shown = useMemo(() => {
    const ids = compareIds.filter((id) => visible.some((p) => p.id === id));
    return (ids.length ? ids : activeId ? [activeId] : []).map((id) => visible.find((p) => p.id === id)!).filter(Boolean);
  }, [compareIds, activeId, visible]);
  const active = visible.find((p) => p.id === activeId) ?? null;

  const reportFailure = useCallback((stage: AssistantStage, message: string, context: AssistantContext = {}) => {
    setError(message);
    setAssistantAnalysis(null);
    const key = [stage, message].join(":");
    if (assistantBusy.current || lastAssistantFailure.current === key) return;
    assistantBusy.current = true;
    lastAssistantFailure.current = key;
    setAssistantLoading(true);
    api.diagnose({ stage, error: message, context })
      .then((result) => setAssistantAnalysis(result.analysis))
      .catch((e) => setAssistantAnalysis("Не удалось получить разбор: " + (e as Error).message))
      .finally(() => { assistantBusy.current = false; setAssistantLoading(false); });
  }, []);

  // эффективная граница
  useEffect(() => {
    if (!debCommon) return;
    let cancel = false;
    api.frontier(debCommon)
      .then((r) => { if (!cancel) { setFrontier(r); setError(null); setNotes((n) => mergeNotes(n, r.warnings)); } })
      .catch((e) => !cancel && (setFrontier(null), reportFailure("frontier", e.message, { ...(debCommon ?? {}) })));
    return () => { cancel = true; };
  }, [debCommon, reportFailure]);

  // кривые и метрики показанных портфелей
  const shownKey = shown.map((p) => p.id + p.name).join(",");
  useEffect(() => {
    if (!debCommon || !shown.length) { setCompare(null); return; }
    let cancel = false;
    api.compare({ ...debCommon, portfolios: shown.map(({ name, weights }) => ({ name, weights })) })
      .then((r) => !cancel && setCompare(r))
      .catch((e) => !cancel && reportFailure("compare", e.message, {
        ...(debCommon ?? {}),
        portfolios: shown.map(({ name, weights }) => ({ name, weights })),
      }));
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debCommon, shownKey, reportFailure]);

  const addPortfolio = useCallback((p: Omit<Portfolio, "id" | "createdAt">) => {
    const full = { ...p, id: uid(), createdAt: Date.now() };
    setPortfolios((list) => [full, ...list]);
    setActiveId(full.id);
    setCompareIds((ids) => (ids.length < 5 ? [...ids, full.id] : ids));
  }, []);

  const onLoaded = (r: UploadResult, label: string) => {
    setUpload(r); setFileName(label); setError(null); setAssistantAnalysis(null); lastAssistantFailure.current = ""; setFrontier(null); setCompare(null);
    setNotes(r.warnings);
    setSettings((s) => ({ ...s, units: r.suggested_units }));
    setActiveId(null); setCompareIds([]);
  };

  const runOptimize = async () => {
    if (!common) return;
    const tr = parsePct(params.targetReturn), tv = parsePct(params.targetVol);
    if (params.mode === "efficient_risk" && tr == null) return setError("Введите целевую доходность в процентах.");
    if (params.mode === "efficient_return" && tv == null) return setError("Введите целевую волатильность в процентах.");
    setBusy(true); setError(null);
    try {
      const r = await api.optimize({ ...common, mode: params.mode, target_return: tr ?? undefined, target_vol: tv ?? undefined });
      const detail = params.mode === "max_sharpe" ? `r_f ${params.rf}%`
        : params.mode === "efficient_risk" ? `доходность ${params.targetReturn}%`
        : params.mode === "efficient_return" ? `волатильность ${params.targetVol}%` : "";
      const n = portfolios.filter((p) => p.mode === params.mode).length + 1;
      addPortfolio({ name: `${MODE_LABEL[params.mode]} ${n}`, mode: params.mode, params: [detail, params.allowShort ? "шорты" : ""].filter(Boolean).join(", "),
        weights: r.weights, assets: r.assets });
      setNotes((x) => mergeNotes(x, r.warnings));
    } catch (e) {
      reportFailure("optimize", (e as Error).message, {
        ...common, mode: params.mode, target_return: tr ?? undefined, target_vol: tv ?? undefined,
      });
    } finally { setBusy(false); }
  };

  const exportXlsx = async () => {
    if (!common || !visible.length) return;
    try {
      const blob = await api.exportXlsx({ ...common, portfolios: visible.map(({ name, weights }) => ({ name, weights })) });
      download(blob, "portfolio_export.xlsx");
    } catch (e) {
      reportFailure("export", (e as Error).message, {
        ...common, portfolios: visible.map(({ name, weights }) => ({ name, weights })),
      });
    }
  };
  const exportCsv = () => {
    const lines = [["Портфель", ...columns].join(";"),
      ...visible.map((p) => [p.name, ...p.weights.map((w) => w.toFixed(6).replace(".", ","))].join(";"))];
    download(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv" }), "portfolio_weights.csv");
  };

  const onInflationSeries = async (f: File) => {
    const vals = (await f.text()).split(/\r?\n/).map((l) => l.split(/[;,\t]/).pop()!.trim().replace(",", "."))
      .map(Number).filter(Number.isFinite);
    setSettings((s) => ({ ...s, inflation: { ...s.inflation, series: vals } }));
  };

  const range = frontier && frontier.frontier.length ? {
    retLo: frontier.frontier[0].ret, retHi: frontier.frontier.at(-1)!.ret,
    volLo: frontier.frontier[0].vol, volHi: frontier.frontier.at(-1)!.vol,
  } : undefined;
  const freq = effSettings.resample_to ?? effSettings.frequency;

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[340px_1fr]">
      <aside className="border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-r">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
              <path d="M4 27 C10 23 14 12 28 6" stroke="rgb(var(--accent))" strokeWidth="3" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="13.5" r="3.2" fill="#C4862B" />
            </svg>
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">Портфель</h1>
          </div>
          <Button variant="ghost" size="icon" aria-label={dark ? "Светлая тема" : "Тёмная тема"} onClick={() => setDark(!dark)}>
            {dark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
          </Button>
        </div>

        <PanelSection title="Данные"><DataSource onLoaded={onLoaded} onFailure={reportFailure} fileName={fileName} /></PanelSection>
        {upload && (
          <>
            <PanelSection title="Предобработка">
              <SettingsPanel settings={settings} onChange={setSettings} hasDates={upload.dataset.has_dates}
                inflationText={inflationText} setInflationText={setInflationText} onInflationSeries={onInflationSeries} />
            </PanelSection>
            <PanelSection title="Оптимизация">
              <OptimizePanel p={params} onChange={setParams} onRun={runOptimize} busy={busy} disabled={!upload}
                range={range} rfReal={frontier?.risk_free_real} />
            </PanelSection>
            <PanelSection title="Портфели" action={
              <Button variant="ghost" size="sm" onClick={() => addPortfolio({
                name: "Равные веса", mode: "equal", params: "по 10%", weights: Array(10).fill(0.1), assets: columns })}>
                + равные веса
              </Button>}>
              <PortfolioList items={visible} activeId={activeId} compareIds={compareIds}
                onOpen={setActiveId}
                onToggleCompare={(id) => setCompareIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 5))}
                onDelete={(id) => { setPortfolios((l) => l.filter((p) => p.id !== id)); setCompareIds((ids) => ids.filter((x) => x !== id)); if (activeId === id) setActiveId(null); }}
                onRename={(id, name) => setPortfolios((l) => l.map((p) => (p.id === id ? { ...p, name } : p)))} />
              {visible.length > 0 && (
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={exportXlsx}><FileDown className="h-4 w-4" aria-hidden />Excel</Button>
                  <Button variant="outline" size="sm" onClick={exportCsv}><FileDown className="h-4 w-4" aria-hidden />CSV</Button>
                </div>
              )}
            </PanelSection>
          </>
        )}
      </aside>

      <main className="space-y-5 p-4 sm:p-6 lg:p-8">
        {!upload && (assistantLoading || assistantAnalysis) && (
          <div className="rounded-md border border-accent/30 bg-accent/[0.05] px-4 py-3 text-sm">
            <p className="mb-1 font-medium">Резервный мини-ассистент</p>
            {assistantLoading
              ? <p className="text-muted">Передаю контекст сбоя в OpenRouter для анализа…</p>
              : <p className="whitespace-pre-wrap">{assistantAnalysis}</p>}
          </div>
        )}
        {!upload ? <EmptyState /> : (
          <>
            <header>
              <p className="text-[13px] text-muted">{fileName}</p>
              <p className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">
                {upload.n_obs} наблюдений, 10 индикаторов, инфляция {settings.inflation.source === "constant" ? `${inflationText}% в год` : "по своему ряду"}
              </p>
            </header>

            {(error || notes.length > 0) && (
              <div className="space-y-2">
                {error && <p role="alert" className="rounded-md border border-neg/40 bg-neg/[0.07] px-4 py-2.5 text-sm">{error}</p>}
                {(assistantLoading || assistantAnalysis) && (
                  <div className="rounded-md border border-accent/30 bg-accent/[0.05] px-4 py-3 text-sm">
                    <p className="mb-1 font-medium">Резервный мини-ассистент</p>
                    {assistantLoading
                      ? <p className="text-muted">Передаю контекст сбоя и данные операции в OpenRouter для анализа…</p>
                      : <p className="whitespace-pre-wrap">{assistantAnalysis}</p>}
                  </div>
                )}
                {notes.map((n) => (
                  <p key={n} className="flex items-start justify-between gap-3 rounded-md border border-[#C4862B]/40 bg-[#C4862B]/[0.08] px-4 py-2.5 text-sm">
                    <span>{n}</span>
                    <button className="text-muted hover:text-ink" aria-label="Скрыть" onClick={() => setNotes((x) => x.filter((y) => y !== n))}>×</button>
                  </p>
                ))}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Эффективная граница</CardTitle>
                {frontier && (
                  <p className="text-[13px] text-muted num">
                    Мин. риск {pct(frontier.min_vol.vol)} при {pct(frontier.min_vol.ret)}
                    {frontier.max_sharpe && `, макс. Шарп ${frontier.max_sharpe.sharpe.toFixed(2).replace(".", ",")}`}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {frontier ? (
                  <FrontierChart data={frontier} dark={dark}
                    portfolios={(compare?.series ?? []).map((s) => ({ ...s.point, name: s.name }))} />
                ) : <div className="grid h-[440px] place-items-center text-sm text-muted">Строю границу и 5000 случайных портфелей…</div>}
              </CardContent>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <Card>
                <CardHeader><CardTitle>Веса</CardTitle>{active && <span className="text-[13px] text-muted">{active.name}</span>}</CardHeader>
                <CardContent>
                  {active ? <WeightsPie assets={active.assets} weights={active.weights} title={active.name} />
                    : <p className="py-16 text-center text-sm text-muted">Выберите режим слева и нажмите «Оптимизировать».</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Кривая доходности</CardTitle></CardHeader>
                <CardContent>
                  {compare ? <ReturnsCurve data={compare} periodLabel={PERIOD_AXIS[freq]} />
                    : <p className="py-16 text-center text-sm text-muted">Появится после первой оптимизации.</p>}
                </CardContent>
              </Card>
            </div>

            {compare && (
              <Card>
                <CardHeader>
                  <CardTitle>Показатели</CardTitle>
                  <span className="text-[13px] text-muted">до 5 портфелей; отметьте их в списке слева</span>
                </CardHeader>
                <CardContent><MetricsTable data={compare} ppyLabel={PERIOD_SHORT[freq]} /></CardContent>
              </Card>
            )}

            <details className="rounded-lg border border-line bg-surface">
              <summary className="cursor-pointer px-5 py-3 text-[15px] font-medium">Исходные данные, первые 20 строк</summary>
              <div className="px-5 pb-5"><PreviewTable result={upload} /></div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

function PanelSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4 first-of-type:border-t-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>{action}
      </div>
      {children}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
      <svg viewBox="0 0 400 180" className="mb-6 w-full max-w-md" aria-hidden>
        {Array.from({ length: 140 }).map((_, i) => {
          const x = 40 + ((i * 37) % 300) + ((i * 13) % 17);
          const y = 150 - ((i * 53) % 110) * (0.4 + ((x - 40) / 300) * 0.6);
          return <circle key={i} cx={x} cy={y} r={2.2} fill="rgb(var(--muted))" fillOpacity={0.25} />;
        })}
        <path d="M60 150 C90 70 170 40 360 28" stroke="rgb(var(--ink))" strokeWidth={2.5} fill="none" />
        <circle cx={148} cy={58} r={6} fill="#C4862B" />
      </svg>
      <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">Загрузите ряды доходностей, чтобы построить границу</h2>
      <p className="mt-3 max-w-prose text-muted">
        Excel или CSV: в строке заголовков 10 индикаторов, ниже — не меньше 30 наблюдений. Первый индикатор —
        рублёвая денежная масса. Доходности будут пересчитаны в реальные с учётом инфляции.
      </p>
    </div>
  );
}

const mergeNotes = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
