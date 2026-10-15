import { useRef, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { api, type DiagnosticStage, type DiagnosticContext } from "@/api/client";
import type { UploadResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { downloadTemplate, MARKET_EXAMPLE } from "@/lib/market";

const DEFAULT_TICKERS = MARKET_EXAMPLE.tickers.join(", ");

export function DataSource({ onLoaded, onFailure, fileName }: {
  onLoaded: (r: UploadResult, label: string) => void;
  onFailure: (stage: DiagnosticStage, error: string, context: DiagnosticContext) => void;
  fileName?: string;
}) {
  const [tab, setTab] = useState<"file" | "tickers">("tickers");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [start, setStart] = useState("2015-01-01");
  const [freq, setFreq] = useState("monthly");
  const [end, setEnd] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (busy) return;
    setBusy(true); setErr(null);
    try { onLoaded(await api.upload(f), f.name); } catch (e) {
      const message = (e as Error).message;
      setErr(message);
      onFailure("upload", message, { filename: f.name, size_bytes: f.size, mime_type: f.type });
    } finally { setBusy(false); }
  };

  const loadTickers = async () => {
    const list = tickers.split(/[,\s]+/).filter(Boolean);
    setBusy(true); setErr(null);
    try {
      onLoaded(await api.loadTickers({ tickers: list, start, end: end || undefined, frequency: freq }), `Рыночные котировки · ${list.length} активов`);
    } catch (e) {
      const message = (e as Error).message;
      setErr(message);
      onFailure("tickers", message, { tickers: list, start, end: end || undefined, frequency: freq });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <Segmented label="Источник данных" value={tab} onChange={setTab}
        options={[{ value: "file", label: "Файл" }, { value: "tickers", label: "Тикеры" }]} />

      {tab === "file" ? (
        <div className="space-y-3">
        <div
          aria-busy={busy}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={cn("dropzone", drag && "is-dragging")}>
          <span className="dropzone-icon">{busy ? <LoaderCircle className="animate-spin" size={25} aria-hidden /> : fileName ? <FileSpreadsheet size={25} strokeWidth={1.5} aria-hidden /> : <Upload size={25} strokeWidth={1.5} aria-hidden />}</span>
          <p className="dropzone-title">{fileName ?? "Перетащите файл сюда"}</p>
          <p className="dropzone-hint">Excel или CSV · 2–50 активов, дата в столбце A</p>
          <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Загружаем…" : fileName ? "Заменить файл" : "Выбрать файл"}
          </Button>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
            onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) void handleFile(file); e.currentTarget.value = ""; }} />
        </div>
        <button type="button" onClick={downloadTemplate} className="mx-auto flex items-center gap-1.5 text-[11px] text-muted hover:text-accent"><Download size={12} aria-hidden />Скачать пустой CSV-шаблон</button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="tickers">Рыночные тикеры (от 2 до 50)</Label>
            <textarea id="tickers" rows={3} value={tickers} onChange={(e) => setTickers(e.target.value)}
              className="w-full resize-y rounded-md border border-line bg-surface px-3 py-3 text-sm transition-shadow focus:border-accent focus:ring-4 focus:ring-accent/10" />
            <p className="mt-1 text-[12px] text-muted">Префикс MOEX: — Мосбиржа, остальное — Yahoo Finance.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="end">До даты (не включая)</Label><Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div><Label htmlFor="start">С даты</Label><Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label htmlFor="freq">Шаг</Label>
              <Select id="freq" value={freq} onChange={(e) => setFreq(e.target.value)}>
                <option value="daily">день</option><option value="weekly">неделя</option><option value="monthly">месяц</option>
              </Select></div>
          </div>
          <p className="text-[12px] text-muted">Доходности рассчитываются по историческим ценам закрытия. Выбирайте активы в одной валюте; валютная конвертация не выполняется.</p>
          <Button className="w-full" disabled={busy} onClick={loadTickers}>{busy ? "Загружаю котировки…" : "Загрузить котировки"}</Button>
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-muted">При сбоях данные текущей операции могут передаваться внешнему сервису диагностики.</p>
      {err && <p role="alert" className="text-[13px] text-neg">{err}</p>}
    </div>
  );
}

export function PreviewTable({ result }: { result: UploadResult }) {
  const { dataset, preview } = result;
  return (
    <div className="max-h-[360px] overflow-auto rounded-md border border-line">
      <table className="w-full border-collapse text-[13px] num">
        <thead className="sticky top-0 bg-surface">
          <tr>
            <th className="border-b border-line px-2 py-1.5 text-left font-medium text-muted">Период</th>
            {dataset.columns.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-line px-2 py-1.5 text-right font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.data.map((row, i) => (
            <tr key={i} className="odd:bg-bg/50">
              <td className="px-2 py-1 text-muted">{preview.index[i]}</td>
              {row.map((v, j) => (
                <td key={j} className={cn("px-2 py-1 text-right", v != null && v < 0 && "text-neg")}>
                  {v == null ? "—" : v.toFixed(3).replace(".", ",")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
