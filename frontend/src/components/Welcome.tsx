import type { ReactNode } from "react";
import { ArrowLeft, Check, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Welcome({ dataSource, feedback, onMarketExample, marketBusy, onBack }: {
  dataSource: ReactNode; feedback: ReactNode; onMarketExample: () => void; marketBusy: boolean; onBack?: () => void;
}) {
  return (
    <div className="start">
      {onBack && (
        <Button variant="ghost" size="sm" className="-ml-3 mb-6" onClick={onBack}><ArrowLeft size={16} aria-hidden />Вернуться к анализу</Button>
      )}
      <section className="start-hero" aria-labelledby="start-title">
        <div className="start-intro">
          <h1 id="start-title">Найдите баланс риска и доходности</h1>
          <p className="lead">
            Загрузите историю доходностей — приложение построит эффективную границу Марковица,
            подберёт веса активов под вашу цель и сравнит стратегии с учётом инфляции.
          </p>
        </div>
        <HeroFrontier />

        <div id="start" className="loader-card">
          <h2>С чего начать</h2>
          <p>Самый быстрый способ — открыть готовый пример на реальных котировках.</p>
          <button type="button" className="example-cta" onClick={onMarketExample} disabled={marketBusy}>
            {marketBusy ? <LoaderCircle size={22} className="animate-spin" aria-hidden /> : <Sparkles size={22} aria-hidden />}
            <span>
              <strong>{marketBusy ? "Загружаем котировки…" : "Открыть пример с Мосбиржи"}</strong>
              <span>9 крупных акций, помесячно с 2015 года</span>
            </span>
          </button>
          <div className="or-divider">или загрузите свои данные</div>
          {feedback && <div className="mb-4">{feedback}</div>}
          {dataSource}
        </div>
      </section>

      <section className="start-section" aria-labelledby="how-title">
        <h2 id="how-title">Как это работает</h2>
        <ol className="steps">
          <li>
            <h3>Загрузите доходности</h3>
            <p>Файл Excel или CSV, тикеры Мосбиржи и Yahoo Finance — или готовый пример.</p>
          </li>
          <li>
            <h3>Выберите цель</h3>
            <p>Минимальный риск, лучший коэффициент Шарпа или заданная доходность.</p>
          </li>
          <li>
            <h3>Сравните портфели</h3>
            <p>До пяти стратегий рядом: доходность, волатильность, просадки, время восстановления.</p>
          </li>
        </ol>
      </section>

      <section className="start-section" aria-labelledby="format-title">
        <h2 id="format-title">Как подготовить файл</h2>
        <p>Одна строка — один период. В первом столбце дата, дальше — доходности активов.</p>
        <div className="format-guide">
          <div className="table-scroll">
            <table className="format-table num">
              <thead>
                <tr>
                  <th scope="col"><span className="col-tag">A</span>Дата</th>
                  <th scope="col"><span className="col-tag">B</span>SBER</th>
                  <th scope="col"><span className="col-tag">C</span>GAZP</th>
                  <th scope="col"><span className="col-tag">D</span>LKOH</th>
                  <th scope="col" className="hide-sm"><span className="col-tag">E</span>…</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>31.01.2024</td><td>4,2</td><td>−1,8</td><td>2,6</td><td className="hide-sm">…</td></tr>
                <tr><td>29.02.2024</td><td>3,1</td><td>0,4</td><td>−0,9</td><td className="hide-sm">…</td></tr>
                <tr><td>31.03.2024</td><td>−2,3</td><td>1,2</td><td>3,8</td><td className="hide-sm">…</td></tr>
                <tr className="ellipsis"><td colSpan={5}>ещё минимум 27 строк</td></tr>
              </tbody>
            </table>
          </div>
          <ul className="format-notes">
            <li><Check size={16} aria-hidden /><span><strong>От 2 до 50 активов</strong> с уникальными названиями в первой строке.</span></li>
            <li><Check size={16} aria-hidden /><span><strong>Не меньше 30 периодов</strong> — иначе оценки риска будут ненадёжны.</span></li>
            <li><Check size={16} aria-hidden /><span><strong>Проценты или доли</strong> — формат определится сам, его можно поправить в настройках.</span></li>
            <li><Check size={16} aria-hidden /><span><strong>Вместо дат можно номера периодов</strong>, тогда укажите шаг данных вручную.</span></li>
          </ul>
        </div>
      </section>
    </div>
  );
}

/** Иллюстрация: облако портфелей и рисующаяся эффективная граница. */
function HeroFrontier() {
  const W = 560, H = 300, x0 = 46, y0 = 262;
  // граница: σ(μ) — гипербола, рисуем как функцию от x
  const boundary = (x: number) => y0 - 64 - 190 * Math.sqrt(Math.max(0, (x - 92) / 430));
  const pts = Array.from({ length: 61 }, (_, i) => 92 + (430 * i) / 60);
  const path = pts.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${boundary(x).toFixed(1)}`).join(" ");
  // детерминированный «случайный» шум, чтобы картинка не менялась между рендерами
  const noise = (i: number) => { const v = Math.sin(i * 12.9898) * 43758.5453; return v - Math.floor(v); };
  const cloud = Array.from({ length: 170 }, (_, i) => {
    const x = 104 + noise(i) * 400;
    const depth = Math.pow(noise(i + 500), 1.6);
    const y = boundary(x) + 10 + depth * (y0 - 18 - boundary(x));
    return { x, y, o: 0.12 + (1 - depth) * 0.26 };
  });
  const minX = 92, minY = boundary(92);
  const shX = 300, shY = boundary(300);
  return (
    <figure className="hero-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Пример эффективной границы: облако возможных портфелей и кривая лучших из них">
        <line className="axis" x1={x0} y1={y0} x2={W - 10} y2={y0} />
        <line className="axis" x1={x0} y1={14} x2={x0} y2={y0} />
        <text className="axis-label" x={W - 10} y={y0 + 24} textAnchor="end">риск →</text>
        <text className="axis-label" x={x0 - 10} y={22} textAnchor="end" transform={`rotate(-90 ${x0 - 14} 22)`}>доходность →</text>
        <g className="cloud">
          {cloud.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r={3} opacity={c.o} />)}
        </g>
        <path className="frontier-path" d={path} pathLength={1} />
        <g className="opt opt-a">
          <circle className="opt-ring" cx={minX} cy={minY} r={8} />
          <circle className="opt-core" cx={minX} cy={minY} r={4} />
          <text className="opt-label" x={minX - 14} y={minY + 30}>Минимальный риск</text>
        </g>
        <g className="opt opt-b">
          <circle className="opt-ring" cx={shX} cy={shY} r={8} />
          <circle className="opt-core" cx={shX} cy={shY} r={4} />
          <text className="opt-label" x={shX - 16} y={shY - 34} textAnchor="end">Максимальный Шарп</text>
          <text className="opt-sub" x={shX - 16} y={shY - 16} textAnchor="end">лучшая доходность на единицу риска</text>
        </g>
      </svg>
    </figure>
  );
}
