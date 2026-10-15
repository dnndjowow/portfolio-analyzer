import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ChartNoAxesCombined, ChevronDown, FileDown, Info, Layers3, Lightbulb, Moon, Plus, Sun, X } from "lucide-react";
import { api, type DiagnosticContext, type DiagnosticStage, type Common } from "@/api/client";
import type { CompareResult, FrontierResult, Portfolio, Settings, UploadResult } from "@/types";
import { MODE_LABEL } from "@/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataSource, PreviewTable } from "@/components/DataSource";
import { OptimizePanel, parsePct, SettingsPanel, type OptimizeParams } from "@/components/ControlPanel";
import { PortfolioList } from "@/components/PortfolioList";
import { loadPortfolios, savePortfolios } from "@/lib/storage";
import { cn, num, pct, PORTFOLIO_COLORS, uid } from "@/lib/utils";
import { IndexPlanner } from "@/components/IndexPlanner";
import { Welcome } from "@/components/Welcome";
import { MARKET_EXAMPLE } from "@/lib/market";

const FrontierChart = lazy(() => import("@/components/FrontierChart").then((module) => ({ default: module.FrontierChart })));
const WeightsPie = lazy(() => import("@/components/WeightsPie").then((module) => ({ default: module.WeightsPie })));
const ReturnsCurve = lazy(() => import("@/components/CompareView").then((module) => ({ default: module.ReturnsCurve })));
const MetricsTable = lazy(() => import("@/components/CompareView").then((module) => ({ default: module.MetricsTable })));

const DEFAULT_SETTINGS: Settings = {
  units: "percent", frequency: "monthly", resample_to: null, missing: "ffill", risk_free_nominal: true,
  inflation: { source: "constant", annual_rate: 0.08, series: null },
};
const PERIOD_SHORT: Record<string, string> = { daily: "дн.", weekly: "нед.", monthly: "мес.", quarterly: "кв.", yearly: "г." };
const PERIOD_AXIS: Record<string, string> = { daily: "Дни", weekly: "Недели", monthly: "Месяцы", quarterly: "Кварталы", yearly: "Годы" };
const PERIOD_NAME: Record<string, string> = { daily: "день", weekly: "неделя", monthly: "месяц", quarterly: "квартал", yearly: "год" };

