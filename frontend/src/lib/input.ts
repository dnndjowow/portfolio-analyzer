const NUMBER = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i;

function numberValue(text: string): number | null {
  const clean = text.trim().replace(/[ \u00a0\u202f]/g, "");
  if (!NUMBER.test(clean)) return null;
  const value = Number(clean.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function parsePct(text: string): number | null {
  const value = numberValue(text);
  return value === null ? null : value / 100;
}

function fields(line: string, delimiter: string | null): string[] {
  const result: string[] = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      result.push(value.trim()); value = "";
    } else value += char;
  }
  if (quoted) throw new Error("В CSV не закрыты кавычки.");
  result.push(value.trim());
  return result;
}

const HEADER = /^(?:инфляция|ипц|значение|ставка|inflation|value|rate)(?:\s*[,()]?\s*%)?$/i;

export function parseInflationSeries(text: string): number[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n?|\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Файл инфляции пуст.");
  const onlySingleColumn = lines.every(line => {
    const cell = fields(line, null)[0];
    return numberValue(cell) !== null || HEADER.test(cell);
  });
  const delimiter = lines.some(line => line.includes(";")) ? ";"
    : lines.some(line => line.includes("\t")) ? "\t"
    : !onlySingleColumn && lines.some(line => line.includes(",")) ? "," : null;
  const values: number[] = [];
  let width: number | null = null;
  for (const [position, line] of lines.entries()) {
    const cells = fields(line, delimiter);
    if (cells.length > 2 || (width !== null && cells.length !== width)) {
      throw new Error(`Строка ${position + 1}: нужен один столбец инфляции или два столбца «дата;инфляция». Для дробей с запятой используйте разделитель «;».`);
    }
    width = cells.length;
    const cell = cells[cells.length - 1];
    if (position === 0 && HEADER.test(cell)) continue;
    const value = numberValue(cell);
    if (value === null) throw new Error(`Строка ${position + 1}: укажите числовое значение инфляции без знака %.`);
    values.push(value);
  }
  if (!values.length) throw new Error("В файле нет значений инфляции.");
  return values;
}
