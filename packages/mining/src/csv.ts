// Lectura de event logs en CSV/TSV (RFC 4180).

export interface TablaCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Separa una línea respetando comillas dobles, comillas escapadas ("") y separadores entre comillas. */
export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

/** Tabla con cabeceras; usa tabulador si hay tabuladores y ninguna coma. */
export function parseCsv(text: string): TablaCsv {
  const sep = (text.indexOf('\t') > -1 && text.indexOf(',') === -1) ? '\t' : ',';
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]!, sep).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => {
    const cells = parseCsvLine(l, sep);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
    return obj;
  });
  return { headers, rows };
}

export interface MapeoColumnas {
  case: string;
  act: string;
  ts: string;
  /** Columna de recurso/rol; vacío si no hay. */
  res?: string;
}

/** Columnas que el importador propone por nombre (case/activity/timestamp/resource). */
export function adivinarMapeo(headers: readonly string[]): Required<MapeoColumnas> {
  const guess = (kw: string[]) => headers.find((h) => kw.some((k) => h.toLowerCase().includes(k))) || headers[0] || '';
  const res = headers.find((h) => ['user', 'res', 'owner', 'role', 'rol', 'responsab'].some((k) => h.toLowerCase().includes(k)));
  return {
    case: guess(['case', 'id']),
    act: guess(['act', 'task', 'event', 'step']),
    ts: guess(['time', 'date', 'fecha', 'ts']),
    res: res || ''
  };
}
