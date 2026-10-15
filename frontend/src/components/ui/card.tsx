import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLElement>) => (
  <section className={cn("panel", className)} {...p} />
);

export function CardHeader({ title, sub, aside, className }: {
  title: React.ReactNode; sub?: React.ReactNode; aside?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("panel-head", className)}>
      <div className="min-w-0">
        <h2 className="panel-title">{title}</h2>
        {sub && <p className="panel-sub">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("panel-body", className)} {...p} />
);
