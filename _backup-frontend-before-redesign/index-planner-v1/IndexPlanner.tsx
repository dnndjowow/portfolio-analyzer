import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { chartTheme, num, pct } from "@/lib/utils";
import type { IndexInfo, IndexPortfolioRequest, IndexPortfolioResult } from "@/types";

const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
const parse = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));
const monthEnd = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};
const previousMonth = () => {
  const date = new Date();
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), 0)).toISOString().slice(0, 7);
};
const equalWeights = (keys: string[]) => {
  const share = Math.floor(10000 / keys.length) / 100;
  return Object.fromEntries(keys.map((key, i) => [key, (i === keys.length - 1 ? 100 - share * (keys.length - 1) : share).toFixed(2)]));
};
const DEFAULT = ["MCFTR", "RGBITR", "SP500"];
const REBALANCE = { none: "Без ребалансировки", monthly: "Каждый месяц", quarterly: "Каждый квартал", yearly: "Каждый год" };

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
  const [retry, setRetry] = useState(0);
  const theme = chartTheme(dark);

  useEffect(() => {
    let active = true;
    setCatalogError(null);
    api.indexCatalog().then((data) => { if (active) setCatalog(data.indices); })
      .catch((e) => { if (active) setCatalogError((e as Error).message); });
    return () => { active = false; };
  }, [retry]);

  const total = selected.reduce((sum, key) => sum + parse(weights[key] ?? "0"), 0);
  const invalid = selected.length < 2 ? "Выберите минимум два индекса."
    : !Number.isFinite(parse(capital)) || parse(capital) <= 0 || parse(capital) > 1e12 ? "Введите капитал больше нуля (до 1 трлн ₽)."
    : !start || !end || start > end ? "Проверьте начало и конец периода."
    : !Number.isFinite(parse(riskFree)) || parse(riskFree) < -99 || parse(riskFree) > 100 ? "Проверьте безрисковую ставку."
    : mode === "manual" && selected.some((key) => !Number.isFinite(parse(weights[key])) || parse(weights[key]) < 0 || parse(weights[key]) > 100) ? "Веса должны быть от 0 до 100%."
    : mode === "manual" && Math.abs(total - 100) > 0.0001 ? `Сумма весов должна быть 100%, сейчас ${num(total, 2)}%.` : null;

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
    setSelected(next);
    if (next.length) setWeights(equalWeights(next));
  };
  const chartRows = result?.rows.map((row) => ({
    ...row,
    nominalLine: view === "growth" ? row.nominal_growth : view === "capital" ? row.nominal : row.nominal_drawdown,
    realLine: view === "growth" ? row.real_growth : view === "capital" ? row.real : row.real_drawdown,
    m2Line: row.m2_growth == null ? null : view === "capital" ? row.m2_growth * result.capital / 100 : row.m2_growth,
  })) ?? [];
  const exportCsv = () => {
    if (!result) return;
    const headers = ["Дата", "Номинальный капитал, RUB", "Реальный капитал, RUB", "Номинальный рост, старт 100", "Реальный рост, старт 100", "Рост M2, старт 100", "Номинальная доходность периода, %", "Реальная доходность периода, %", "Инфляция периода, %", "Номинальная просадка, %", "Реальная просадка, %"];
    const lines = result.rows.map((row) => [row.date, row.nominal, row.real, row.nominal_growth, row.real_growth, row.m2_growth, row.nominal_return == null ? null : row.nominal_return * 100, row.real_return == null ? null : row.real_return * 100, row.inflation == null ? null : row.inflation * 100, row.nominal_drawdown * 100, row.real_drawdown * 100].map((v) => v == null ? "" : String(v).replace(".", ",")).join(";"));
    const url = URL.createObjectURL(new Blob(["\ufeff" + [headers.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "index_portfolio.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <main className="index-planner">
      <section className="index-intro">
        <h1>Ваш портфель из индексов</h1>
        <p>Выберите от 2 до 10 индексов, задайте капитал и веса. История, курсы валют, инфляция и M2 загружаются автоматически.</p>
      </section>
      <div className="index-layout">
        <fieldset disabled={busy && !result} className="index-form">
        <aside className="sidebar index-settings" aria-label="Настройки индексного портфеля">
          <section className="side-block">
            <h2 className="side-title">Капитал и период</h2>
            <div className="field"><Label htmlFor="index-capital">Начальный капитал, ₽</Label><Input id="index-capital" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /></div>
            <input aria-label="Изменить капитал ползунком" className="capital-slider" type="range" min={10000} max={1000000} step={10000} value={Math.max(10000, Math.min(1000000, parse(capital) || 100000))} onChange={(e) => setCapital(e.target.value)} />
            <div className="field-row">
              <div><Label htmlFor="index-start">С месяца</Label><Input id="index-start" type="month" value={start} max={end} onChange={(e) => setStart(e.target.value)} /></div>
              <div><Label htmlFor="index-end">По месяц</Label><Input id="index-end" type="month" value={end} max={previousMonth()} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <p className="field-hint">Полные месяцы включительно. Начальная оценка — на конец предыдущего месяца.</p>
            <div className="field"><Label htmlFor="index-frequency">Частота графика и таблицы</Label><Select id="index-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}><option value="monthly">Месяц</option><option value="quarterly">Квартал</option><option value="yearly">Год</option></Select></div>
            <div className="field"><Label htmlFor="index-rebalance">Ребалансировка</Label><Select id="index-rebalance" value={rebalance} onChange={(e) => setRebalance(e.target.value as typeof rebalance)}>{Object.entries(REBALANCE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></div>
            <p className="field-hint">Базовая валюта — RUB. Зарубежные индексы пересчитываются по историческим курсам ЦБ.</p>
          </section>
          <section className="side-block">
            <h2 className="side-title">Индексы <span className="count num">{selected.length} / 10</span></h2>
            {catalogError ? <><p role="alert" className="form-error">{catalogError}</p><Button variant="outline" onClick={() => setRetry((n) => n + 1)}>Повторить</Button></> : catalog.length === 0 ? <p role="status">Загружаем каталог…</p> : <div className="index-options">{catalog.map((item) => (
              <label key={item.id} className={`index-option ${selected.includes(item.id) ? "is-selected" : ""}`}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Выбрать ${item.name}`} />
                <span><strong>{item.name}</strong><small>{item.id} · {item.currency} · {item.return_type === "total" ? "полная доходность" : "ценовой"}</small></span>
              </label>
            ))}</div>}
          </section>
          <section className="side-block">
            <h2 className="side-title">Веса и стратегия</h2>
            <div className="field"><Label htmlFor="index-mode">Как выбрать веса</Label><Select id="index-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="manual">Задать вручную</option><option value="min_vol">Минимальная волатильность</option><option value="max_sharpe">Максимальный Шарп</option></Select></div>
            {mode === "manual" ? <>
              <Button variant="subtle" size="sm" className="mb-3" onClick={() => setWeights(equalWeights(selected))}>Равные веса</Button>
              {selected.map((key) => <div key={key} className="weight-field"><Label htmlFor={`weight-${key}`}>{key}</Label><div><Input id={`weight-${key}`} inputMode="decimal" value={weights[key] ?? "0"} onChange={(e) => setWeights((prev) => ({ ...prev, [key]: e.target.value }))} /><span>%</span></div></div>)}
              <p className="field-hint">Сумма: {num(total, 2)}%. Все веса неотрицательные.</p>
            </> : <p className="field-hint">Веса подбираются по месячной модели Марковица с учётом исторического ИПЦ. Кривая капитала учитывает выбранную ребалансировку.</p>}
            {mode === "max_sharpe" && <div className="field"><Label htmlFor="index-rf">Номинальная безрисковая ставка, % в год</Label><Input id="index-rf" inputMode="decimal" value={riskFree} onChange={(e) => setRiskFree(e.target.value)} /></div>}
            {invalid && <p role="alert" className="form-error">{invalid}</p>}
            <Button className="mt-4 w-full" disabled={!!invalid || catalog.length === 0 || busy} onClick={() => { setActivated(true); setRetry((n) => n + 1); }}>{busy ? <><LoaderCircle className="animate-spin" size={16} />Рассчитываем…</> : result ? "Пересчитать портфель" : "Рассчитать портфель"}</Button>
            <p className="field-hint">После первого расчёта изменения настроек применяются автоматически.</p>
          </section>
        </aside>
        </fieldset>
        <div className="main index-results">
          {error && <div role="alert" className="notice notice-error"><div>{error}</div><Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Повторить</Button></div>}
          {result && completedKey !== requestKey && <p role="status" className="notice">{invalid ? "Показан предыдущий расчёт. Исправьте настройки для обновления." : busy ? "Обновляем расчёт по новым настройкам…" : "Показан предыдущий расчёт; новые настройки ещё не применены."}</p>}
          {!result ? <Card><CardContent><div className="empty">{busy ? <><span className="spinner" /><strong>Загружаем историю и рассчитываем портфель</strong><p>Первый запрос может занять некоторое время. Затем публичные данные используются из кэша.</p></> : <><SlidersHorizontal /><strong>Настройте портфель слева</strong><p>Все данные загружаются автоматически. M2 будет отдельным ориентиром для сравнения.</p></>}</div></CardContent></Card> : <>
            <section className="overview"><h2>Результат за выбранный период</h2><p>{result.start} — {result.end} · {result.n_months} месяцев · {REBALANCE[result.rebalance]} · RUB</p></section>
            <dl className="stats" aria-label="Показатели индексного портфеля">
              <div className="stat"><dt>Номинальная доходность</dt><dd>{pct(result.nominal_metrics.total_return, 1)}<small>CAGR {pct(result.nominal_metrics.cagr, 1)}</small></dd></div>
              <div className="stat"><dt>Реальная доходность</dt><dd>{pct(result.real_metrics.total_return, 1)}<small>CAGR {pct(result.real_metrics.cagr, 1)}</small></dd></div>
              <div className="stat"><dt>Капитал в конце</dt><dd>{rub(result.final_nominal_capital)}<small>В начальных ценах: {rub(result.final_real_capital)}</small></dd></div>
              <div className="stat"><dt>Реальная волатильность</dt><dd>{pct(result.real_metrics.volatility, 1)}<small>Годовая · просадка {pct(result.real_metrics.max_drawdown, 1)}</small></dd></div>
            </dl>
            {result.warnings.map((warning) => <p key={warning} className="index-warning">{warning}</p>)}
            <Card>
              <CardHeader title="Номинальный и реальный рост · сравнение с M2" sub={`Инфляция за весь период: ${pct(result.cumulative_inflation)}. ИПЦ Росстата учитывается помесячно.`} />
              <CardContent>
                <div className="index-chart-controls"><Segmented label="Вид динамики портфеля" value={view} onChange={setView} options={[{ value: "growth", label: "Рост, старт 100" }, { value: "capital", label: "Капитал, ₽" }, { value: "drawdown", label: "Просадки" }]} />{view !== "drawdown" && <label className="m2-toggle"><input type="checkbox" checked={showM2} onChange={(e) => setShowM2(e.target.checked)} />Показать M2</label>}</div>
                <ul className="legend"><li><span className="lg-line" style={{ background: "#1f8a70" }} />Номинальный портфель</li><li><span className="lg-line" style={{ background: "#5b6ee1" }} />Реальный портфель</li>{showM2 && view !== "drawdown" && <li><span className="lg-line" style={{ background: "#bd7f0c" }} />M2 — номинальный ориентир</li>}</ul>
                <div className="h-[350px]"><ResponsiveContainer><LineChart data={chartRows} margin={{ top: 18, right: 12, bottom: 8, left: 5 }}><CartesianGrid strokeDasharray="2 6" vertical={false} /><XAxis dataKey="date" minTickGap={50} tickFormatter={(v: string) => v.slice(0, 7)} tickLine={false} /><YAxis width={75} tickFormatter={(v: number) => view === "drawdown" ? pct(v, 0) : new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(v)} domain={["auto", "auto"]} tickLine={false} /><Tooltip formatter={(value: number, name) => [view === "drawdown" ? pct(value) : view === "capital" ? rub(value) : num(value), name]} /><Line dataKey="nominalLine" name="Номинальный портфель" stroke="#1f8a70" strokeWidth={2} dot={false} type="linear" isAnimationActive={false} /><Line dataKey="realLine" name="Реальный портфель" stroke="#5b6ee1" strokeWidth={2} dot={false} type="linear" isAnimationActive={false} />{showM2 && view !== "drawdown" && <Line dataKey="m2Line" name="M2 — ориентир" stroke="#bd7f0c" strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls={false} type="linear" isAnimationActive={false} />}</LineChart></ResponsiveContainer></div>
                <p className="panel-foot" style={{ color: theme.muted }}>M2 — рост денежной массы, без поправки на инфляцию. В состав портфеля и расчёт риска он не входит. {view === "capital" ? "Линия M2 условно масштабирована к начальному капиталу." : view === "growth" ? "Линии роста начинаются со 100." : "Просадки показаны относительно предыдущего максимума."} Просадки и волатильность рассчитываются по месячной истории при любой частоте графика.</p>
              </CardContent>
            </Card>
            <Card><CardHeader title="Распределение капитала" sub="Начальные веса и фактические доли в конце периода." /><CardContent><div className="table-scroll"><table className="metrics-table"><thead><tr><th>Индекс</th><th>Начальный вес</th><th>Начальная сумма</th><th>Доля в конце</th></tr></thead><tbody>{result.indices.map((item, i) => <tr key={item.id}><td>{item.name}<small>{item.id} · {item.currency} → RUB</small></td><td>{pct(result.weights[i])}</td><td>{rub(result.capital * result.weights[i])}</td><td>{pct(result.final_weights[i])}</td></tr>)}</tbody></table></div><p className="panel-foot">Это модельный портфель индексов. Покупки фондов, комиссии, налоги и ограничения лотов в этот расчёт не включены.</p></CardContent></Card>
            <Card><CardHeader title="Доходность и риск" sub="Накопленные показатели за весь период; волатильность приведена к году." /><CardContent><div className="table-scroll"><table className="metrics-table"><thead><tr><th>Показатель</th><th>Номинальный</th><th>Реальный</th></tr></thead><tbody><tr><td>Накопленный рост</td><td>{pct(result.nominal_metrics.total_return)}</td><td>{pct(result.real_metrics.total_return)}</td></tr><tr><td>CAGR</td><td>{pct(result.nominal_metrics.cagr)}</td><td>{pct(result.real_metrics.cagr)}</td></tr><tr><td>Годовая волатильность</td><td>{pct(result.nominal_metrics.volatility)}</td><td>{pct(result.real_metrics.volatility)}</td></tr><tr><td>Максимальная просадка</td><td>{pct(result.nominal_metrics.max_drawdown)}</td><td>{pct(result.real_metrics.max_drawdown)}</td></tr></tbody></table></div></CardContent></Card>
            <Card><CardHeader title="Результаты по периодам" aside={<Button variant="outline" size="sm" onClick={exportCsv}><Download size={15} />CSV</Button>} /><CardContent><div className="table-scroll index-period-table"><table className="metrics-table"><thead><tr><th>Дата</th><th>Номинальная доходность</th><th>Реальная доходность</th><th>Инфляция</th><th>M2, старт 100</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.date}><td>{row.date}</td><td>{pct(row.nominal_return)}</td><td>{pct(row.real_return)}</td><td>{pct(row.inflation)}</td><td>{num(row.m2_growth)}</td></tr>)}</tbody></table></div></CardContent></Card>
            <details className="data-details"><summary><span>Методика и источники</span></summary><div className="panel-body"><p>Доходность в RUB: (1 + доходность индекса) × (1 + изменение курса) − 1. Реальная доходность: (1 + номинальная) / (1 + ИПЦ за период) − 1. При отсутствии ребалансировки доли изменяются вместе со стоимостью индексов.</p><p className="mt-3"><a className="link-button" href="https://iss.moex.com/iss/reference/" target="_blank" rel="noreferrer">Источник: ПАО Московская Биржа</a> · <a href="https://www.moex.com/ru/indices" target="_blank" rel="noreferrer">Индексы MOEX</a> · <a href="https://finance.yahoo.com/" target="_blank" rel="noreferrer">Yahoo Finance</a> · <a href={result.sources.inflation} target="_blank" rel="noreferrer">ИПЦ Росстата</a> · <a href={result.sources.currency} target="_blank" rel="noreferrer">Курсы ЦБ</a> · <a href={result.sources.m2} target="_blank" rel="noreferrer">M2 Банка России</a></p></div></details>
          </>}
        </div>
      </div>
    </main>
  );
}
