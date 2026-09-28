import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, options, onChange, label }:
  { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-bg p-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} type="button" onClick={() => onChange(o.value)}
          className={cn("rounded-[5px] px-3 py-1 text-[13px]", value === o.value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
