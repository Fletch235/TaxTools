# S Corp Reasonable Salary Calculator

A one-page static site. It estimates a reasonable W-2 salary for an S corp owner with the IRS cost approach: each role the owner fills is priced at the BLS wage for that occupation in their state, then summed.

No framework and no runtime dependencies. TypeScript compiles `src/` into `public/`, and `public/` is the whole site.

On Windows PowerShell, run `npm.cmd` and `npx.cmd` instead of `npm` and `npx` if script execution is disabled.

## Run locally

```sh
npm install
npm run build
npx serve public
```

Open the URL `serve` prints. The page uses ES modules and `fetch`, so opening `index.html` from disk does not work.

## Test

```sh
npm test
```

## Yearly updates

### Wage data (each spring, when BLS publishes a new May release)

1. Go to <https://www.bls.gov/oes/tables.htm> and download the **State** and **National** XLSX zips for the newest release (for May 2025: `oesm25st.zip` and `oesm25nat.zip`).
2. Open each XLSX in Excel, LibreOffice, or Google Sheets and save the data sheet as CSV:
   - state file to `data/raw/state.csv`
   - national file to `data/raw/national.csv`
3. In `scripts/build-wages.ts`, update `PERIOD`. Check the file's "Field Descriptions" sheet for the `#` top-code hourly wage and update `TOP_CODE`.
4. Run `npm run wages`. It fails with a clear message if a column or starter occupation is missing.
5. Review the diff of `public/wages.json` and commit it. `data/raw/` is not committed.

The occupation list lives in `OCCUPATIONS` in `scripts/build-wages.ts`.

### Payroll tax (each January)

Update `TAX_YEAR` and the rate constants at the top of `src/calc.ts`. The 2027 Social Security wage base is $192,300.

## Deploy (Vercel Hobby)

1. Push this repo to GitHub.
2. In Vercel, import the repo. Framework preset: **Other**. Keep the default build command (`npm run build`) and output directory (`public`).

The Hobby plan is for non-commercial use only. The referral link is fine while referrals are unpaid. Before earning referral fees, client revenue, or ad income from the site, move to Vercel Pro or a host that allows commercial use on its free plan, such as Cloudflare Pages.
