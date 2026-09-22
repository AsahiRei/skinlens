import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { ToastAndroid } from "react-native";

import {
  getAllProfiles,
  getAllResults,
  getLatestRoutine,
  getSensitivityHistory,
} from "@/lib/db";
import { formatter } from "@/utils/formatter";
import { getHealthScoreResponse } from "@/utils/healthscore";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  return escapeHtml(formatter(value));
}

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function generateSkinReportHtml(): Promise<string> {
  const [{ userProfile, skinProfile, lifestyleProfile }, results, routine, sensitivity] =
    await Promise.all([
      getAllProfiles(),
      getAllResults(),
      getLatestRoutine(),
      getSensitivityHistory(),
    ]);

  const latest = results[0] ?? null;
  const score = latest?.healthscore ?? 0;
  const health = getHealthScoreResponse(score, {
    skin_type: skinProfile?.skin_type ?? "",
    main_concern: skinProfile?.main_concerns ?? "",
  });

  const name =
    userProfile?.first_name ||
    userProfile?.username ||
    "SkinLens User";

  const profileRows = [
    ["Name", escapeHtml(name)],
    ["Email", escapeHtml(userProfile?.email ?? "—")],
    ["Date of Birth", fmtDate(userProfile?.age)],
    ["Gender", fmt(userProfile?.gender)],
    ["Skin Type", fmt(skinProfile?.skin_type)],
    ["Primary Concern", fmt(skinProfile?.main_concerns)],
    ["Sleep Quality", fmt(lifestyleProfile?.sleep_quality)],
    ["Stress Level", fmt(lifestyleProfile?.stress_level)],
    ["Water Intake", fmt(lifestyleProfile?.water_intake)],
  ]
    .map(
      ([label, value]) => `
        <tr>
          <td class="k">${label}</td>
          <td>${value}</td>
        </tr>`,
    )
    .join("");

  const assessmentBlock = latest
    ? `
      <div class="score-row">
        <div class="score" style="color:${health.color};border-color:${health.color}">${score}%</div>
        <div class="score-meta">
          <div class="score-label">${escapeHtml(health.label)}</div>
          <div class="score-sub">${fmt(latest.detection_label)} detection${
            latest.confidence
              ? ` · ${(latest.confidence * 100).toFixed(1)}% confidence`
              : ""
          }</div>
          <div class="score-sub">Scanned on ${fmtDate(latest.created_at)}</div>
        </div>
      </div>
      <p class="para">${escapeHtml(latest.description)}</p>`
    : `<p class="para">No scans yet. Complete a skin scan to receive an assessment.</p>`;

  const recommendations = latest?.recommendations ?? [];
  const recommendationsBlock =
    recommendations.length > 0
      ? recommendations
          .map(
            (p) => `
        <div class="item">
          <div class="item-title">${escapeHtml(p.product_type)}</div>
          <div class="chips">${p.recommended_ingredients
            .map((i) => `<span class="chip">${escapeHtml(i)}</span>`)
            .join("")}</div>
          <div class="item-note">${escapeHtml(p.reason)}</div>
        </div>`,
          )
          .join("")
      : `<p class="para">No product recommendations yet.</p>`;

  const routineBlock = routine
    ? `
      <p class="para">${escapeHtml(routine.routine.summary ?? "")}</p>
      ${(
        [
          ["Morning", routine.routine.morning_routine],
          ["Afternoon", routine.routine.afternoon_routine],
          ["Evening", routine.routine.evening_routine],
        ] as const
      )
        .map(([period, steps]) => {
          if (!steps?.length) return "";
          return `
            <div class="subhead">${period}</div>
            <ol class="steps">
              ${steps
                .map(
                  (s) => `
                <li>
                  <strong>${escapeHtml(s.product_type)}</strong> — ${escapeHtml(s.instruction)}
                  <div class="item-note">${escapeHtml(s.reason)}</div>
                </li>`,
                )
                .join("")}
            </ol>`;
        })
        .join("")}`
    : `<p class="para">No AI routine generated yet.</p>`;

  const historyRows = results
    .slice(0, 30)
    .map(
      (r) => `
        <tr>
          <td>${fmtDate(r.created_at)}</td>
          <td>${fmt(r.detection_label ?? r.severity)}</td>
          <td>${r.confidence ? `${(r.confidence * 100).toFixed(1)}%` : "—"}</td>
          <td class="num">${Math.round(r.healthscore)}%</td>
          <td>${fmt(r.severity)}</td>
        </tr>`,
    )
    .join("");

  const sensitivityRows = sensitivity
    .slice(0, 30)
    .map(
      (s) => `
        <tr>
          <td>${fmtDate(s.occurred_at)}</td>
          <td>${fmt(s.trigger_cause)}</td>
          <td>${fmt(s.severity)}</td>
          <td>${s.notes ? escapeHtml(s.notes) : "—"}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { margin: 18px; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, Helvetica, Arial, sans-serif;
      color: #1F2937;
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
    }
    .header {
      border-bottom: 3px solid #15803D;
      padding-bottom: 12px;
      margin-bottom: 18px;
    }
    .brand { color: #15803D; font-size: 22px; font-weight: 800; margin: 0; }
    .subtitle { color: #6B7280; font-size: 12px; margin: 4px 0 0; }
    h2 {
      font-size: 14px;
      color: #14532D;
      background: #F0FDF4;
      border-left: 4px solid #15803D;
      padding: 6px 10px;
      margin: 22px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    table { width: 100%; border-collapse: collapse; }
    td, th {
      border-bottom: 1px solid #E5E7EB;
      padding: 7px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #F9FAFB; color: #6B7280; font-size: 11px; text-transform: uppercase; }
    td.k { color: #6B7280; width: 38%; }
    td.num { font-weight: 700; color: #15803D; }
    .score-row { display: flex; align-items: center; gap: 16px; margin: 4px 0 10px; }
    .score {
      width: 76px; height: 76px; border-radius: 50%;
      border: 5px solid; display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 800;
    }
    .score-label { font-size: 16px; font-weight: 700; }
    .score-sub { color: #6B7280; font-size: 12px; }
    .para { color: #374151; margin: 6px 0; }
    .item { border-bottom: 1px solid #F3F4F6; padding: 8px 0; }
    .item:last-child { border-bottom: none; }
    .item-title { font-weight: 700; }
    .item-note { color: #6B7280; font-size: 11px; margin-top: 2px; }
    .chips { margin: 4px 0; }
    .chip {
      display: inline-block; background: #F0FDF4; color: #15803D;
      border-radius: 999px; padding: 2px 8px; font-size: 11px; margin: 2px 4px 0 0;
    }
    .subhead { font-weight: 700; color: #14532D; margin: 12px 0 4px; }
    .steps { margin: 0; padding-left: 18px; }
    .steps li { margin-bottom: 6px; }
    .disclaimer {
      margin-top: 24px; padding: 10px; background: #FFFBEB;
      border: 1px solid #FDE68A; border-radius: 8px;
      color: #92400E; font-size: 11px;
    }
    .footer { margin-top: 14px; color: #9CA3AF; font-size: 10px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <p class="brand">SkinLens — Skin Health Report</p>
    <p class="subtitle">Generated ${fmtDateTime(new Date().toISOString())} · For ${escapeHtml(name)}</p>
  </div>

  <h2>Patient Profile</h2>
  <table>${profileRows}</table>

  <h2>Latest Assessment</h2>
  ${assessmentBlock}

  <h2>Recommended Products</h2>
  ${recommendationsBlock}

  <h2>AI Skincare Routine</h2>
  ${routineBlock}

  <h2>Scan History</h2>
  ${
    results.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>Date</th><th>Condition</th><th>Confidence</th><th>Score</th><th>Severity</th>
            </tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>`
      : `<p class="para">No scans recorded yet.</p>`
  }

  <h2>Sensitivity History</h2>
  ${
    sensitivity.length > 0
      ? `<table>
          <thead>
            <tr>
              <th>Date</th><th>Trigger</th><th>Severity</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>${sensitivityRows}</tbody>
        </table>`
      : `<p class="para">No sensitivity episodes logged.</p>`
  }

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This report is generated by an AI assistant for
    informational purposes only and is not a medical diagnosis. Results should be
    validated by a licensed dermatologist before making medical decisions.
  </div>
  <div class="footer">SkinLens · AI-Powered Skin Health</div>
</body>
</html>`;
}

export async function exportSkinReport(): Promise<void> {
  const html = await generateSkinReportHtml();
  const { uri } = await Print.printToFileAsync({ html });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    ToastAndroid.show("Sharing is not available on this device", ToastAndroid.SHORT);
    return;
  }

  ToastAndroid.show("Report generated", ToastAndroid.SHORT);
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: "Share Skin Health Report",
    UTI: "com.adobe.pdf",
  });
}
