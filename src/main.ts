// Reads the form, runs the calculation, and redraws the result on every input.

import { calculate, NATIONAL, TAX_YEAR, type Inputs, type Level, type WageData } from "./calc.ts";

const LEVEL_NAMES: Record<Level, string> = { entry: "Entry", mid: "Mid", senior: "Senior" };
const MAX_HOURS = 80;
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const rateFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = byId<HTMLFormElement>("form");
const areaSelect = byId<HTMLSelectElement>("area");
const levelSelect = byId<HTMLSelectElement>("level");
const rolesBox = byId<HTMLDivElement>("roles");
const roleTemplate = byId<HTMLTemplateElement>("role-template");
const prompt = byId<HTMLParagraphElement>("prompt");
const result = byId<HTMLElement>("result");

let data: WageData;

async function start(): Promise<void> {
  try {
    const response = await fetch("wages.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch {
    prompt.textContent = "Could not load wage data. Refresh the page to try again.";
    return;
  }

  const areas = Object.entries(data.areas).filter(([code]) => code !== NATIONAL);
  addOptions(areaSelect, areas.map(([code, area]) => [code, area.name]));
  byId("data-period").textContent = data.period;
  byId("tax-year").textContent = String(TAX_YEAR);

  addRole();
  byId("add-role").addEventListener("click", () => {
    addRole();
    render();
  });
  rolesBox.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest(".remove");
    if (button) {
      button.closest(".role")!.remove();
      render();
    }
  });
  form.addEventListener("input", render);
  byId("print").addEventListener("click", () => window.print());
  prompt.textContent = "Choose a state and an occupation to see a salary.";
  render();
}

function addOptions(select: HTMLSelectElement, options: [string, string][]): void {
  for (const [value, label] of options.sort((a, b) => a[1].localeCompare(b[1]))) {
    select.add(new Option(label, value));
  }
}

function addRole(): void {
  const row = roleTemplate.content.cloneNode(true) as DocumentFragment;
  addOptions(row.querySelector("select")!, Object.entries(data.occupations));
  rolesBox.append(row);
}

// Blank money fields are null, meaning not entered yet.
function money(id: string): number | null {
  const value = byId<HTMLInputElement>(id).valueAsNumber;
  return Number.isNaN(value) ? null : Math.max(0, value);
}

function readInputs(): Inputs {
  const roles = [...rolesBox.querySelectorAll(".role")]
    .map((row) => ({
      soc: row.querySelector("select")!.value,
      hoursPerWeek: Math.min(MAX_HOURS, Math.max(0, row.querySelector("input")!.valueAsNumber || 0)),
    }))
    .filter((role) => role.soc !== "");
  return {
    area: areaSelect.value,
    level: levelSelect.value as Level,
    roles,
    currentSalary: money("current-salary"),
    distributions: money("distributions"),
  };
}

function render(): void {
  const inputs = readInputs();
  const ready = inputs.area !== "" && inputs.roles.length > 0;
  prompt.hidden = ready;
  result.hidden = !ready;
  if (!ready) return;

  const r = calculate(data, inputs);
  const areaName = data.areas[inputs.area].name;

  byId("report-header").textContent =
    `Reasonable salary report for ${areaName}, ${LEVEL_NAMES[inputs.level]} experience. Prepared ${new Date().toLocaleDateString()}.`;
  byId("salary").textContent = dollars.format(r.salary);

  const capNote = byId("cap-note");
  capNote.hidden = !r.capped;
  capNote.textContent = `Capped at the ${dollars.format(r.salary)} you took out of the business. Your roles total ${dollars.format(r.total)}.`;

  byId("tax-line").textContent =
    `Payroll tax at this salary: ${dollars.format(r.taxAtSalary)} a year.` +
    (r.taxAtCurrent === null ? "" : ` At your current salary: ${dollars.format(r.taxAtCurrent)}.`);

  const tbody = byId("breakdown");
  tbody.replaceChildren(
    ...r.roles.map((role) => {
      const marker = (role.source === "national" ? " *" : "") + (role.topCoded ? " †" : "");
      const rate = role.rate === null ? "No data" : (role.topCoded ? "at least " : "") + rateFormat.format(role.rate) + marker;
      const tr = document.createElement("tr");
      tr.append(
        cell(data.occupations[role.soc], role.soc),
        cell(String(role.hoursPerWeek), null, true),
        cell(rate, null, true),
        cell(dollars.format(role.cost), null, true),
      );
      return tr;
    }),
  );

  const notes: string[] = [];
  if (r.roles.some((role) => role.source === "national")) notes.push(`* National rate: BLS publishes no ${areaName} wage for this occupation.`);
  if (r.roles.some((role) => role.topCoded)) notes.push("† BLS reports this wage only as at least this amount.");
  if (r.roles.some((role) => role.source === "missing")) notes.push("No data: BLS publishes no wage for this occupation. Choose a similar one.");
  byId("legend").textContent = notes.join(" ");
}

function cell(text: string, socCode: string | null, numeric = false): HTMLTableCellElement {
  const td = document.createElement("td");
  td.textContent = text;
  if (numeric) td.className = "num";
  if (socCode) {
    const code = document.createElement("span");
    code.className = "soc-code";
    code.textContent = ` ${socCode}`;
    td.append(code);
  }
  return td;
}

start();
