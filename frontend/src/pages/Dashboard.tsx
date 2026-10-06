import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChartNoAxesCombined, Check, ChevronDown, FileDown, Layers3, Moon, Plus, Info, Sun, X } from "lucide-react";
import { api, type DiagnosticContext, type DiagnosticStage, type Common } from "@/api/client";
import type { CompareResult, FrontierResult, Portfolio, Settings, UploadResult } from "@/types";
import { MODE_LABEL } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataSource, PreviewTable } from "@/components/DataSource";
import { OptimizePanel, parsePct, SettingsPanel, type OptimizeParams } from "@/components/ControlPanel";
import { PortfolioList } from "@/components/PortfolioList";
import { loadPortfolios, savePortfolios } from "@/lib/storage";
import { pct, uid } from "@/lib/utils";
import { Welcome } from "@/components/Welcome";
import { createDemoDataset } from "@/lib/demo";

const FrontierChart = lazy(() => import("@/components/FrontierChart").then((module) => ({ default: module.FrontierChart })));
const WeightsPie = lazy(() => import("@/components/WeightsPie").then((module) => ({ default: module.WeightsPie })));
const ReturnsCurve = lazy(() => import("@/components/CompareView").then((module) => ({ default: module.ReturnsCurve })));
const MetricsTable = lazy(() => import("@/components/CompareView").then((module) => ({ default: module.MetricsTable })));

const DEFAULT_SETTINGS: Settings = {
  units: "percent", frequency: "monthly", resample_to: null, missing: "ffill", risk_free_nominal: true,
  inflation: { source: "constant", annual_rate: 0.08, series: null },
};
const PERIOD_SHORT: Record<string, string> = { daily: "дн.", weekly: "нед.", monthly: "мес.", quarterly: "кв.", yearly: "г." };
const PERIOD_AXIS: Record<string, string> = { daily: "День", weekly: "Неделя", monthly: "Месяц", quarterly: "Квартал", yearly: "Год" };

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme) {
        return savedTheme === "dark";
      }
    } catch {
      // Настройка недоступна, используем светлую тему.
    }

    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);

    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Тема применяется и без доступа к localStorage.
    }
  }, [dark]);

  return [dark, setDark] as const;
}

function useDebounced<T>(value: T, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}

