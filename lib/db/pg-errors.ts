/**
 * Postgres / PostgREST error sniffers shared by the DB layer.
 *
 * The app ships migrations separately from app builds (see supabase/
 * migrations/000X_*.sql), so code must degrade gracefully when the server
 * is still running an older schema instead of failing the whole write.
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
