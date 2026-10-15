import { Trash2 } from "lucide-react";
import type { Portfolio } from "@/types";
import { MODE_LABEL } from "@/types";
import { Button } from "@/components/ui/button";
import { cn, PORTFOLIO_COLORS } from "@/lib/utils";

export function PortfolioList({ items, activeId, compareIds, onOpen, onToggleCompare, onDelete, onRename }: {
  items: Portfolio[]; activeId: string | null; compareIds: string[];
  onOpen: (id: string) => void; onToggleCompare: (id: string) => void; onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  if (!items.length) {
    return <p className="text-[13px] text-muted">Здесь появятся портфели после нажатия «Оптимизировать».</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((p) => {
        const ci = compareIds.indexOf(p.id);
        const inCompare = ci >= 0;
        return (
          <li key={p.id}
            className={cn("rounded-md border px-3 py-2", p.id === activeId ? "border-accent bg-accent/[0.05]" : "border-line")}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <input aria-label="Название портфеля" value={p.name}
                  onChange={(e) => onRename(p.id, e.target.value)} onFocus={() => onOpen(p.id)}
                  className="w-full truncate bg-transparent text-sm font-medium focus:outline-none" />
                <button type="button" aria-label={`Открыть портфель ${p.name}`} aria-pressed={p.id === activeId} onClick={() => onOpen(p.id)} className="block w-full truncate text-left text-[11px] text-muted hover:text-accent">{MODE_LABEL[p.mode]}{p.params && `, ${p.params}`}</button>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Удалить ${p.name}`} onClick={() => onDelete(p.id)}>
                <Trash2 className="h-4 w-4 text-muted" aria-hidden />
              </Button>
            </div>
            <button type="button" onClick={() => onToggleCompare(p.id)}
              disabled={!inCompare && compareIds.length >= 5}
              className={cn("mt-1.5 flex items-center gap-1.5 text-[12px] disabled:opacity-40",
                inCompare ? "font-medium text-ink" : "text-accent hover:underline")}>
              {inCompare && <span className="h-2 w-2 rounded-sm" style={{ background: PORTFOLIO_COLORS[ci] }} />}
              {inCompare ? "В сравнении — убрать" : "Добавить в сравнение"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
