import { cn } from "@/lib/utils";

export function Segmented<T extends string>({ value, options, onChange, label, full }:
  { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; full?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("seg", full && "is-full")}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} type="button" onClick={() => onChange(o.value)}
          tabIndex={value === o.value ? 0 : -1}
          onKeyDown={(event) => {
            const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
            if (!direction && !["Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const current = options.findIndex((item) => item.value === value);
            const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + direction + options.length) % options.length;
            onChange(options[next].value);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
