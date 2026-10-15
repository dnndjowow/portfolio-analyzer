import { Check, Trash2 } from "lucide-react";
import type { Portfolio } from "@/types";
import { MODE_LABEL } from "@/types";
import { cn, PORTFOLIO_COLORS } from "@/lib/utils";

export function PortfolioList({ items, activeId, compareIds, onOpen, onToggleCompare, onDelete, onRename }: {
  items: Portfolio[]; activeId: string | null; compareIds: string[];
  onOpen: (id: string) => void; onToggleCompare: (id: string) => void; onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  if (!items.length) {
    return <p className="pf-empty">Пока пусто. Выберите цель выше и нажмите «Построить портфель» — он появится здесь.</p>;
  }
  const full = compareIds.length >= 5;
  return (
    <ul className="pf-list">
      {items.map((p) => {
        const ci = compareIds.indexOf(p.id);
        const inCompare = ci >= 0;
        const color = inCompare ? PORTFOLIO_COLORS[ci % PORTFOLIO_COLORS.length] : undefined;
        return (
          <li key={p.id} className={cn("pf-item", p.id === activeId && "is-active")}>
            <div className="pf-top">
              <button type="button" role="checkbox" aria-checked={inCompare}
                aria-label={inCompare ? `Убрать «${p.name}» из сравнения` : `Добавить «${p.name}» в сравнение`}
                title={inCompare ? "Убрать из сравнения" : full ? "В сравнении уже 5 портфелей" : "Добавить в сравнение"}
                disabled={!inCompare && full}
                onClick={() => onToggleCompare(p.id)}
                className="pf-check" style={color ? { background: color, borderColor: color } : undefined}>
                <Check size={13} strokeWidth={3} aria-hidden />
              </button>
              <input aria-label="Название портфеля" value={p.name}
                onChange={(e) => onRename(p.id, e.target.value)} onFocus={() => onOpen(p.id)}
                className="pf-name" />
              <button type="button" className="pf-delete" aria-label={`Удалить «${p.name}»`} title="Удалить" onClick={() => onDelete(p.id)}>
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
            <button type="button" className="pf-open" aria-pressed={p.id === activeId} onClick={() => onOpen(p.id)}
              aria-label={`Показать состав портфеля «${p.name}»`}>
              {MODE_LABEL[p.mode]}{p.params && `, ${p.params}`}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
