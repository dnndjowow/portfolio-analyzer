import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calculator, Check, CircleAlert, Download, Info, LoaderCircle, RotateCcw, X } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { ASSET_COLORS, chartTheme, cn, num, pct } from "@/lib/utils";
import type { IndexInfo, IndexPortfolioRequest, IndexPortfolioResult } from "@/types";

/* ───────── форматирование ───────── */
const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
const compact = (value: number) => new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const parse = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS_LONG = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthLabel = (iso: string) => `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const periodLabel = (iso: string, frequency: IndexPortfolioRequest["frequency"]) => {
  const m = Number(iso.slice(5, 7));
  if (frequency === "yearly") return iso.slice(0, 4);
  if (frequency === "quarterly") return `${Math.ceil(m / 3)} кв. ${iso.slice(0, 4)}`;
  return monthLabel(iso);
};
const monthEnd = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};
const previousMonth = () => {
  const date = new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 0)).toISOString().slice(0, 7);
};
const monthsBetween = (from: string, to: string) => {
  const [a, b] = [from, to].map((s) => s.split("-").map(Number));
  return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1;
};
const equalWeights = (keys: string[]) => {
  const share = Math.floor(10000 / keys.length) / 100;
  return Object.fromEntries(keys.map((key, i) => [key, (i === keys.length - 1 ? 100 - share * (keys.length - 1) : share).toFixed(2).replace(/\.?0+$/, "")]));
};

const DEFAULT = ["MCFTR", "RGBITR", "SP500"];
const REBALANCE: Record<IndexPortfolioRequest["rebalance"], string> = { none: "без ребалансировки", monthly: "ребалансировка каждый месяц", quarterly: "ребалансировка раз в квартал", yearly: "ребалансировка раз в год" };
const MODE_TEXT: Record<IndexPortfolioRequest["mode"], string> = { manual: "веса заданы вручную", min_vol: "веса на минимальный риск", max_sharpe: "веса на максимальный Шарп" };
const COLORS = { nominal: ASSET_COLORS[0], real: ASSET_COLORS[2], m2: ASSET_COLORS[1] };

export function IndexPlanner({ dark }: { dark: boolean }) {
  const [catalog, setCatalog] = useState<IndexInfo[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selected, setSelected] = useState(DEFAULT);
  const [weights, setWeights] = useState<Record<string, string>>(equalWeights(DEFAULT));
  const [capital, setCapital] = useState("100000");
  const [start, setStart] = useState("2015-01");
  const [end, setEnd] = useState(previousMonth);
  const [frequency, setFrequency] = useState<IndexPortfolioRequest["frequency"]>("monthly");
  const [rebalance, setRebalance] = useState<IndexPortfolioRequest["rebalance"]>("monthly");
  const [mode, setMode] = useState<IndexPortfolioRequest["mode"]>("manual");
  const [riskFree, setRiskFree] = useState("5");
  const [activated, setActivated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IndexPortfolioResult | null>(null);
  const [completedKey, setCompletedKey] = useState("");
  const [view, setView] = useState<"growth" | "capital" | "drawdown">("growth");
  const [showM2, setShowM2] = useState(true);
  const [hiddenWarnings, setHiddenWarnings] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);
  const theme = chartTheme(dark);

  useEffect(() => {
    let active = true;
    setCatalogError(null);
    api.indexCatalog().then((data) => { if (active) setCatalog(data.indices); })
      .catch((e) => { if (active) setCatalogError((e as Error).message); });
    return () => { active = false; };
  }, [retry]);

  const byId = useMemo(() => Object.fromEntries(catalog.map((item) => [item.id, item])), [catalog]);
  const colorOf = (id: string) => ASSET_COLORS[Math.max(0, catalog.findIndex((item) => item.id === id)) % ASSET_COLORS.length];

  const total = selected.reduce((sum, key) => sum + (parse(weights[key] ?? "0") || 0), 0);
  const invalid = selected.length < 2 ? "Выберите минимум два индекса."
    : !Number.isFinite(parse(capital)) || parse(capital) <= 0 || parse(capital) > 1e12 ? "Введите капитал больше нуля и не больше 1 трлн ₽."
    : !start || !end || start > end ? "Начало периода должно быть раньше конца."
    : !Number.isFinite(parse(riskFree)) || parse(riskFree) < -99 || parse(riskFree) > 100 ? "Проверьте безрисковую ставку."
    : mode === "manual" && selected.some((key) => !Number.isFinite(parse(weights[key])) || parse(weights[key]) < 0 || parse(weights[key]) > 100) ? "Каждый вес должен быть от 0 до 100%."
    : mode === "manual" && Math.abs(total - 100) > 0.0001 ? `Сумма весов должна быть 100%, сейчас ${num(total, 2)}%.` : null;
  const shortForAuto = mode !== "manual" && start && end && start <= end && monthsBetween(start, end) < 30;

  const request = useMemo<IndexPortfolioRequest>(() => ({
    indices: selected, capital: parse(capital), start: `${start}-01`, end: end ? monthEnd(end) : undefined,
    weights: mode === "manual" ? selected.map((key) => parse(weights[key]) / 100) : undefined,
    frequency, rebalance, mode, base_currency: "RUB", risk_free: parse(riskFree) / 100, include_m2: true,
  }), [selected, capital, start, end, weights, mode, frequency, rebalance, riskFree]);
  const requestKey = JSON.stringify(request);

  useEffect(() => {
    if (!activated || invalid || !catalog.length) { setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    const timer = setTimeout(() => {
      api.indexPortfolio(JSON.parse(requestKey) as IndexPortfolioRequest, controller.signal)
        .then((data) => {
          if (controller.signal.aborted) return;
          setResult(data);
          setCompletedKey(requestKey);
        })
        .catch((e) => { if (!controller.signal.aborted) setError((e as Error).message); })
        .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [activated, invalid, catalog.length, requestKey, retry]);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((key) => key !== id) : [...selected, id];
    if (next.length > 10) return;
    setSelected(next);
    if (next.length) setWeights(equalWeights(next));
  };
  const scrollAfterCalc = useRef(false);
  const calculate = () => { setActivated(true); setRetry((n) => n + 1); scrollAfterCalc.current = true; };
  // На узком экране настройки идут над результатом — после расчёта показываем результат.
  useEffect(() => {
    if (!result || !scrollAfterCalc.current) return;
    scrollAfterCalc.current = false;
    if (window.matchMedia("(max-width: 900px)").matches) document.getElementById("ix-results")?.scrollIntoView({ behavior: "smooth" });
  }, [result]);

  const chartRows = result?.rows.map((row) => ({
    label: periodLabel(row.date, result.frequency),
    nominalLine: view === "growth" ? row.nominal_growth : view === "capital" ? row.nominal : row.nominal_drawdown,
    realLine: view === "growth" ? row.real_growth : view === "capital" ? row.real : row.real_drawdown,
    m2Line: row.m2_growth == null ? null : view === "capital" ? row.m2_growth * result.capital / 100 : row.m2_growth,
  })) ?? [];
  const m2Available = !!result?.rows.some((row) => row.m2_growth != null);
  const withM2 = showM2 && view !== "drawdown" && m2Available;
  const stale = !!result && completedKey !== requestKey;
  const warnings = result?.warnings.filter((w) => !hiddenWarnings.includes(w)) ?? [];

  const exportCsv = () => {
    if (!result) return;
    const headers = ["Дата", "Номинальный капитал, RUB", "Реальный капитал, RUB", "Номинальный рост, старт 100", "Реальный рост, старт 100", "Рост M2, старт 100", "Номинальная доходность периода, %", "Реальная доходность периода, %", "Инфляция периода, %", "Номинальная просадка, %", "Реальная просадка, %"];
    const lines = result.rows.map((row) => [row.date, row.nominal, row.real, row.nominal_growth, row.real_growth, row.m2_growth, row.nominal_return == null ? null : row.nominal_return * 100, row.real_return == null ? null : row.real_return * 100, row.inflation == null ? null : row.inflation * 100, row.nominal_drawdown * 100, row.real_drawdown * 100].map((v) => v == null ? "" : String(v).replace(".", ",")).join(";"));
    const url = URL.createObjectURL(new Blob(["﻿" + [headers.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "index_portfolio.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const groups = [
    { title: "Россия", items: catalog.filter((item) => item.currency === "RUB") },
    { title: "Зарубежные, пересчёт в рубли", items: catalog.filter((item) => item.currency !== "RUB") },
  ];

  return (
    <main className="workspace index-planner">
      <aside className="sidebar" aria-label="Настройки индексного портфеля">
        <section className="side-block" aria-labelledby="ix-capital-title">
          <h2 id="ix-capital-title" className="side-title">Капитал и период</h2>
          <div className="field">
            <Label htmlFor="index-capital">Начальный капитал</Label>
            <div className="control-wrap">
              <Input id="index-capital" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />
              <span className="control-suffix" aria-hidden>₽</span>
            </div>
            <input aria-label="Капитал ползунком" className="range" type="range" min={10000} max={1000000} step={10000}
              value={Math.max(10000, Math.min(1000000, parse(capital) || 100000))} onChange={(e) => setCapital(e.target.value)} />
          </div>
          <div className="field-row">
            <div><Label htmlFor="index-start">С месяца</Label><Input id="index-start" type="month" value={start} max={end} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label htmlFor="index-end">По месяц</Label><Input id="index-end" type="month" value={end} max={previousMonth()} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <p className="field-hint">Оба месяца включаются целиком. Покупка — в последний день месяца перед началом.</p>
        </section>

        <section className="side-block" aria-labelledby="ix-list-title">
          <h2 id="ix-list-title" className="side-title">Индексы <span className="count num">{selected.length} из 10</span></h2>
          {catalogError ? (
            <div className="space-y-3"><p role="alert" className="form-error">{catalogError}</p><Button variant="outline" size="sm" onClick={() => setRetry((n) => n + 1)}><RotateCcw size={15} aria-hidden />Загрузить каталог снова</Button></div>
          ) : catalog.length === 0 ? (
            <p role="status" className="field-hint">Загружаем каталог индексов…</p>
          ) : groups.map((group) => group.items.length > 0 && (
            <div key={group.title} className="ix-group">
              <h3>{group.title}</h3>
              <ul className="ix-list">
                {group.items.map((item) => {
                  const on = selected.includes(item.id);
                  return (
                    <li key={item.id}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(item.id)}
                        disabled={!on && selected.length >= 10} className={cn("ix-option", on && "is-on")}>
                        <span className="ix-check" style={on ? { background: colorOf(item.id), borderColor: colorOf(item.id) } : undefined}><Check size={12} strokeWidth={3} aria-hidden /></span>
                        <span className="ix-name"><strong>{item.name}</strong></span>
                        <span className={cn("ix-tag", item.return_type === "total" && "is-total")} title={item.return_type === "total" ? "Индекс полной доходности: учитывает дивиденды и купоны" : "Ценовой индекс: без дивидендов"}>
                          {item.id}{item.currency !== "RUB" && `, ${item.currency}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {catalog.length > 0 && <p className="field-hint ix-tag-hint"><span className="ix-tag is-total">КОД</span> — индекс полной доходности, с дивидендами и купонами. <span className="ix-tag">КОД</span> — ценовой, без них.</p>}
        </section>

        <section className="side-block" aria-labelledby="ix-weights-title">
          <h2 id="ix-weights-title" className="side-title">Веса</h2>
          <Segmented label="Как задать веса" value={mode} onChange={setMode} full
            options={[{ value: "manual", label: "Вручную" }, { value: "min_vol", label: "Мин. риск" }, { value: "max_sharpe", label: "Макс. Шарп" }]} />
          {mode === "manual" ? (
            <div className="mt-4">
              <ul className="ix-weights">
                {selected.map((key) => (
                  <li key={key}>
                    <span className="sw" style={{ background: colorOf(key) }} aria-hidden />
                    <label htmlFor={`weight-${key}`} className="nm">{byId[key]?.name ?? key}</label>
                    <div className="control-wrap">
                      <Input id={`weight-${key}`} inputMode="decimal" value={weights[key] ?? "0"} onChange={(e) => setWeights((prev) => ({ ...prev, [key]: e.target.value }))} />
                      <span className="control-suffix" aria-hidden>%</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className={cn("ix-total", Math.abs(total - 100) <= 0.0001 ? "is-ok" : "is-off")}>
                <span className="ix-total-bar" aria-hidden><i style={{ width: `${Math.min(100, Math.max(0, total))}%` }} /></span>
                <span className="num">Сумма {num(total, total % 1 ? 2 : 0)}%</span>
                <button type="button" className="link-button" onClick={() => setWeights(equalWeights(selected))}>Поровну</button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="field-hint mt-0">Веса подберутся по модели Марковица на реальных месячных доходностях. Нужно не меньше 30 месяцев истории.</p>
              {shortForAuto && <p className="inline-note is-warn"><CircleAlert size={14} aria-hidden />Период короче 30 месяцев — расширьте его или задайте веса вручную.</p>}
              {mode === "max_sharpe" && (
                <div className="field">
                  <Label htmlFor="index-rf">Безрисковая ставка, % годовых</Label>
                  <div className="control-wrap"><Input id="index-rf" inputMode="decimal" value={riskFree} onChange={(e) => setRiskFree(e.target.value)} /><span className="control-suffix" aria-hidden>%</span></div>
                  <p className="field-hint">Номинальная. В реальную пересчитывается по фактической инфляции за период.</p>
                </div>
              )}
            </div>
          )}
          <div className="field mt-4">
            <Label htmlFor="index-rebalance">Ребалансировка</Label>
            <Select id="index-rebalance" value={rebalance} onChange={(e) => setRebalance(e.target.value as typeof rebalance)}>
              <option value="monthly">Каждый месяц</option><option value="quarterly">Раз в квартал</option>
              <option value="yearly">Раз в год</option><option value="none">Не делать</option>
            </Select>
            <p className="field-hint">Возврат долей к исходным весам. Без ребалансировки доли дрейфуют вместе с ценами.</p>
          </div>
          {invalid && <p role="alert" className="form-error mt-3">{invalid}</p>}
          <Button size="lg" className="mt-4 w-full" disabled={!!invalid || catalog.length === 0 || busy} onClick={calculate}>
            {busy ? <><LoaderCircle className="animate-spin" size={17} aria-hidden />Считаем…</> : result ? "Пересчитать" : "Рассчитать портфель"}
          </Button>
          {result && <p className="field-hint">Дальше изменения применяются сами через полсекунды.</p>}
        </section>
      </aside>

      <div className="main" id="ix-results">
        {error && (
          <div role="alert" className="notice notice-error">
            <CircleAlert size={18} aria-hidden />
            <div>{error}</div>
            <Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Повторить</Button>
          </div>
        )}

        {!result ? (
          <section className="ix-empty" aria-labelledby="ix-empty-title">
            {busy ? (
              <div className="empty" role="status"><span className="spinner" aria-hidden /><strong>Загружаем историю и считаем портфель</strong><p>Котировки индексов, курсы ЦБ, ИПЦ Росстата и M2. Первый раз это занимает до минуты, потом данные берутся из кэша.</p></div>
            ) : (
              <>
                <h1 id="ix-empty-title">Портфель из индексов в рублях</h1>
                <p className="lead">Соберите портфель из 2–10 индексов и посмотрите, как бы он вырос на истории — в рублях и за вычетом инфляции. Все данные приложение загрузит само.</p>
                <ul className="ix-sources">
                  <li><strong>Котировки</strong><span>MOEX ISS и Yahoo Finance</span></li>
                  <li><strong>Курсы валют</strong><span>Банк России, на конец месяца</span></li>
                  <li><strong>Инфляция</strong><span>месячный ИПЦ Росстата</span></li>
                  <li><strong>Денежная масса M2</strong><span>Банк России, для сравнения</span></li>
                </ul>
                <Button size="lg" onClick={calculate} disabled={!!invalid || catalog.length === 0}><Calculator size={18} aria-hidden />Рассчитать портфель</Button>
                {invalid && <p className="field-hint">{invalid}</p>}
              </>
            )}
          </section>
        ) : (
          <div className={cn("ix-results", stale && "is-stale")} aria-busy={busy}>
            <section className="overview" aria-labelledby="ix-title">
              <h1 id="ix-title" className="ix-headline num">
                <span>{rub(result.capital)}</span>
                <span className="arrow" aria-hidden>→</span>
                <span>{rub(result.final_nominal_capital)}</span>
              </h1>
              <p>
                {MONTHS_LONG[Number(result.start.slice(5, 7)) - 1].replace(/^./, (c) => c.toUpperCase())} {result.start.slice(0, 4)} — {MONTHS_LONG[Number(result.end.slice(5, 7)) - 1]} {result.end.slice(0, 4)} ({result.n_months} мес.), {MODE_TEXT[result.mode]}, {REBALANCE[result.rebalance]}.
                {" "}В ценах начала периода это {rub(result.final_real_capital)}.
              </p>
            </section>
            {stale && (
              <p role="status" className="ix-stale">
                {invalid ? <><CircleAlert size={15} aria-hidden />Показан прошлый расчёт. Исправьте настройки, чтобы обновить.</> : busy ? <><LoaderCircle size={15} className="animate-spin" aria-hidden />Пересчитываем по новым настройкам…</> : <><Info size={15} aria-hidden />Показан прошлый расчёт.</>}
              </p>
            )}

            <dl className="stats" aria-label="Показатели портфеля">
              <div className="stat"><dt>Рост в рублях</dt><dd className={cn(result.nominal_metrics.total_return < 0 && "is-neg")}>{pct(result.nominal_metrics.total_return, 1)}<small>{pct(result.nominal_metrics.cagr, 1)} в год</small></dd></div>
              <div className="stat"><dt>Рост после инфляции</dt><dd className={cn(result.real_metrics.total_return < 0 && "is-neg")}>{pct(result.real_metrics.total_return, 1)}<small>{pct(result.real_metrics.cagr, 1)} в год</small></dd></div>
              <div className="stat"><dt>Волатильность</dt><dd>{pct(result.real_metrics.volatility, 1)}<small>реальная, годовая{result.real_metrics.sharpe != null && `, Шарп ${num(result.real_metrics.sharpe)}`}</small></dd></div>
              <div className="stat"><dt>Макс. просадка</dt><dd className="is-neg">{pct(result.real_metrics.max_drawdown, 1)}<small>реальная, по месяцам</small></dd></div>
            </dl>

            {warnings.length > 0 && (
              <div className="notice">
                <Info size={18} aria-hidden />
                <ul className="ix-notes">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                <button type="button" className="notice-close" aria-label="Скрыть примечания" onClick={() => setHiddenWarnings(result.warnings)}><X size={16} aria-hidden /></button>
              </div>
            )}

            <Card>
              <CardHeader title="Как рос капитал"
                sub={`Инфляция за период — ${pct(result.cumulative_inflation, 1)}. Реальная линия показывает капитал в ценах начала периода.`}
                aside={<Segmented label="Шаг графика и таблицы" value={frequency} onChange={setFrequency}
                  options={[{ value: "monthly", label: "Месяц" }, { value: "quarterly", label: "Квартал" }, { value: "yearly", label: "Год" }]} />} />
              <CardContent>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <Segmented label="Что показать" value={view} onChange={setView}
                    options={[{ value: "growth", label: "Рост от 100" }, { value: "capital", label: "Капитал, ₽" }, { value: "drawdown", label: "Просадки" }]} />
                  {view !== "drawdown" && m2Available && <div className="ix-m2-switch"><Switch id="ix-m2" label="Сравнить с ростом M2" checked={showM2} onChange={setShowM2} /></div>}
                </div>
                <ul className="legend mb-2" aria-label="Линии графика">
                  <li className="is-portfolio"><span className="lg-line" style={{ background: COLORS.nominal }} />В рублях</li>
                  <li className="is-portfolio"><span className="lg-line" style={{ background: COLORS.real }} />После инфляции</li>
                  {withM2 && <li className="is-portfolio"><span className="lg-line lg-dashed" style={{ color: COLORS.m2 }} />Денежная масса M2</li>}
                </ul>
                <div className="h-[340px] sm:h-[380px]">
                  <ResponsiveContainer>
                    <LineChart data={chartRows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 6" vertical={false} />
                      <XAxis dataKey="label" minTickGap={40} tickLine={false} stroke={theme.grid} />
                      <YAxis width={64} domain={["auto", "auto"]} tickLine={false} axisLine={false}
                        tickFormatter={(v: number) => view === "drawdown" ? pct(v, 0) : compact(v)} />
                      <Tooltip isAnimationActive={false} cursor={{ stroke: theme.muted, strokeDasharray: "3 3" }}
                        formatter={(value: number, name) => [view === "drawdown" ? pct(value, 1) : view === "capital" ? rub(value) : num(value, 1), name]} />
                      <ReferenceLine y={view === "drawdown" ? 0 : view === "capital" ? result.capital : 100} stroke={theme.muted} strokeOpacity={0.5} strokeDasharray="4 4" />
                      <Line dataKey="nominalLine" name="В рублях" stroke={COLORS.nominal} strokeWidth={2} dot={false} type="linear" isAnimationActive={false} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} />
                      <Line dataKey="realLine" name="После инфляции" stroke={COLORS.real} strokeWidth={2} dot={false} type="linear" isAnimationActive={false} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} />
                      {withM2 && <Line dataKey="m2Line" name="M2" stroke={COLORS.m2} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls={false} type="linear" isAnimationActive={false} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="panel-foot">
                  {view === "drawdown" ? "Насколько капитал опускался ниже предыдущего максимума. Считается по месячным данным при любом шаге графика."
                    : "M2 — рост денежной массы без поправки на инфляцию, только для сравнения: в портфель и в расчёт риска он не входит."}
                  {view === "capital" && withM2 && " Линия M2 масштабирована к начальному капиталу."}
                </p>
              </CardContent>
            </Card>

            <div className="panel-grid ix-grid">
              <Card>
                <CardHeader title="Состав портфеля" sub={result.rebalance === "none" ? "Доли в начале и в конце: без ребалансировки они дрейфуют вместе с ценами." : "Доли в начале и в конце периода — к концу они немного смещаются от исходных."} />
                <CardContent>
                  <ul className="ix-alloc">
                    {result.indices.map((item, i) => (
                      <li key={item.id}>
                        <div className="ix-alloc-head">
                          <span className="sw" style={{ background: colorOf(item.id) }} aria-hidden />
                          <span className="nm">{item.name}<small>{item.id}{item.currency !== "RUB" && `, ${item.currency} → RUB`}</small></span>
                          <span className="val num">{pct(result.weights[i], 1)}<small>{rub(result.capital * result.weights[i])}</small></span>
                        </div>
                        <div className="ix-alloc-bars" aria-hidden>
                          <span><i style={{ width: `${result.weights[i] * 100}%`, background: colorOf(item.id) }} /></span>
                          <span className="end"><i style={{ width: `${result.final_weights[i] * 100}%`, background: colorOf(item.id) }} /></span>
                        </div>
                        <p className="ix-alloc-end num">в конце {pct(result.final_weights[i], 1)}</p>
                      </li>
                    ))}
                  </ul>
                  <p className="panel-foot">Модельный портфель: комиссии, налоги и покупка фондов на индексы не учитываются.</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader title="Доходность и риск" sub="За весь период. Волатильность приведена к году." />
                <CardContent>
                  <div className="table-scroll">
                    <table className="metrics-table ix-metrics">
                      <thead><tr><th scope="col">Показатель</th><th scope="col">В рублях</th><th scope="col">После инфляции</th></tr></thead>
                      <tbody>
                        <tr><td>Накопленный рост</td><td>{pct(result.nominal_metrics.total_return)}</td><td>{pct(result.real_metrics.total_return)}</td></tr>
                        <tr><td>Среднегодовой рост (CAGR)</td><td>{pct(result.nominal_metrics.cagr)}</td><td>{pct(result.real_metrics.cagr)}</td></tr>
                        <tr><td>Средняя доходность в год</td><td>{pct(result.nominal_metrics.expected_return)}</td><td>{pct(result.real_metrics.expected_return)}</td></tr>
                        <tr><td>Волатильность в год</td><td>{pct(result.nominal_metrics.volatility)}</td><td>{pct(result.real_metrics.volatility)}</td></tr>
                        <tr><td>Максимальная просадка</td><td className="is-neg">{pct(result.nominal_metrics.max_drawdown)}</td><td className="is-neg">{pct(result.real_metrics.max_drawdown)}</td></tr>
                        <tr><td>Капитал в конце</td><td>{rub(result.final_nominal_capital)}</td><td>{rub(result.final_real_capital)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  {result.real_metrics.sharpe != null && <p className="panel-foot">Коэффициент Шарпа {num(result.real_metrics.sharpe)} при реальной безрисковой ставке {pct(result.risk_free_real, 1)}.</p>}
                </CardContent>
              </Card>
            </div>

            <details className="data-details">
              <summary><span>Таблица по периодам<small>{result.rows.length - 1} строк</small></span><span className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={(e) => { e.preventDefault(); exportCsv(); }}><Download size={15} aria-hidden />CSV</Button><ChevronIcon /></span></summary>
              <div className="preview-table-wrap">
                <table className="preview-table">
                  <thead><tr><th scope="col">Период</th><th scope="col">В рублях</th><th scope="col">После инфляции</th><th scope="col">Инфляция</th><th scope="col">Капитал, ₽</th><th scope="col">M2, от 100</th></tr></thead>
                  <tbody>
                    {result.rows.slice(1).map((row) => (
                      <tr key={row.date}>
                        <td>{periodLabel(row.date, result.frequency)}</td>
                        <td className={cn(row.nominal_return != null && row.nominal_return < 0 && "is-neg")}>{pct(row.nominal_return, 1)}</td>
                        <td className={cn(row.real_return != null && row.real_return < 0 && "is-neg")}>{pct(row.real_return, 1)}</td>
                        <td>{pct(row.inflation, 1)}</td>
                        <td>{Math.round(row.nominal).toLocaleString("ru-RU")}</td>
                        <td>{num(row.m2_growth, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details className="data-details">
              <summary><span>Как считается</span><ChevronIcon /></summary>
              <div className="ix-method">
                <p>Стоимость зарубежного индекса переводится в рубли по курсу ЦБ на конец месяца: (1 + доходность индекса) × (1 + изменение курса) − 1.</p>
                <p>Реальная доходность за месяц: (1 + номинальная) / (1 + ИПЦ месяца) − 1. Реальный капитал — номинальный, делённый на накопленный ИПЦ.</p>
                <p>Ценовые индексы не учитывают дивиденды; индексы «с выплатами» учитывают их по своей методике.</p>
                <p className="ix-links">
                  <a href="https://iss.moex.com/iss/reference/" target="_blank" rel="noreferrer">MOEX ISS</a>
                  <a href="https://finance.yahoo.com/" target="_blank" rel="noreferrer">Yahoo Finance</a>
                  <a href={result.sources.inflation} target="_blank" rel="noreferrer">ИПЦ Росстата</a>
                  <a href={result.sources.currency} target="_blank" rel="noreferrer">Курсы ЦБ</a>
                  <a href={result.sources.m2} target="_blank" rel="noreferrer">M2 Банка России</a>
                </p>
              </div>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}

function ChevronIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="ix-chevron"><path d="m6 9 6 6 6-6" /></svg>;
}
