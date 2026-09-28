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
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(p.id)}>
                <input aria-label="Название портфеля" value={p.name}
                  onChange={(e) => onRename(p.id, e.target.value)} onClick={(e) => e.stopPropagation()}
                  className="w-full truncate bg-transparent text-sm font-medium focus:outline-none" />
                <span className="block truncate text-[12px] text-muted">{MODE_LABEL[p.mode]}{p.params && `, ${p.params}`}</span>
              </button>
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
