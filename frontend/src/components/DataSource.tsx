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

export function DataSource({ onLoaded, onFailure, fileName, initialTab = "file" }: {
  onLoaded: (r: UploadResult, label: string) => void;
  onFailure: (stage: DiagnosticStage, error: string, context: DiagnosticContext) => void;
  fileName?: string;
  initialTab?: "file" | "tickers";
}) {
  const [tab, setTab] = useState<"file" | "tickers">(initialTab);
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
      onLoaded(await api.loadTickers({ tickers: list, start, end: end || undefined, frequency: freq }), `Котировки: ${list.length} активов`);
    } catch (e) {
      const message = (e as Error).message;
      setErr(message);
      onFailure("tickers", message, { tickers: list, start, end: end || undefined, frequency: freq });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Segmented label="Источник данных" value={tab} onChange={setTab} full
        options={[{ value: "file", label: "Свой файл" }, { value: "tickers", label: "Тикеры" }]} />

      {tab === "file" ? (
        <div className="space-y-3">
          <div
            aria-busy={busy}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={cn("dropzone", drag && "is-dragging")}>
            <span className="dropzone-icon">
              {busy ? <LoaderCircle className="animate-spin" size={22} aria-hidden />
                : fileName ? <FileSpreadsheet size={22} strokeWidth={1.7} aria-hidden /> : <Upload size={22} strokeWidth={1.7} aria-hidden />}
            </span>
            <p className="dropzone-title">{busy ? "Читаем файл…" : fileName ?? "Перетащите файл сюда"}</p>
            <p className="dropzone-hint">Excel или CSV, от 2 до 50 активов</p>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
              {fileName ? "Выбрать другой файл" : "Выбрать файл"}
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
              onChange={(e) => { const file = e.currentTarget.files?.[0]; if (file) void handleFile(file); e.currentTarget.value = ""; }} />
          </div>
          <button type="button" onClick={downloadTemplate} className="link-button"><Download size={14} aria-hidden />Скачать пустой шаблон CSV</button>
        </div>
      ) : (
        <div>
          <div className="field">
            <Label htmlFor="tickers">Тикеры через запятую</Label>
            <textarea id="tickers" rows={3} value={tickers} onChange={(e) => setTickers(e.target.value)} className="control" spellCheck={false} />
            <p className="field-hint">С префиксом MOEX: — Мосбиржа, без него — Yahoo Finance. Берите активы в одной валюте.</p>
          </div>
          <div className="field-row">
            <div><Label htmlFor="start">С даты</Label><Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label htmlFor="end">По дату</Label><Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <p className="field-hint">Конечная дата не включается. Пусто — до сегодня.</p>
          <div className="field mt-3">
            <Label htmlFor="freq">Шаг</Label>
            <Select id="freq" value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="daily">день</option><option value="weekly">неделя</option><option value="monthly">месяц</option>
            </Select>
          </div>
          <Button className="mt-4 w-full" disabled={busy} onClick={loadTickers}>
            {busy ? <><LoaderCircle className="animate-spin" size={16} aria-hidden />Загружаем котировки…</> : "Загрузить котировки"}
          </Button>
        </div>
      )}
      {err && <p role="alert" className="form-error">{err}</p>}
      <p className="privacy-note">Если операция завершится ошибкой, её описание может быть отправлено внешнему сервису для подсказки.</p>
    </div>
  );
}

export function PreviewTable({ result }: { result: UploadResult }) {
  const { dataset, preview } = result;
  return (
    <div className="preview-table-wrap">
      <table className="preview-table">
        <thead>
          <tr>
            <th scope="col">Период</th>
            {dataset.columns.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {preview.data.map((row, i) => (
            <tr key={i}>
              <td>{preview.index[i]}</td>
              {row.map((v, j) => (
                <td key={j} className={cn(v != null && v < 0 && "is-neg")}>
                  {v == null ? "—" : v.toFixed(3).replace(".", ",").replace("-", "−")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
