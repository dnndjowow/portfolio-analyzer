import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Check, ChartNoAxesCombined, Layers3, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Welcome({ dataSource, feedback, onDemo }: { dataSource: ReactNode; feedback: ReactNode; onDemo: () => void }) {
  return (
    <>
      <div className="intro-ribbon">Ваша стратегия начинается с ясной картины.</div>
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">PORTFOLIO ANALYZER</p>
          <h1 id="hero-title">Ваш портфель.<br /><span>В новом свете.</span></h1>
          <p className="hero-description">Увидеть баланс. Понять риск.<br className="sm:hidden" /> Найти свою стратегию.<br />Всё важное о ваших инвестициях — в одном месте.</p>
          <div className="hero-actions">
            <a className="primary-link" href="#start">Начать анализ <ArrowRight size={17} aria-hidden /></a>
            <button type="button" className="text-link" onClick={onDemo}>Попробовать на примере <ArrowUpRight size={17} aria-hidden /></button>
          </div>
        </div>
        <ProductPreview />
      </section>
      <section id="features" className="features-section page-width" aria-labelledby="features-title">
        <div className="section-heading">
          <div><p className="eyebrow">БОЛЬШЕ ПОНИМАНИЯ</p><h2 id="features-title">Каждая цифра.<br />На своём месте.</h2></div>
          <p>От исходных данных до уверенного выбора.<br />С инструментами, которые раскрывают картину.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-panel feature-light">
            <ChartNoAxesCombined size={28} strokeWidth={1.6} aria-hidden />
            <h3>Баланс, который<br />можно увидеть.</h3>
            <p>Эффективная граница показывает соотношение риска и доходности. Найдите точку, которая подходит вашей стратегии.</p>
            <div className="feature-line-art" aria-hidden>
              <svg viewBox="0 0 440 140"><path d="M0 135C55 135 67 81 135 69S277 19 440 12" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M0 139C83 139 114 107 193 98S329 65 440 68" fill="none" stroke="currentColor" strokeWidth="2" opacity=".16" /><circle cx="135" cy="69" r="7" fill="currentColor" /><circle cx="135" cy="69" r="17" fill="currentColor" opacity=".1" /></svg>
            </div>
          </article>
          <article className="feature-panel feature-dark">
            <Layers3 size={28} strokeWidth={1.6} aria-hidden />
            <h3>Разные стратегии.<br />Одна ясная картина.</h3>
            <p>Сравнивайте до пяти портфелей. Доходность, волатильность и просадка — рядом, с учётом инфляции.</p>
            <div className="feature-bars" aria-hidden>{[58, 82, 68, 100, 76].map((h, i) => <div key={i} style={{ height: `${h}%` }}><span /></div>)}</div>
          </article>
        </div>
        <div className="capability-strip">
          <span><Check size={16} aria-hidden />4 режима оптимизации</span>
          <span><Check size={16} aria-hidden />Реальная доходность</span>
          <span><Check size={16} aria-hidden />Экспорт Excel и CSV</span>
          <span><Check size={16} aria-hidden />Светлая и тёмная темы</span>
        </div>
      </section>
      <section id="start" className="start-section page-width" aria-labelledby="start-title">
        <div className="section-heading">
          <div><p className="eyebrow">ПЕРВЫЙ ШАГ</p><h2 id="start-title">Начните<br />с ваших данных.</h2></div>
          <p>Загрузите готовый файл или выберите тикеры.<br />Остальное — в рабочем пространстве.</p>
        </div>
        {feedback}
        <div className="import-layout">
          <div className="import-card">{dataSource}</div>
          <div className="import-guide">
            <span className="guide-icon"><SlidersHorizontal size={24} strokeWidth={1.6} aria-hidden /></span>
            <h3>Всё готово<br />к большому разбору.</h3>
            <p>Для расчёта нужны 10 индикаторов и не менее 30 наблюдений. Первый индикатор — рублёвая денежная масса M2.</p>
            <div className="file-structure"><div><span>A</span><p>Даты или периоды</p></div><div><span>B — K</span><p>Доходности 10 индикаторов</p></div></div>
            <Button variant="ghost" className="demo-link" onClick={onDemo}>Пока нет файла? Откройте пример <ArrowRight size={15} aria-hidden /></Button>
            <p className="guide-note">Пример использует синтетические данные для знакомства с интерфейсом.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductPreview() {
  return (
    <figure className="product-figure">
      <div className="product-window" aria-hidden="true">
        <div className="window-toolbar"><div className="window-dots"><i /><i /><i /></div><span>Portfolio</span><span className="window-toolbar-end">Аналитика</span></div>
        <div className="preview-layout">
          <div className="preview-sidebar">
            <p className="preview-wordmark">Общая картина</p>
            <div className="preview-nav-item selected"><ChartNoAxesCombined size={15} />Аналитика</div>
            <div className="preview-nav-item"><Layers3 size={15} />Портфели</div>
            <div className="preview-nav-item"><SlidersHorizontal size={15} />Параметры</div>
            <div className="preview-sidebar-bottom"><span className="status-dot" />10 индикаторов</div>
          </div>
          <div className="preview-content">
            <div className="preview-heading"><div><p>ВАША СТРАТЕГИЯ</p><h3>Всё складывается.</h3></div><span className="preview-badge">Обзор портфеля</span></div>
            <div className="preview-chart-grid">
              <div className="preview-frontier"><div className="preview-card-header"><span>Эффективная граница</span><span>Риск / Доходность</span></div><PreviewChart /><div className="preview-chart-key"><i />Эффективная граница <i />Возможные портфели</div></div>
              <div className="preview-allocation"><div className="preview-card-header"><span>Структура портфеля</span></div><div className="preview-ring"><div><strong>10</strong><span>индикаторов</span></div></div><div className="preview-allocation-key"><span><i />Акции</span><span><i />Облигации</span><span><i />Другие активы</span></div></div>
            </div>
            <div className="preview-bottom"><span><Check size={13} />Доходность с учётом инфляции</span><span>Каждая деталь имеет значение.</span></div>
          </div>
        </div>
      </div>
      <figcaption>Иллюстрация интерфейса. Ваши показатели появятся после загрузки данных.</figcaption>
    </figure>
  );
}

function PreviewChart() {
  return (
    <svg className="preview-chart" viewBox="0 0 570 285" fill="none">
      <defs><linearGradient id="preview-area" x1="0" y1="20" x2="0" y2="255" gradientUnits="userSpaceOnUse"><stop stopColor="#0071e3" stopOpacity=".12" /><stop offset="1" stopColor="#0071e3" stopOpacity="0" /></linearGradient></defs>
      {[55, 112, 170, 228].map((y) => <path key={y} d={`M48 ${y}H553`} stroke="currentColor" opacity=".08" />)}
      {[0, 1, 2, 3].map((n) => <text key={n} x="9" y={232 - n * 58} fill="currentColor" opacity=".4" fontSize="11">{n * 10}%</text>)}
      {[0, 1, 2, 3, 4].map((n) => <text key={n} x={47 + n * 119} y="263" fill="currentColor" opacity=".4" fontSize="11">{n * 5}%</text>)}
      {Array.from({ length: 88 }, (_, i) => {
        const x = 70 + ((i * 73) % 455);
        const boundary = 195 - 125 * Math.sqrt((x - 65) / 460);
        return <circle key={i} cx={x} cy={boundary + 18 + ((i * 29) % 80)} r="2.8" fill="#0071e3" opacity={0.08 + (i % 4) * 0.06} />;
      })}
      <path d="M70 207C92 127 168 97 267 66S440 31 547 25V230H70Z" fill="url(#preview-area)" />
      <path d="M70 207C92 127 168 97 267 66S440 31 547 25" stroke="#0071e3" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="208" cy="85" r="18" fill="#0071e3" opacity=".1" /><circle cx="208" cy="85" r="6" fill="#0071e3" stroke="white" strokeWidth="3" />
      <text x="264" y="282" fill="currentColor" opacity=".4" fontSize="10">Волатильность</text>
    </svg>
  );
}
