import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { api, type AssistantStage, type AssistantContext } from "@/api/client";
import type { UploadResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

const DEFAULT_TICKERS = "GC=F, SPY, TLT, MOEX:IMOEX, MOEX:SBER, MOEX:GAZP, EEM, BTC-USD, VNQ";

export function DataSource({ onLoaded, onFailure, fileName }: {
  onLoaded: (r: UploadResult, label: string) => void;
  onFailure: (stage: AssistantStage, error: string, context: AssistantContext) => void;
  fileName?: string;
}) {
  const [tab, setTab] = useState<"file" | "tickers">("file");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [start, setStart] = useState("2015-01-01");
  const [freq, setFreq] = useState("monthly");
  const [m2, setM2] = useState<{ date: string; value: number }[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setBusy(true); setErr(null);
    try { onLoaded(await api.upload(f), f.name); } catch (e) {
      const message = (e as Error).message;
      setErr(message);
      onFailure("upload", message, { filename: f.name, size_bytes: f.size, mime_type: f.type });
    } finally { setBusy(false); }
  };

  const handleM2 = async (f: File) => {
    const rows = (await f.text()).split(/\r?\n/).map((l) => l.split(/[;,\t]/)).filter((r) => r.length >= 2);
    const parsed = rows
      .map(([d, v]) => ({ date: d.trim(), value: Number(v.replace(/\s/g, "").replace(",", ".")) }))
      .filter((r) => !Number.isNaN(Date.parse(r.date)) && Number.isFinite(r.value));
    setM2(parsed.length ? parsed : null);
    if (!parsed.length) setErr("В CSV с M2 не нашлось строк вида «дата;значение».");
  };

  const loadTickers = async () => {
    setBusy(true); setErr(null);
    try {
      const list = ["M2RU", ...tickers.split(/[,\s]+/).filter(Boolean)];
      onLoaded(await api.loadTickers({ tickers: list, start, frequency: freq, m2_levels: m2 }), "Тикеры");
    } catch (e) {
      const message = (e as Error).message;
      setErr(message);
      onFailure("tickers", message, { tickers: list, start, frequency: freq, m2_levels: m2 });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <Segmented label="Источник данных" value={tab} onChange={setTab}
        options={[{ value: "file", label: "Файл" }, { value: "tickers", label: "Тикеры" }]} />

      {tab === "file" ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          className={cn("rounded-md border border-dashed px-4 py-5 text-center transition-colors",
            drag ? "border-accent bg-accent/5" : "border-line")}>
          {fileName ? (
            <p className="flex items-center justify-center gap-2 text-sm font-medium">
              <FileSpreadsheet className="h-4 w-4 text-accent" aria-hidden />{fileName}
            </p>
          ) : (
            <p className="text-sm text-muted">Перетащите Excel или CSV: 10 индикаторов в столбцах B–K</p>
          )}
          <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" aria-hidden />{busy ? "Загружаю…" : fileName ? "Заменить файл" : "Выбрать файл"}
          </Button>
          <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label htmlFor="tickers">Индикаторы 2–10 (Индикатор 1 — всегда M2RU)</Label>
            <textarea id="tickers" rows={3} value={tickers} onChange={(e) => setTickers(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm" />
            <p className="mt-1 text-[12px] text-muted">Префикс MOEX: — Мосбиржа, остальное — Yahoo Finance.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="start">С даты</Label><Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label htmlFor="freq">Шаг</Label>
              <Select id="freq" value={freq} onChange={(e) => setFreq(e.target.value)}>
                <option value="daily">день</option><option value="weekly">неделя</option><option value="monthly">месяц</option>
              </Select></div>
          </div>
          <div>
            <Label htmlFor="m2">Ряд M2RU, CSV «дата;значение»</Label>
            <Input id="m2" type="file" accept=".csv,.txt" className="py-1.5 text-[13px]"
              onChange={(e) => e.target.files?.[0] && handleM2(e.target.files[0])} />
            <p className="mt-1 text-[12px] text-muted">
              {m2 ? `Загружено ${m2.length} точек M2.` : "Денежной массы нет в котировочных API — возьмите ряд на cbr.ru."}
            </p>
          </div>
          <Button className="w-full" disabled={busy} onClick={loadTickers}>{busy ? "Загружаю котировки…" : "Загрузить котировки"}</Button>
        </div>
      )}
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