function useTheme() {
  const [dark, setDarkState] = useState(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme) return savedTheme === "dark";
    } catch {
      // Настройка недоступна — смотрим на системную тему.
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const setDark = useCallback((value: boolean) => {
    setDarkState(value);
    try {
      localStorage.setItem("theme", value ? "dark" : "light");
    } catch {
      // Тема применяется и без доступа к localStorage.
    }
  }, []);

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
  const [view, setView] = useState<"indices" | "start" | "workspace">("indices");
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string>();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [inflationText, setInflationText] = useState("8");
  const [params, setParams] = useState<OptimizeParams>({
    mode: "max_sharpe", rf: "5", targetReturn: "", targetVol: "", rfNominal: true,
  });
  const [frontier, setFrontier] = useState<FrontierResult | null>(null);
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [marketBusy, setMarketBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [supportAnalysis, setSupportAnalysis] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const supportBusy = useRef(false);
  const lastSupportFailure = useRef("");

  useEffect(() => { loadPortfolios().then(setPortfolios); }, []);
  useEffect(() => { savePortfolios(portfolios); }, [portfolios]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
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
    returns: upload.dataset, settings: effectiveSettings, risk_free: parsePct(params.rf) ?? 0,
  }, [upload, effectiveSettings, params.rf]);
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
      frequency: result.frequency ?? currentSettings.frequency,
      resample_to: null,
      inflation: { ...currentSettings.inflation, source: "constant", series: null },
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
      setError("Укажите целевую доходность в процентах — например, 6.");
      return;
    }

    if (params.mode === "efficient_return" && targetVolatility == null) {
      setError("Укажите допустимую волатильность в процентах — например, 15.");
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
        parameterDescription = `ставка ${params.rf}%`;
      } else if (params.mode === "efficient_risk") {
        parameterDescription = `доходность ${params.targetReturn}%`;
      } else if (params.mode === "efficient_return") {
        parameterDescription = `риск ${params.targetVol}%`;
      }

      const portfolioNumber = portfolios.filter((portfolio) => portfolio.mode === params.mode).length + 1;

      addPortfolio({
        name: `${MODE_LABEL[params.mode]} ${portfolioNumber}`,
        mode: params.mode,
        params: parameterDescription,
        weights: result.weights,
        assets: result.assets,
      });
      setNotes((currentNotes) => mergeNotes(currentNotes, result.warnings));
      if (compact) {
        requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: motionBehavior() }));
      }
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
    download(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }), "portfolio_weights.csv");
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

  const showStart = () => {
    setView("start");
    requestAnimationFrame(scrollToTop);
  };
  const openWorkspace = () => {
    if (upload) { setView("workspace"); scrollToTop(); }
  };
  const runMarketExample = async () => {
    if (marketBusy) return;
    setMarketBusy(true);
    setError(null);
    try {
      const sample = await api.loadTickers(MARKET_EXAMPLE);
      onLoaded(sample, "Пример: акции Мосбиржи");
      const n = sample.dataset.columns.length;
      addPortfolio({ name: "Равные веса", mode: "equal", params: `по ${pct(1 / n, 1)}`, weights: sample.dataset.columns.map(() => 1 / n), assets: sample.dataset.columns });
    } catch (e) {
      reportFailure("tickers", (e as Error).message, MARKET_EXAMPLE);
    } finally {
      setMarketBusy(false);
    }
  };
  const addEqual = () => addPortfolio({
    name: "Равные веса", mode: "equal", params: `по ${pct(1 / columns.length, 1)}`,
    weights: columns.map(() => 1 / columns.length), assets: columns,
  });

  const feedback = (error || notes.length > 0) && (
    <div className="notices">
      {error && (
        <div role="alert" className="notice notice-error">
          <CircleAlert size={18} aria-hidden />
          <div>{error}</div>
          <button type="button" className="notice-close" aria-label="Скрыть ошибку" onClick={() => setError(null)}><X size={16} aria-hidden /></button>
        </div>
      )}
      {error && (supportLoading || supportAnalysis) && (
        <div className="notice notice-help" aria-live="polite">
          <Lightbulb size={18} aria-hidden />
          <div>
            <h3>Возможная причина</h3>
            <p>{supportLoading ? "Разбираемся, что пошло не так…" : supportAnalysis}</p>
          </div>
        </div>
      )}
      {notes.map((note) => (
        <div key={note} className="notice">
          <Info size={18} aria-hidden />
          <div>{note}</div>
          <button type="button" className="notice-close" aria-label="Скрыть уведомление" onClick={() => setNotes((list) => list.filter((item) => item !== note))}><X size={16} aria-hidden /></button>
        </div>
      ))}
    </div>
  );

  // показатели активного портфеля для сводки сверху
  const activeIndex = active ? shown.findIndex((p) => p.id === active.id) : -1;
  const candidateSeries = compare && active && activeIndex >= 0 ? compare.series[activeIndex] : undefined;
  const activeSeries = candidateSeries && candidateSeries.name === active?.name ? candidateSeries : null;
  const activeColor = activeIndex >= 0 ? PORTFOLIO_COLORS[activeIndex % PORTFOLIO_COLORS.length] : undefined;
  const inflationLabel = settings.inflation.source === "constant" ? `${inflationText || "0"}%` : "свой ряд";
  const showWorkspace = view === "workspace" && upload !== null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand" aria-label="Portfolio Analyzer — на стартовую страницу" onClick={() => setView("indices")}>
            <BrandMark />
            <span>Portfolio Analyzer <small>индексный портфель</small></span>
          </button>
          {showWorkspace && upload && (
            <div className="topbar-data">
              <span className="data-chip" title={fileName}>
                <span className="dot" aria-hidden />
                <strong>{fileName}</strong>
                <span className="data-chip-stat num">{upload.n_obs} периодов, {columns.length} активов</span>
              </span>
            </div>
          )}
          <div className="topbar-actions">
            <Button size="sm" variant={view === "indices" ? "subtle" : "ghost"} onClick={() => setView("indices")}>Индексы</Button>
            <Button size="sm" variant={view !== "indices" ? "subtle" : "ghost"} onClick={showStart}>Другие данные</Button>
            {upload && (showWorkspace
              ? <Button variant="outline" size="sm" onClick={showStart}><Plus size={15} aria-hidden /><span className="hidden sm:inline">Другие данные</span></Button>
              : <Button size="sm" onClick={openWorkspace}>К анализу</Button>)}
            <Button variant="ghost" size="icon" aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"} title={dark ? "Светлая тема" : "Тёмная тема"} onClick={() => setDark(!dark)}>
              {dark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </Button>
          </div>
        </div>
      </header>

      {view === "indices" ? <IndexPlanner dark={dark} /> : !showWorkspace || !upload ? (
        <main>
          <Welcome
            dataSource={<DataSource onLoaded={onLoaded} onFailure={reportFailure} fileName={fileName} />}
            feedback={feedback} onMarketExample={runMarketExample} marketBusy={marketBusy}
            onBack={upload ? openWorkspace : undefined} />
        </main>
      ) : (
        <main className="workspace">
          <aside className="sidebar" aria-label="Настройки анализа">
            <section className="side-block" aria-labelledby="goal-title">
              <h2 id="goal-title" className="side-title">Цель портфеля</h2>
              <OptimizePanel p={params} onChange={setParams} onRun={runOptimize} busy={busy} disabled={!upload}
                range={range} rfReal={frontier?.risk_free_real} />
            </section>

            <section className="side-block" aria-labelledby="list-title">
              <h2 id="list-title" className="side-title">Мои портфели {visible.length > 0 && <span className="count num">{visible.length}</span>}</h2>
              {visible.length > 0 && <p className="field-hint -mt-2 mb-3">Галочка — показать на графиках и в сравнении (до 5).</p>}
              <PortfolioList items={visible} activeId={activeId} compareIds={compareIds}
                onOpen={setActiveId}
                onToggleCompare={(id) => setCompareIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 5))}
                onDelete={(id) => { setPortfolios((list) => list.filter((p) => p.id !== id)); setCompareIds((ids) => ids.filter((x) => x !== id)); if (activeId === id) setActiveId(null); }}
                onRename={(id, name) => setPortfolios((list) => list.map((p) => p.id === id ? { ...p, name } : p))} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="subtle" size="sm" onClick={addEqual}><Plus size={15} aria-hidden />Равные веса</Button>
                {visible.length > 0 && <>
                  <Button variant="outline" size="sm" onClick={exportXlsx}><FileDown size={15} aria-hidden />Excel</Button>
                  <Button variant="outline" size="sm" onClick={exportCsv}><FileDown size={15} aria-hidden />CSV</Button>
                </>}
              </div>
            </section>

            <details className="side-details">
              <summary>
                <span>Настройки данных<small>Шаг: {PERIOD_NAME[freq]}, инфляция {inflationLabel}</small></span>
                <ChevronDown aria-hidden />
              </summary>
              <div className="side-details-body">
                <SettingsPanel settings={settings} onChange={setSettings} hasDates={upload.dataset.has_dates}
                  inflationText={inflationText} setInflationText={setInflationText} onInflationSeries={onInflationSeries} />
              </div>
            </details>
          </aside>

          <div className="main" id="results">
            {activeSeries && active ? (
              <section className="overview" aria-labelledby="overview-title">
                <h1 id="overview-title"><span className="swatch" style={{ background: activeColor }} aria-hidden /><span>{active.name}</span></h1>
                <p>{MODE_LABEL[active.mode]}{active.params && `, ${active.params}`}. Все значения — реальные, за вычетом инфляции.</p>
              </section>
            ) : (
              <section className="overview" aria-labelledby="overview-title">
                <h1 id="overview-title"><span>{visible.length ? "Выберите портфель" : "Данные готовы к анализу"}</span></h1>
                <p>{visible.length
                  ? "Нажмите на портфель в списке слева, чтобы увидеть его показатели и состав."
                  : "Выберите цель слева и нажмите «Построить портфель». Граница ниже уже посчитана по вашим данным."}</p>
              </section>
            )}

            {activeSeries ? (
              <dl className="stats" aria-label="Показатели портфеля">
                <div className="stat"><dt>Доходность в год</dt><dd className={cn(activeSeries.metrics.expected_return < 0 && "is-neg")}>{pct(activeSeries.metrics.expected_return, 1)}<small>CAGR {pct(activeSeries.metrics.cagr, 1)}</small></dd></div>
                <div className="stat"><dt>Волатильность</dt><dd>{pct(activeSeries.metrics.volatility, 1)}<small>стандартное отклонение</small></dd></div>
                <div className="stat"><dt>Коэффициент Шарпа</dt><dd>{num(activeSeries.metrics.sharpe)}<small>доходность на единицу риска</small></dd></div>
                <div className="stat"><dt>Макс. просадка</dt><dd className="is-neg">{pct(activeSeries.metrics.max_drawdown, 1)}
                  <small>{activeSeries.metrics.recovered ? `восстановление ≈ ${num(activeSeries.metrics.max_recovery_years, 1)} г.` : "не восстановился к концу данных"}</small></dd></div>
              </dl>
            ) : (
              <dl className="stats" aria-label="Сводка данных">
                <div className="stat"><dt>Периодов</dt><dd className="num">{upload.n_obs}<small>шаг: {PERIOD_NAME[settings.frequency]}</small></dd></div>
                <div className="stat"><dt>Активов</dt><dd className="num">{columns.length}<small>в наборе данных</small></dd></div>
                <div className="stat"><dt>Инфляция</dt><dd className="num">{settings.inflation.source === "constant" ? `${inflationText || "0"}%` : "Свой ряд"}<small>{settings.inflation.source === "constant" ? "годовых" : "за каждый период"}</small></dd></div>
                <div className="stat"><dt>Безрисковая ставка</dt><dd className="num">{params.rf || "0"}%<small>{frontier ? `реальная ${pct(frontier.risk_free_real, 1)}` : "годовых"}</small></dd></div>
              </dl>
            )}

            {feedback}

            <Suspense fallback={<div className="empty" role="status"><span className="spinner" aria-hidden /><p>Загружаем графики…</p></div>}>
              <Card aria-labelledby="frontier-title">
                <CardHeader title={<span id="frontier-title">Эффективная граница</span>}
                  sub="Все возможные сочетания активов: чем левее, тем спокойнее, чем выше, тем доходнее."
                  aside={frontier && <p className="panel-sub num">Мин. риск {pct(frontier.min_vol.vol, 1)}{frontier.max_sharpe && `, макс. Шарп ${num(frontier.max_sharpe.sharpe)}`}</p>} />
                <CardContent>
                  {frontier ? <FrontierChart data={frontier} dark={dark} portfolios={(compare?.series ?? []).map((series) => ({ ...series.point, name: series.name }))} />
                    : <div className="empty" role="status">{error
                      ? <><ChartNoAxesCombined aria-hidden /><strong>График не построен</strong><p>Проверьте сообщение выше и настройки данных, затем попробуйте снова.</p><Button variant="outline" size="sm" onClick={() => setSettings((s) => ({ ...s }))}>Пересчитать</Button></>
                      : <><span className="spinner" aria-hidden /><p>Строим границу и 5 000 случайных портфелей…</p></>}</div>}
                </CardContent>
              </Card>

              <div className="panel-grid">
                <Card>
                  <CardHeader title="Состав портфеля" sub={active ? <>Веса активов в портфеле «{active.name}». Нажмите на актив, чтобы выделить его.</> : "Доли каждого актива в выбранном портфеле."} />
                  <CardContent>
                    {active ? <WeightsPie assets={active.assets} weights={active.weights} title={active.name} dark={dark} />
                      : <div className="empty"><Layers3 aria-hidden /><strong>Портфель не выбран</strong><p>Постройте портфель или выберите его в списке — здесь появятся веса активов.</p></div>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader title="Динамика капитала" sub="Как менялась бы стоимость портфелей на истории." />
                  <CardContent>
                    {compare ? <ReturnsCurve data={compare} periodLabel={PERIOD_AXIS[freq]} dark={dark} />
                      : <div className="empty"><ChartNoAxesCombined aria-hidden /><strong>Пока нечего показать</strong><p>Как только появится портфель, здесь будет его кривая капитала и просадки.</p></div>}
                  </CardContent>
                </Card>
              </div>

              {compare && (
                <Card>
                  <CardHeader title="Сравнение портфелей" sub={compare.series.length > 1 ? "Ключевые показатели рядом." : "Отметьте ещё портфели галочкой в списке слева, чтобы сравнить их."} />
                  <CardContent><MetricsTable data={compare} ppyLabel={PERIOD_SHORT[freq]} /></CardContent>
                </Card>
              )}

              <details className="data-details">
                <summary><span>Исходные данные<small>первые 20 строк</small></span><ChevronDown aria-hidden /></summary>
                <PreviewTable result={upload} />
              </details>
            </Suspense>
          </div>
        </main>
      )}

      <footer className="footer">
        <div className="footer-inner">
          <span>Portfolio Analyzer</span>
          <span>Расчёты основаны на исторических данных и не являются инвестиционной рекомендацией.</span>
        </div>
      </footer>
    </div>
  );
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M3.5 16.5C5 10 9 6.2 16.5 4.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="7.6" cy="9.4" r="2.4" fill="#f2c14e" />
      </svg>
    </span>
  );
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
