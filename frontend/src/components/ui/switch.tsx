export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} className="switch-row">
      <span>{label}</span>
      <button id={id} role="switch" aria-checked={checked} type="button" onClick={() => onChange(!checked)} className="switch">
        <span />
      </button>
    </label>
  );
}
