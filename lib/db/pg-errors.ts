/**
 * Postgres / PostgREST error sniffers shared by the DB layer. Migrations ship separately from app
 * builds, so code must degrade gracefully when the server still runs an older schema.
 */

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const e = error as { message?: unknown; code?: unknown };
    return `${typeof e.message === "string" ? e.message : ""} ${
      typeof e.code === "string" ? e.code : ""
    }`;
  }
  return String(error ?? "");
}

export function isMissingColumnError(error: unknown): boolean {
  const msg = errorText(error);
  return (
    /column .* does not exist/i.test(msg) ||
    /42703/.test(msg) ||
    /PGRST204/.test(msg) ||
    /schema cache/i.test(msg)
  );
}

/** Unique-violation — e.g. the appointments doctor-slot index (0007). */
// Transport-level failure (no route, DNS, timeout) — as opposed to a server or data error that is
// specific to one entry. supabase-js reports these either as thrown errors or as returned `{
// message: "TypeError: Network request failed" }` objects, so read `.message` off plain objects
// too. Deliberately message-based only: a bare TypeError from a bug in this file must not be
// mistaken for "offline" or it would stall the queue forever.
export function isTransportSyncError(err: unknown): boolean {
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err ?? "");
  const m = message.toLowerCase();
  return (
    m.includes("network request failed") ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("networkerror") ||
    m.includes("aborterror") ||
    m.includes("aborted") ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("enotfound") ||
    m.includes("eai_again")
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  const msg = errorText(error);
  return /23505/.test(msg) || /duplicate key value/i.test(msg);
}

/** Function-not-found — the RPC is from a migration that isn't applied yet. */
export function isMissingFunctionError(error: unknown): boolean {
  const msg = errorText(error);
  return (
    /PGRST202/.test(msg) ||
    /could not find the function/i.test(msg) ||
    /function .* does not exist/i.test(msg)
  );
}

/** Turns any thrown/returned error into text that is safe to show a user. */
export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const msg = (error instanceof Error ? error.message : errorText(error)).trim();
  if (!msg) return fallback;
  if (/network request failed|failed to fetch|fetch failed|timeout|aborted/i.test(msg)) {
    return "Check your internet connection and try again.";
  }
  if (/row-level security|permission denied|42501.*policy/i.test(msg)) {
    return "You don't have permission to do that.";
  }
  if (isDuplicateKeyError(error)) return "That already exists.";
  if (
    isMissingColumnError(error) ||
    isMissingFunctionError(error) ||
    /PGRST\d|relation .* does not exist|violates|syntax error|constraint|jwt/i.test(msg) ||
    msg.length > 160
  ) {
    return fallback;
  }
  return msg;
}
