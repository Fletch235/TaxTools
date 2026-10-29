import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWages, parseCsv, TOP_CODE } from "./build-wages.ts";

const state = readFileSync(new URL("fixtures/state-sample.csv", import.meta.url), "utf8");
const national = readFileSync(new URL("fixtures/national-sample.csv", import.meta.url), "utf8");
const occupations = {
  "11-1021": "General and Operations Managers",
  "43-3031": "Bookkeeping, Accounting, and Auditing Clerks",
  "25-2021": "Elementary School Teachers",
};

test("numeric percentiles become hourly wages; # becomes the top code", () => {
  const data = buildWages(state, national, occupations);
  assert.deepEqual(data.areas.WY.wages["11-1021"], [40.1, 52.25, TOP_CODE]);
  assert.equal(data.topCode, TOP_CODE);
});

test("quoted fields with commas stay in their columns", () => {
  const rows = parseCsv('a,b,c\r\n"x, y","1,234",z\r\n');
  assert.deepEqual(rows, [["a", "b", "c"], ["x, y", "1,234", "z"]]);
});

test("escaped quotes inside a quoted field", () => {
  assert.deepEqual(parseCsv('"say ""hi""",2\n'), [['say "hi"', "2"]]);
});

test("* suppression becomes null", () => {
  const data = buildWages(state, national, occupations);
  assert.equal(data.areas.WY.wages["43-3031"], null);
});

test("blank hourly with annual present converts at annual / 2080", () => {
  const data = buildWages(state, national, occupations);
  assert.deepEqual(data.areas.WY.wages["25-2021"], [26.44, 30, 33.75]);
});

test("thousands separators in numbers", () => {
  const data = buildWages(state, national, occupations);
  assert.deepEqual(data.areas.CA.wages["11-1021"], [45, 1060.5, 90]);
});

test("UTF-8 BOM on the header row", () => {
  // The BOM sits on a required column, so a missing strip fails the column check.
  const bom = String.fromCharCode(0xfeff);
  const csv = `${bom}PRIM_STATE,AREA_TITLE,OCC_CODE,H_PCT25,H_MEDIAN,H_PCT75,A_PCT25,A_MEDIAN,A_PCT75\nWY,Wyoming,11-1021,1,2,3,,,\n`;
  const data = buildWages(csv, national, occupations);
  assert.deepEqual(data.areas.WY.wages["11-1021"], [1, 2, 3]);
});

test("national figures land under US with a readable name", () => {
  const data = buildWages(state, national, occupations);
  assert.equal(data.areas.US.name, "United States");
  assert.deepEqual(data.areas.US.wages["43-3031"], [19.5, 23, 27.4]);
});

test("occupations outside the starter list are dropped", () => {
  const data = buildWages(state, national, occupations);
  assert.equal("99-9999" in data.areas.WY.wages, false);
  assert.deepEqual(Object.keys(data.occupations).sort(), Object.keys(occupations).sort());
});

test("missing required column fails with its name", () => {
  const broken = state.replace("H_MEDIAN", "H_SOMETHING");
  assert.throws(() => buildWages(broken, national, occupations), /H_MEDIAN/);
});

test("starter code missing from the national file fails with the code", () => {
  assert.throws(() => buildWages(state, national, { ...occupations, "15-1252": "Software Developers" }), /15-1252/);
});

test("headers match regardless of case", () => {
  const data = buildWages(state.replace("PRIM_STATE", "prim_state"), national, occupations);
  assert.ok(data.areas.WY);
});
