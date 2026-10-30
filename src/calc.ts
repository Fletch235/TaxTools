// Cost-approach reasonable salary: price each role the owner fills at the
// BLS wage for that occupation, then sum. Pure functions, no DOM.

// Update every January (2027: Social Security wage base $192,300).
export const TAX_YEAR = 2026;
const SOCIAL_SECURITY_RATE = 0.124;
const SOCIAL_SECURITY_WAGE_BASE = 184_500;
const MEDICARE_RATE = 0.029;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const ADDITIONAL_MEDICARE_THRESHOLD = 200_000;

// BLS annual figures assume 2,080 hours: 40 hours x 52 weeks.
const WEEKS_PER_YEAR = 52;

export const NATIONAL = "US";

export type Level = "entry" | "mid" | "senior";
const PERCENTILE_INDEX: Record<Level, number> = { entry: 0, mid: 1, senior: 2 };

// Hourly wage at the 25th, 50th, and 75th percentile, or null when BLS suppresses it.
export type Wage = [number, number, number] | null;

export interface WageData {
  period: string;
  // Hourly rate BLS reports as "#" (at or above this value).
  topCode: number;
  occupations: Record<string, string>;
  areas: Record<string, { name: string; wages: Record<string, Wage> }>;
}

export interface Role {
  soc: string;
  hoursPerWeek: number;
}

export interface Inputs {
  area: string;
  level: Level;
  roles: Role[];
  // null means the field was left blank.
  currentSalary: number | null;
  distributions: number | null;
}

export interface RoleResult extends Role {
  rate: number | null;
  source: "state" | "national" | "missing";
  topCoded: boolean;
  cost: number;
}

export interface Result {
  roles: RoleResult[];
  total: number;
  salary: number;
  capped: boolean;
  taxAtSalary: number;
  taxAtCurrent: number | null;
}

export function calculate(data: WageData, inputs: Inputs): Result {
  const roles = inputs.roles.map((role) => priceRole(data, inputs, role));
  const total = roles.reduce((sum, role) => sum + role.cost, 0);

  // The cap needs distributions: a blank field means not entered, not $0.
  // Salary alone only feeds the tax comparison.
  const cashTaken = (inputs.currentSalary ?? 0) + (inputs.distributions ?? 0);
  const capped = inputs.distributions !== null && total > cashTaken;
  const salary = capped ? cashTaken : total;

  return {
    roles,
    total,
    salary,
    capped,
    taxAtSalary: payrollTax(salary),
    taxAtCurrent: inputs.currentSalary === null ? null : payrollTax(inputs.currentSalary),
  };
}

function priceRole(data: WageData, inputs: Inputs, role: Role): RoleResult {
  const index = PERCENTILE_INDEX[inputs.level];
  const stateWage = data.areas[inputs.area]?.wages[role.soc];
  const nationalWage = data.areas[NATIONAL]?.wages[role.soc];

  let rate: number | null = null;
  let source: RoleResult["source"] = "missing";
  if (stateWage) {
    rate = stateWage[index];
    source = "state";
  } else if (nationalWage) {
    rate = nationalWage[index];
    source = "national";
  }

  return {
    ...role,
    rate,
    source,
    // Only the "#" placeholder equals the top code; BLS publishes real wages above it.
    topCoded: rate === data.topCode,
    cost: rate === null ? 0 : rate * role.hoursPerWeek * WEEKS_PER_YEAR,
  };
}

// Employer plus employee share; an S corp owner pays both.
export function payrollTax(wages: number): number {
  const socialSecurity = SOCIAL_SECURITY_RATE * Math.min(wages, SOCIAL_SECURITY_WAGE_BASE);
  const medicare = MEDICARE_RATE * wages;
  const additionalMedicare = ADDITIONAL_MEDICARE_RATE * Math.max(0, wages - ADDITIONAL_MEDICARE_THRESHOLD);
  return Math.round((socialSecurity + medicare + additionalMedicare) * 100) / 100;
}
