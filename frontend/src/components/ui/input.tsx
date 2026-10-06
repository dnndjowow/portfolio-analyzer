import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref}
      className={cn("h-11 w-full min-w-0 rounded-md border border-line bg-surface px-3 text-sm num transition-shadow placeholder:text-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/10 disabled:opacity-50", className)}
      {...props} />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn("h-11 w-full min-w-0 rounded-md border border-line bg-surface px-3 pr-6 text-sm transition-shadow focus:border-accent focus:ring-4 focus:ring-accent/10", className)} {...props} />
  ),
);
Select.displayName = "Select";

export const Label = ({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1.5 block text-[12px] font-medium text-muted", className)} {...p} />
);
