/** Small helpers for writing the tables (CSV) and the pages (HTML). */

export type Cell = string | number | boolean | null | undefined;

export const esc = (text: unknown) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * A table as CSV text that a spreadsheet opens correctly: quoted where
 * needed, marked as UTF-8 so names with accents survive, and with any cell
 * that a spreadsheet would run as a formula (people type their own names
 * and titles) made into plain text.
 */
export function csv(head: string[], rows: Cell[][]) {
  const cell = (value: Cell) => {
    if (value === null || value === undefined) return "";
    let text = typeof value === "number" ? String(Math.round(value * 100) / 100) : String(value);
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [head, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "–");
export const num = (n: number) => n.toLocaleString("en-US");
export const fixed = (n: number | null, places = 2) => (n === null ? "–" : n.toFixed(places));
export const duration = (s: number) =>
  s < 90 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
export const bostonDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const bostonTime = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

/** A share drawn as a bar, with the number beside it. */
export const bar = (part: number, whole: number) =>
  `<span class="bar"><span style="width:${whole ? Math.round((100 * part) / whole) : 0}%"></span></span>`;

/** A share as a bar and a percentage that line up down a column. */
export const share = (part: number, whole: number): Html =>
  raw(`${bar(part, whole)}<span class="pc">${pct(part, whole)}</span>`);

/**
 * An HTML table. Cells are escaped unless they are wrapped with `raw()`.
 * Columns from `numbersFrom` onward are right-aligned.
 */
export type Html = { html: string };
export const raw = (html: string): Html => ({ html });
export function table(head: string[], rows: (Cell | Html)[][], numbersFrom = 1) {
  if (rows.length === 0) return `<p class="muted">Nothing to show.</p>`;
  const td = (value: Cell | Html, i: number) =>
    `<td${i >= numbersFrom ? ' class="num"' : ""}>${
      value !== null && typeof value === "object" ? value.html : esc(typeof value === "number" ? num(value) : value)
    }</td>`;
  return `<div class="scroll"><table><thead><tr>${head
    .map((h, i) => `<th${i >= numbersFrom ? ' class="num"' : ""}>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(td).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/** Counts of one answer, most common first, as rows with a bar. */
export function tally<T>(items: T[], key: (item: T) => string | string[], name: (value: string) => string = (v) => v) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const values = key(item);
    for (const value of Array.isArray(values) ? values : [values]) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, n]) => [name(value) || "(not answered)", n, share(n, items.length)]);
}

export function page(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --line:#d9d6cc; --muted:#6b6a63; --bg:#f7f6f2; --card:#fff; --accent:#4d6b53; --warn:#9a3412; }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.55 -apple-system, "Segoe UI", system-ui, sans-serif; color:#1c1b18; background:var(--bg); }
  main { max-width: 1180px; margin: 0 auto; padding: 28px 20px 90px; }
  h1 { font: 600 28px/1.2 Georgia, serif; margin: 0 0 6px; }
  h2 { font: 600 21px/1.25 Georgia, serif; margin: 44px 0 6px; padding-top: 18px; border-top: 1px solid var(--line); }
  h3 { font-size: 15px; margin: 24px 0 6px; }
  p { margin: 6px 0 10px; max-width: 78ch; }
  .muted { color: var(--muted); } .small { font-size: 13px; }
  .note { background:#fbf5df; border:1px solid #ead9a3; border-radius:10px; padding:10px 14px; margin:14px 0; max-width: 90ch; }
  .stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:10px; margin: 14px 0; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; }
  .stat .label { font-size:12px; color:var(--muted); } .stat .value { font-size:22px; font-weight:600; } .stat .hint { font-size:12px; color:var(--muted); }
  .scroll { overflow-x:auto; margin: 8px 0 14px; }
  table { border-collapse: collapse; background:var(--card); border:1px solid var(--line); font-size:13.5px; min-width: 420px; }
  th, td { text-align:left; padding: 6px 12px; border-top:1px solid var(--line); vertical-align: top; }
  th { background:#efede6; border-top:0; font-size:12px; color:var(--muted); font-weight:600; }
  td.num, th.num { text-align:right; } td.num { white-space:nowrap; font-variant-numeric: tabular-nums; }
  .bar { display:inline-block; width:90px; height:9px; background:#ece9df; border-radius:5px; vertical-align:middle; margin-right:6px; overflow:hidden; }
  .bar > span { display:block; height:100%; background:var(--accent); }
  .pc { display:inline-block; width:3.1em; text-align:right; }
  td.num:has(.bar) { text-align:left; }
  nav { margin: 14px 0 0; font-size: 13.5px; } nav a { color: var(--accent); margin-right: 14px; white-space: nowrap; }
  a { color: var(--accent); }
  code { background:#efede6; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; margin: 0 0 18px; padding: 14px 18px; }
  .card h2 { border:0; margin:0 0 4px; padding:0; font-size:18px; }
  .tag { display:inline-block; font-size:11.5px; padding: 1px 8px; border-radius:999px; border:1px solid var(--line); margin: 0 4px 4px 0; background:#fff; }
  .tag.points { color: var(--accent); border-color:#c9d8cc; }
  details { margin: 8px 0; } summary { cursor:pointer; color: var(--accent); }
  .turn { border:1px solid var(--line); border-radius:10px; padding:8px 12px; margin: 8px 0; }
  .turn.user { background:#eef3ef; border-color:#c9d8cc; margin-left: 6%; } .turn.assistant { margin-right: 6%; }
  .who { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:3px; }
  .text { white-space: pre-wrap; overflow-wrap: anywhere; }
  .filters { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 10px 0; margin: 10px 0; display:flex; flex-wrap:wrap; gap:8px; align-items:center; border-bottom:1px solid var(--line); }
  .filters button { font: inherit; padding: 6px 12px; border-radius: 999px; border:1px solid var(--line); background:var(--card); cursor:pointer; }
  .filters button[aria-pressed="true"] { background: var(--accent); color:#fff; border-color: var(--accent); }
  [hidden] { display:none !important; }
  @media print { .scroll { overflow: visible; } .filters { position: static; } }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

export const stat = (label: string, value: string | number, hint = "") =>
  `<div class="stat"><div class="label">${esc(label)}</div><div class="value">${esc(
    typeof value === "number" ? num(value) : value,
  )}</div>${hint ? `<div class="hint">${esc(hint)}</div>` : ""}</div>`;