export default function Dashboard() {
  const [dark, setDark] = useTheme();
  const [view, setView] = useState<"overview" | "workspace">("overview");
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 800px)").matches);
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
  const [supportAnalysis, setSupportAnalysis] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const supportBusy = useRef(false);
  const lastSupportFailure = useRef("");

  useEffect(() => { loadPortfolios().then(setPortfolios); }, []);
  useEffect(() => { savePortfolios(portfolios); }, [portfolios]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // итоговые настройки: инфляция из текстового поля, флаг номинальной r_f
  const effectiveSettings = useMemo<Settings>(() => ({
    ...settings, risk_free_nominal: params.rfNominal,
    inflation: { ...settings.inflation, annual_rate: parsePct(inflationText) ?? 0 },
  }), [settings, inflationText, params.rfNominal]);

  const common = useMemo<Common | null>(() => upload && {
    returns: upload.dataset, settings: effectiveSettings, risk_free: parsePct(params.rf) ?? 0, allow_short: params.allowShort,
  }, [upload, effectiveSettings, params.rf, params.allowShort]);
  const debouncedParameters = useDebounced(common);

  const columns = upload?.dataset.columns ?? [];
  const visible = useMemo(
    () => portfolios.filter((p) => p.assets.join("|") === columns.join("|")),
    [portfolios, columns],
  );
  const shown = useMemo(() => {
    let selectedIds = compareIds.filter((id) => visible.some((portfolio) => portfolio.id === id));

    if (!selectedIds.length && activeId) {
      selectedIds = [activeId];
    }

    const selectedPortfolios: Portfolio[] = [];
    for (const portfolioId of selectedIds) {
      const selectedPortfolio = visible.find((portfolio) => portfolio.id === portfolioId);
      if (selectedPortfolio) {
        selectedPortfolios.push(selectedPortfolio);
      }
    }

    return selectedPortfolios;
  }, [compareIds, activeId, visible]);
  const active = visible.find((p) => p.id === activeId) ?? null;

  const reportFailure = useCallback((stage: DiagnosticStage, message: string, context: DiagnosticContext = {}) => {
    setError(message);
    setSupportAnalysis(null);
    const key = [stage, message].join(":");
    if (supportBusy.current || lastSupportFailure.current === key) return;
    supportBusy.current = true;
    lastSupportFailure.current = key;
    setSupportLoading(true);
    api.diagnose({ stage, error: message, context })
      .then((result) => setSupportAnalysis(result.analysis))
      .catch(() => setSupportAnalysis(null))
      .finally(() => {
        supportBusy.current = false;
        setSupportLoading(false);
      });
  }, []);

  // эффективная граница
  useEffect(() => {
    if (!debouncedParameters) return;
    let cancelled = false;

    api.frontier(debouncedParameters)
      .then((result) => {
        if (cancelled) return;
        setFrontier(result);
        setError(null);
        setNotes((currentNotes) => mergeNotes(currentNotes, result.warnings));
      })
      .catch((requestError) => {
        if (cancelled) return;
        setFrontier(null);
        reportFailure("frontier", requestError.message, { ...(debouncedParameters ?? {}) });
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedParameters, reportFailure]);

  // кривые и метрики показанных портфелей
  const shownKey = shown.map((portfolio) => portfolio.id + portfolio.name).join(",");
  useEffect(() => {
    if (!debouncedParameters || !shown.length) {
      setCompare(null);
      return;
    }

    let cancelled = false;
    const portfoliosToCompare = shown.map(({ name, weights }) => ({ name, weights }));

    api.compare({ ...debouncedParameters, portfolios: portfoliosToCompare })
      .then((result) => {
        if (!cancelled) {
          setCompare(result);
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          reportFailure("compare", requestError.message, {
            ...(debouncedParameters ?? {}),
            portfolios: portfoliosToCompare,
          });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedParameters, shownKey, reportFailure]);

  const addPortfolio = useCallback((p: Omit<Portfolio, "id" | "createdAt">) => {
    const full = { ...p, id: uid(), createdAt: Date.now() };
    setPortfolios((list) => [full, ...list]);
    setActiveId(full.id);
    setCompareIds((ids) => (ids.length < 5 ? [...ids, full.id] : ids));
  }, []);

  const onLoaded = (result: UploadResult, label: string) => {
    setUpload(result);
    setFileName(label);
    setError(null);
    setSupportAnalysis(null);
    lastSupportFailure.current = "";
    setFrontier(null);
    setCompare(null);
    setNotes(result.warnings);
    setSettings((currentSettings) => ({
      ...currentSettings,
      units: result.suggested_units,
    }));
    setActiveId(null);
    setCompareIds([]);
    setView("workspace");
    scrollToTop();
  };

  const runOptimize = async () => {
    if (!common) return;
    const targetReturn = parsePct(params.targetReturn);
    const targetVolatility = parsePct(params.targetVol);

    if (params.mode === "efficient_risk" && targetReturn == null) {
      setError("Введите целевую доходность в процентах.");
      return;
    }

    if (params.mode === "efficient_return" && targetVolatility == null) {
      setError("Введите целевую волатильность в процентах.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await api.optimize({
        ...common,
        mode: params.mode,
        target_return: targetReturn ?? undefined,
        target_vol: targetVolatility ?? undefined,
      });

      let parameterDescription = "";
      if (params.mode === "max_sharpe") {
        parameterDescription = `r_f ${params.rf}%`;
      } else if (params.mode === "efficient_risk") {
        parameterDescription = `доходность ${params.targetReturn}%`;
      } else if (params.mode === "efficient_return") {
        parameterDescription = `волатильность ${params.targetVol}%`;
      }

      const portfolioNumber = portfolios.filter((portfolio) => portfolio.mode === params.mode).length + 1;
      const portfolioParameters = [parameterDescription];
      if (params.allowShort) {
        portfolioParameters.push("шорты");
      }

      addPortfolio({
        name: `${MODE_LABEL[params.mode]} ${portfolioNumber}`,
        mode: params.mode,
        params: portfolioParameters.filter(Boolean).join(", "),
        weights: result.weights,
        assets: result.assets,
      });
      setNotes((currentNotes) => mergeNotes(currentNotes, result.warnings));

    } catch (requestError) {
      reportFailure("optimize", (requestError as Error).message, {
        ...common,
        mode: params.mode,
        target_return: targetReturn ?? undefined,
        target_vol: targetVolatility ?? undefined,
      });
    } finally {
      setBusy(false);
    }
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
  const freq = effectiveSettings.resample_to ?? effectiveSettings.frequency;

  const showOverview = (anchor?: string) => {
    setView("overview");
    requestAnimationFrame(() => {
      if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: motionBehavior() });
      else scrollToTop();
    });
  };
  const openWorkspace = () => {
    if (upload) { setView("workspace"); scrollToTop(); }
    else showOverview("start");
  };
  const runDemo = () => {
    const sample = createDemoDataset();
    onLoaded(sample, "Демонстрационный набор · 120 месяцев");
    addPortfolio({ name: "Равные веса", mode: "equal", params: "по 10%", weights: sample.dataset.columns.map(() => 0.1), assets: sample.dataset.columns });
  };
  const addEqual = () => addPortfolio({
    name: "Равные веса", mode: "equal", params: `по ${pct(1 / columns.length, 1)}`,
    weights: columns.map(() => 1 / columns.length), assets: columns,
  });
  const feedback = (error || notes.length > 0) && (
    <div className="notice-stack">
      {error && <div role="alert" className="notice notice-error"><span>{error}</span></div>}
      {error && (supportLoading || supportAnalysis) && (
        <div className="notice notice-support" aria-live="polite">
          <h2><Info size={16} className="text-accent" aria-hidden />Подсказка по ошибке</h2>
          <p>{supportLoading ? "Проверяем причину ошибки…" : supportAnalysis}</p>
        </div>
      )}
      {notes.map((note) => (
        <div key={note} className="notice"><span>{note}</span><button type="button" aria-label="Скрыть уведомление" className="shrink-0 text-muted hover:text-ink" onClick={() => setNotes((list) => list.filter((item) => item !== note))}><X size={15} aria-hidden /></button></div>
      ))}
    </div>
  );

  return (
    <div className="app-shell" id="top">
      <header className="app-nav">
        <div className="nav-inner">
          <button type="button" className="brand" aria-label="Portfolio — на главную" onClick={() => showOverview()}><Brand /></button>
          <nav className="nav-links" aria-label="Основная навигация">
            <button type="button" className={view === "overview" ? "active" : ""} onClick={() => showOverview()}>Обзор</button>
            <button type="button" className={view === "workspace" ? "active" : ""} onClick={openWorkspace}>Аналитика</button>
            <button type="button" onClick={() => showOverview("features")}>Возможности</button>
          </nav>
          <div className="nav-actions">
            <Button variant="ghost" size="icon" aria-label={dark ? "Светлая тема" : "Тёмная тема"} title={dark ? "Светлая тема" : "Тёмная тема"} onClick={() => setDark(!dark)}>{dark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}</Button>
            <Button size="sm" onClick={openWorkspace}>{upload ? "К анализу" : "Начать анализ"}<ArrowRight size={13} aria-hidden /></Button>
          </div>
        </div>
      </header>

      {view === "overview" || !upload ? (
        <main><Welcome dataSource={<DataSource onLoaded={onLoaded} onFailure={reportFailure} fileName={fileName} />} feedback={feedback} onDemo={runDemo} /></main>
      ) : (
        <main className="workspace" id="workspace">
          <div className="workspace-heading">
            <div><p className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p><h1>Ваш портфель. В деталях.</h1><p className="source-tag"><Check size={13} className="text-pos" aria-hidden /><span>{fileName}</span></p></div>
            <Button variant="outline" size="sm" onClick={() => showOverview("start")}>Загрузить другие данные <Plus size={14} aria-hidden /></Button>
          </div>
          <div className="workspace-grid">
            <aside className="workspace-sidebar" aria-label="Настройки анализа">
              <PanelSection title="Источник данных" open={false}>
                <DataSource onLoaded={onLoaded} onFailure={reportFailure} fileName={fileName} />
              </PanelSection>
              <PanelSection title="Параметры данных" open={false}>
                <SettingsPanel settings={settings} onChange={setSettings} hasDates={upload.dataset.has_dates}
                  inflationText={inflationText} setInflationText={setInflationText} onInflationSeries={onInflationSeries} />
              </PanelSection>
              <PanelSection title="Ваша стратегия" open={!compact}>
                <OptimizePanel p={params} onChange={setParams} onRun={runOptimize} busy={busy} disabled={!upload}
                  range={range} rfReal={frontier?.risk_free_real} />
              </PanelSection>
              <PanelSection title="Мои портфели" open={!compact}>
                <Button variant="outline" size="sm" className="mb-4 w-full" onClick={addEqual}><Plus size={14} aria-hidden />Добавить равные веса</Button>
                <PortfolioList items={visible} activeId={activeId} compareIds={compareIds}
                  onOpen={setActiveId}
                  onToggleCompare={(id) => setCompareIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 5))}
                  onDelete={(id) => { setPortfolios((list) => list.filter((p) => p.id !== id)); setCompareIds((ids) => ids.filter((x) => x !== id)); if (activeId === id) setActiveId(null); }}
                  onRename={(id, name) => setPortfolios((list) => list.map((p) => p.id === id ? { ...p, name } : p))} />
                {visible.length > 0 && <div className="mt-4 flex gap-2"><Button variant="outline" size="sm" onClick={exportXlsx}><FileDown size={14} aria-hidden />Excel</Button><Button variant="outline" size="sm" onClick={exportCsv}><FileDown size={14} aria-hidden />CSV</Button></div>}
              </PanelSection>
            </aside>
            <div className="workspace-results">
              <div className="summary-strip" aria-label="Сводка данных">
                <div className="summary-item"><p>Наблюдений</p><strong className="num">{upload.n_obs}</strong><small>в исходном наборе</small></div>
                <div className="summary-item"><p>Индикаторов</p><strong className="num">{columns.length}</strong><small>включая M2RU</small></div>
                <div className="summary-item"><p>Инфляция</p><strong className="num">{settings.inflation.source === "constant" ? `${inflationText}%` : "Свой ряд"}</strong><small>{settings.inflation.source === "constant" ? "годовых" : "за каждый период"}</small></div>
              </div>
              {feedback}
              <Suspense fallback={<div className="chart-placeholder" role="status"><span className="chart-loading" aria-hidden /><p>Открываем инструменты анализа…</p></div>}>
              <Card>
                <CardHeader><div><p className="mb-1 text-[10px] font-medium uppercase tracking-[.12em] text-muted">Риск и доходность</p><CardTitle>Эффективная граница</CardTitle></div>
                  {frontier && <p className="text-[11px] text-muted num">Мин. риск {pct(frontier.min_vol.vol)}{frontier.max_sharpe && ` · Шарп ${frontier.max_sharpe.sharpe.toFixed(2).replace(".", ",")}`}</p>}
                </CardHeader>
                <CardContent>
                  {frontier ? <FrontierChart data={frontier} dark={dark} portfolios={(compare?.series ?? []).map((series) => ({ ...series.point, name: series.name }))} />
                    : <div className="chart-placeholder" role="status">{error ? <><ChartNoAxesCombined size={28} aria-hidden /><p>График пока недоступен. Проверьте данные и параметры анализа.</p><Button variant="outline" size="sm" onClick={() => setSettings((s) => ({ ...s }))}>Повторить расчёт</Button></> : <><span className="chart-loading" aria-hidden /><p>Строим границу и 5 000 возможных портфелей…</p></>}</div>}
                </CardContent>
              </Card>
              <div className="grid min-w-0 gap-5 2xl:grid-cols-2">
                <Card><CardHeader><div><p className="mb-1 text-[10px] font-medium uppercase tracking-[.12em] text-muted">Состав портфеля</p><CardTitle>Каждый актив на своём месте</CardTitle></div>{active && <span className="text-[11px] text-muted">{active.name}</span>}</CardHeader>
                  <CardContent>{active ? <WeightsPie assets={active.assets} weights={active.weights} title={active.name} /> : <div className="empty-chart"><Layers3 aria-hidden /><p>Выберите стратегию и нажмите «Оптимизировать»,<br />чтобы увидеть распределение активов.</p></div>}</CardContent>
                </Card>
                <Card><CardHeader><div><p className="mb-1 text-[10px] font-medium uppercase tracking-[.12em] text-muted">Динамика капитала</p><CardTitle>История в одной кривой</CardTitle></div></CardHeader>
                  <CardContent>{compare ? <ReturnsCurve data={compare} periodLabel={PERIOD_AXIS[freq]} /> : <div className="empty-chart"><ChartNoAxesCombined aria-hidden /><p>Создайте портфель, чтобы увидеть<br />его доходность и просадку.</p></div>}</CardContent>
                </Card>
              </div>
              {compare && <Card><CardHeader><CardTitle>Сравнение в деталях</CardTitle><span className="text-[11px] text-muted">До 5 портфелей — выберите их в списке</span></CardHeader><CardContent><MetricsTable data={compare} ppyLabel={PERIOD_SHORT[freq]} /></CardContent></Card>}
              <details className="source-details"><summary>Исходные данные · первые 20 строк<ChevronDown aria-hidden /></summary><div className="px-5 pb-5"><PreviewTable result={upload} /></div></details>
              </Suspense>
            </div>
          </div>
        </main>
      )}
      <footer className="app-footer"><div className="footer-inner"><button type="button" className="brand" aria-label="Portfolio — на главную" onClick={() => showOverview()}><Brand /></button><p>Portfolio Analyzer. Данные, баланс и ваша стратегия.</p><a href="#top">Наверх ↑</a></div></footer>
    </div>
  );
}

function Brand() {
  return <><span className="brand-mark"><svg viewBox="0 0 28 28" fill="none" aria-hidden><path d="M5 23V16M14 23V9M23 23V4" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" /></svg></span><span>Portfolio<span className="text-accent">.</span></span></>;
}

function PanelSection({ title, open = true, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return <details className="panel-section" open={open}><summary>{title}<ChevronDown aria-hidden /></summary><div className="panel-section-body">{children}</div></details>;
}

function motionBehavior(): ScrollBehavior { return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"; }
function scrollToTop() { window.scrollTo({ top: 0, behavior: motionBehavior() }); }

function mergeNotes(currentNotes: string[], newNotes: string[]) {
  return Array.from(new Set([...currentNotes, ...newNotes]));
}
function download(blob: Blob, name: string) {
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = name;
  downloadLink.click();
  setTimeout(() => URL.revokeObjectURL(downloadLink.href), 1000);
}
