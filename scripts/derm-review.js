/**
 * Dermatologist sign-off for the knowledge base.
 *
 *   npm run derm-review:export            → derm-review-sheet.csv (open in Excel / Google Sheets)
 *   npm run derm-review:import -- <file>  → writes the decisions into data/derm-validation.json
 *
 * The sheet lists every ingredient with the claim the app makes, the evidence summary and its
 * sources. The reviewing dermatologist fills: decision (approved | approved_with_changes |
 * rejected), comments, name, PRC license no. and date. Rows left blank stay "pending".
 * A "rejected" ingredient is never recommended by the app (utils/knowledge.ts).
 */
const fs = require("fs");
const path = require("path");

// npm scripts run from the project root.
const ROOT = process.cwd();
const EVIDENCE_FILE = path.join(ROOT, "data/derm-validation.json");
const KNOWLEDGE_FILE = path.join(ROOT, "data/knowledge.json");
const DECISIONS = ["approved", "approved_with_changes", "rejected"];
const COLUMNS = [
  "ingredient",
  "used_for",
  "evidence_level",
  "claim_shown_in_app",
  "evidence_summary",
  "sources",
  "decision",
  "comments",
  "reviewer_name",
  "prc_license_no",
  "review_date",
];

/** 2-space JSON with short string arrays kept on one line (the dataset's existing style). */
function formatJson(value) {
  const text = JSON.stringify(value, null, 2).replace(/\[\n(\s+"[^"\n]*",?\n)+\s*\]/g, (m) => {
    const one =
      "[" +
      JSON.parse(m)
        .map((x) => JSON.stringify(x))
        .join(", ") +
      "]";
    return one.length <= 80 ? one : m;
  });
  return text + "\n";
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/** RFC 4180 parser: quoted fields may contain commas, quotes ("") and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function exportSheet(outFile) {
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf8"));
  const knowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf8"));
  const claims = new Map(knowledge.ingredients.map((i) => [i.name, i]));
  const lines = [COLUMNS.map(csvCell).join(",")];
  for (const e of evidence.ingredients) {
    const k = claims.get(e.name);
    const r = e.review ?? {};
    lines.push(
      [
        e.name,
        (k?.concerns ?? []).join(", "),
        e.level,
        k?.description ?? "",
        e.evidence,
        e.sources.map((s) => `[${s.type}] ${s.name} — ${s.url}`).join("\n"),
        r.status && r.status !== "pending" ? r.status : "",
        r.notes ?? "",
        r.reviewer ?? "",
        r.licenseNo ?? "",
        r.date ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  // BOM so Excel opens the file as UTF-8 (en dashes, accents).
  fs.writeFileSync(outFile, "﻿" + lines.join("\r\n") + "\r\n");
  console.log(`Wrote ${evidence.ingredients.length} rows to ${outFile}`);
}

function importSheet(inFile) {
  const rows = parseCsv(fs.readFileSync(inFile, "utf8"));
  const header = rows.shift().map((h) => h.trim().toLowerCase());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Column "${name}" is missing from ${inFile}`);
    return i;
  };
  const idx = Object.fromEntries(COLUMNS.map((c) => [c, col(c)]));
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf8"));
  const byName = new Map(evidence.ingredients.map((e) => [e.name, e]));
  const errors = [];
  let applied = 0;
  for (const [n, r] of rows.entries()) {
    const name = r[idx.ingredient]?.trim();
    const decision = r[idx.decision]?.trim().toLowerCase();
    if (!decision) continue;
    const line = `row ${n + 2} (${name})`;
    const entry = byName.get(name);
    if (!entry) {
      errors.push(`${line}: unknown ingredient`);
      continue;
    }
    if (!DECISIONS.includes(decision)) {
      errors.push(`${line}: decision must be one of ${DECISIONS.join(", ")}`);
      continue;
    }
    const reviewer = r[idx.reviewer_name]?.trim();
    const licenseNo = r[idx.prc_license_no]?.trim();
    const date = r[idx.review_date]?.trim();
    // A sign-off without a named, licensed reviewer and a date is not a sign-off.
    if (!reviewer || !licenseNo || !date) {
      errors.push(`${line}: reviewer_name, prc_license_no and review_date are required`);
      continue;
    }
    const comments = r[idx.comments]?.trim() || null;
    if (decision !== "approved" && !comments) {
      errors.push(`${line}: comments are required for "${decision}"`);
      continue;
    }
    entry.review = { status: decision, reviewer, licenseNo, date, notes: comments };
    applied++;
  }
  if (errors.length > 0) {
    console.error(
      "Nothing was written. Fix these rows and import again:\n- " + errors.join("\n- "),
    );
    process.exit(1);
  }
  fs.writeFileSync(EVIDENCE_FILE, formatJson(evidence));
  const pending = evidence.ingredients.filter((e) => (e.review?.status ?? "pending") === "pending");
  console.log(`Recorded ${applied} decisions. Still pending: ${pending.length}.`);
}

// Only act as a CLI when run directly (tests import parseCsv).
if (require.main === module) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === "export") exportSheet(file ?? path.join(ROOT, "derm-review-sheet.csv"));
  else if (cmd === "import" && file) importSheet(file);
  else {
    console.error("Usage: node scripts/derm-review.js export [out.csv] | import <file.csv>");
    process.exit(1);
  }
}

module.exports = { parseCsv };
