import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, payrollTax, type Inputs, type WageData } from "./calc.ts";

const data: WageData = {
  period: "May 2025",
  topCode: 115,
  occupations: { "11-1021": "General and Operations Managers", "43-3031": "Bookkeepers", "23-1011": "Lawyers" },
  areas: {
    US: { name: "United States", wages: { "11-1021": [40, 50, 60], "43-3031": [20, 25, 30], "23-1011": null } },
    WY: { name: "Wyoming", wages: { "11-1021": [45, 55, 115], "43-3031": null, "23-1011": null } },
  },
};

function inputs(overrides: Partial<Inputs>): Inputs {
  return { area: "US", level: "mid", roles: [], currentSalary: null, distributions: null, ...overrides };
}

test("single role: rate x hours x 52", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }] }));
  assert.equal(r.salary, 104_000);
  assert.equal(r.roles[0].rate, 50);
  assert.equal(r.roles[0].source, "state");
});

test("two roles sum", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 20 }, { soc: "43-3031", hoursPerWeek: 20 }] }));
  assert.equal(r.salary, 78_000); // 50*20*52 + 25*20*52
});

test("experience level picks 25th, 50th, 75th percentile", () => {
  const role = [{ soc: "11-1021", hoursPerWeek: 1 }];
  assert.equal(calculate(data, inputs({ level: "entry", roles: role })).roles[0].rate, 40);
  assert.equal(calculate(data, inputs({ level: "mid", roles: role })).roles[0].rate, 50);
  assert.equal(calculate(data, inputs({ level: "senior", roles: role })).roles[0].rate, 60);
});

test("AE1: cash taken below salary is reported, salary unchanged", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], currentSalary: 20_000, distributions: 50_000 }));
  assert.equal(r.salary, 104_000);
  assert.equal(r.cashTaken, 70_000);
});

test("cash taken above salary: no note", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], currentSalary: 50_000, distributions: 100_000 }));
  assert.equal(r.salary, 104_000);
  assert.equal(r.cashTaken, null);
});

test("$50 salary and $50 distributions: salary stays at role value, $100 reported", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], currentSalary: 50, distributions: 50 }));
  assert.equal(r.salary, 104_000);
  assert.equal(r.cashTaken, 100);
});

test("cash taken entered as zero: $0 reported", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], currentSalary: 0, distributions: 0 }));
  assert.equal(r.cashTaken, 0);
});

test("salary entered, distributions blank: no note", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], currentSalary: 1 }));
  assert.equal(r.salary, 104_000);
  assert.equal(r.cashTaken, null);
  assert.equal(r.taxAtCurrent, payrollTax(1));
});

test("distributions entered, salary blank: distributions reported", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], distributions: 30_000 }));
  assert.equal(r.cashTaken, 30_000);
});

test("both money fields blank: no note", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }] }));
  assert.equal(r.salary, 104_000);
  assert.equal(r.cashTaken, null);
});

test("AE2: suppressed state wage falls back to national", () => {
  const r = calculate(data, inputs({ area: "WY", roles: [{ soc: "43-3031", hoursPerWeek: 40 }] }));
  assert.equal(r.roles[0].rate, 25);
  assert.equal(r.roles[0].source, "national");
  assert.equal(r.salary, 52_000);
});

test("state and national both missing: cost 0, flagged, no throw", () => {
  const r = calculate(data, inputs({ area: "WY", roles: [{ soc: "23-1011", hoursPerWeek: 40 }] }));
  assert.equal(r.roles[0].rate, null);
  assert.equal(r.roles[0].source, "missing");
  assert.equal(r.salary, 0);
});

test("top-coded rate is flagged", () => {
  const r = calculate(data, inputs({ area: "WY", level: "senior", roles: [{ soc: "11-1021", hoursPerWeek: 1 }] }));
  assert.equal(r.roles[0].topCoded, true);
  assert.equal(calculate(data, inputs({ area: "WY", roles: [{ soc: "11-1021", hoursPerWeek: 1 }] })).roles[0].topCoded, false);
});

test("published wage above the top code is not flagged", () => {
  const high: WageData = { ...data, areas: { ...data.areas, WY: { name: "Wyoming", wages: { "11-1021": [45, 55, 133.24] } } } };
  const r = calculate(high, inputs({ area: "WY", level: "senior", roles: [{ soc: "11-1021", hoursPerWeek: 1 }] }));
  assert.equal(r.roles[0].topCoded, false);
});

test("no roles: salary 0", () => {
  const r = calculate(data, inputs({}));
  assert.equal(r.salary, 0);
  assert.equal(r.cashTaken, null);
});

test("role with 0 hours contributes 0", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 0 }, { soc: "43-3031", hoursPerWeek: 40 }] }));
  assert.equal(r.salary, 52_000);
});

test("tax at recommended and current salary", () => {
  const r = calculate(data, inputs({ roles: [{ soc: "11-1021", hoursPerWeek: 40 }], currentSalary: 30_000, distributions: 200_000 }));
  assert.equal(r.taxAtSalary, payrollTax(104_000));
  assert.equal(r.taxAtCurrent, payrollTax(30_000));
  assert.equal(calculate(data, inputs({})).taxAtCurrent, null);
});

test("AE3: payroll tax at 190,000", () => {
  assert.equal(payrollTax(190_000), 28_388);
});

test("AE4: payroll tax at 250,000", () => {
  assert.equal(payrollTax(250_000), 30_578);
});

test("payroll tax edges", () => {
  assert.equal(payrollTax(0), 0);
  assert.equal(payrollTax(184_500), 22_878 + 5_350.5);
  assert.equal(payrollTax(100_000), 15_300);
});
