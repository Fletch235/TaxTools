// Builds public/wages.json from BLS OEWS state and national files.
// Yearly refresh: see README. Run with `npm run wages`.

import { readFileSync, writeFileSync } from "node:fs";
import { NATIONAL, type Wage, type WageData } from "../src/calc.ts";

// Update both with each new BLS release. The top code is in the file's
// "Field Descriptions" sheet: "#" means at least this hourly wage.
const PERIOD = "May 2025";
export const TOP_CODE = 115;

const STATE_CSV = "data/raw/state.csv";
const NATIONAL_CSV = "data/raw/national.csv";
const OUTPUT = "public/wages.json";
const HOURS_PER_YEAR = 2080;

const OCCUPATIONS: Record<string, string> = {
  "11-1021": "General and Operations Managers",
  "11-2021": "Marketing Managers",
  "11-2022": "Sales Managers",
  "11-3031": "Financial Managers",
  "11-9021": "Construction Managers",
  "11-9111": "Medical and Health Services Managers",
  "13-1111": "Management Analysts",
  "13-1161": "Market Research Analysts and Marketing Specialists",
  "13-2011": "Accountants and Auditors",
  "13-2052": "Personal Financial Advisors",
  "15-1211": "Computer Systems Analysts",
  "15-1232": "Computer User Support Specialists",
  "15-1252": "Software Developers",
  "15-1254": "Web Developers",
  "17-1011": "Architects",
  "17-2051": "Civil Engineers",
  "23-1011": "Lawyers",
  "23-2011": "Paralegals and Legal Assistants",
  "27-1024": "Graphic Designers",
  "27-3031": "Public Relations Specialists",
  "27-3043": "Writers and Authors",
  "27-4021": "Photographers",
  "29-1021": "Dentists, General",
  "29-1123": "Physical Therapists",
  "29-1131": "Veterinarians",
  "29-1141": "Registered Nurses",
  "29-1171": "Nurse Practitioners",
  "35-1011": "Chefs and Head Cooks",
  "37-3011": "Landscaping and Groundskeeping Workers",
  "39-5012": "Hairdressers, Hairstylists, and Cosmetologists",
  "39-9031": "Exercise Trainers and Group Fitness Instructors",
  "41-3091": "Sales Representatives of Services",
  "41-9022": "Real Estate Sales Agents",
  "43-3031": "Bookkeeping, Accounting, and Auditing Clerks",
  "43-4051": "Customer Service Representatives",
  "43-6014": "Secretaries and Administrative Assistants",
  "47-2031": "Carpenters",
  "47-2111": "Electricians",
  "47-2152": "Plumbers, Pipefitters, and Steamfitters",
  "49-9021": "HVAC Mechanics and Installers",
  "53-3032": "Heavy and Tractor-Trailer Truck Drivers",
};

const COLUMNS = ["PRIM_STATE", "AREA_TITLE", "OCC_CODE", "H_PCT25", "H_MEDIAN", "H_PCT75", "A_PCT25", "A_MEDIAN", "A_PCT75"] as const;
type Column = (typeof COLUMNS)[number];

// Quote-aware CSV parser: handles commas and "" inside quoted fields, CRLF or LF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function readRows(text: string): Record<Column, string>[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  const index = new Map(header.map((name, i) => [name.trim().toUpperCase(), i]));
  for (const column of COLUMNS) {
    if (!index.has(column)) throw new Error(`BLS file is missing column ${column}`);
  }
  return rows
    .filter((cells) => cells.length > 1)
    .map((cells) => Object.fromEntries(COLUMNS.map((c) => [c, cells[index.get(c)!].trim()])) as Record<Column, string>);
}

// "*" suppressed, "#" top-coded, blank not published.
function parseValue(raw: string, divisor: number): number | null {
  if (raw === "#") return TOP_CODE;
  const value = Number(raw.replace(/,/g, ""));
  if (raw === "" || Number.isNaN(value)) return null;
  return Math.round((value / divisor) * 100) / 100;
}

function toWage(row: Record<Column, string>): Wage {
  const hourly = [row.H_PCT25, row.H_MEDIAN, row.H_PCT75].map((v) => parseValue(v, 1));
  if (hourly.every((v) => v !== null)) return hourly as [number, number, number];
  // Annual-only occupations publish no hourly figures.
  const annual = [row.A_PCT25, row.A_MEDIAN, row.A_PCT75].map((v) => parseValue(v, HOURS_PER_YEAR));
  if (annual.every((v) => v !== null)) return annual as [number, number, number];
  return null;
}

export function buildWages(stateCsv: string, nationalCsv: string, occupations: Record<string, string>): WageData {
  const areas: WageData["areas"] = {};
  const rows = [...readRows(nationalCsv), ...readRows(stateCsv)].filter((row) => row.OCC_CODE in occupations);
  for (const row of rows) {
    const code = row.PRIM_STATE;
    areas[code] ??= { name: code === NATIONAL ? "United States" : row.AREA_TITLE, wages: {} };
    areas[code].wages[row.OCC_CODE] = toWage(row);
  }
  for (const soc of Object.keys(occupations)) {
    if (!(soc in (areas[NATIONAL]?.wages ?? {}))) throw new Error(`Occupation ${soc} is not in the national file`);
  }
  return { period: PERIOD, topCode: TOP_CODE, occupations: sortKeys(occupations), areas: sortAreas(areas) };
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

function sortAreas(areas: WageData["areas"]): WageData["areas"] {
  return sortKeys(Object.fromEntries(Object.entries(areas).map(([code, area]) => [code, { name: area.name, wages: sortKeys(area.wages) }])));
}

// Two-space JSON with each wage array kept on one line, for readable yearly diffs.
function format(data: WageData): string {
  return JSON.stringify(data, null, 2).replace(/\[\s+([^[\]]*?)\s+\]/g, (_, inner: string) => `[${inner.replace(/\s+/g, " ")}]`) + "\n";
}

if (import.meta.main) {
  const data = buildWages(readFileSync(STATE_CSV, "utf8"), readFileSync(NATIONAL_CSV, "utf8"), OCCUPATIONS);
  writeFileSync(OUTPUT, format(data));
  console.log(`Wrote ${OUTPUT}: ${Object.keys(data.areas).length} areas, ${Object.keys(data.occupations).length} occupations, ${PERIOD}.`);
}
