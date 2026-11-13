type ResultLike = {
  detection_label?: string | null;
  source_type?: string | null;
  survey_answers?: string | null;
};

/**
 * True when the user answered "No, that doesn't match my skin" to the after-scan survey. The
 * scan is kept (so it's visible and a doctor can review it) but treated as unreliable.
 */
export function isDisputedResult(r: ResultLike): boolean {
  if (!r.survey_answers) return false;
  try {
    const parsed: unknown = JSON.parse(r.survey_answers);
    return (
      !!parsed && typeof parsed === "object" && (parsed as Record<string, unknown>).match === "no"
    );
  } catch {
    return false;
  }
}

/**
 * A result is "photo-based" when the skin model graded a photo for it: every scan, plus a setup
 * baseline whose enrollment photo was clear enough to classify. Answers-only setup results (and
 * every setup result saved before photo baselines existed) have no detection label.
 *
 * Progress trends and "since your first scan" comparisons only use photo-based results that the
 * user didn't dispute, so a questionnaire score — or a scan the user said is wrong — is never
 * compared against a real one.
 */
export function isPhotoBasedResult(r: ResultLike): boolean {
  const graded = !!r.detection_label?.trim() || (r.source_type ?? "").startsWith("scan_");
  return graded && !isDisputedResult(r);
}

/** SQL twin of {@link isPhotoBasedResult} for local SQLite queries. */
export const PHOTO_BASED_RESULT_SQL =
  "((TRIM(COALESCE(detection_label, '')) <> '' OR source_type LIKE 'scan\\_%' ESCAPE '\\') " +
  "AND COALESCE(survey_answers, '') NOT LIKE '%\"match\":\"no\"%')";
