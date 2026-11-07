// Rewrites incoming deep links before Expo Router navigates to them.
//
// Google OAuth returns to `skinlens://auth-callback#access_token=...`. There is no
// `auth-callback` screen — the tokens are consumed by `openAuthSessionAsync` and the
// Linking listener in app/_layout.tsx — so the router must not navigate on it.
//
// Depending on how the URL is parsed, the router may see it as just "/" (the
// `auth-callback` part is the URL host, not the path). "/" is ambiguous: both
// app/index.tsx and app/(user-setup)/index.tsx resolve to it, and from inside the
// (user-setup) group (face-enroll, during Google re-auth) the router picked the
// setup intro screen and pushed it over the profile-picture flow.

const AUTH_MARKERS = ["auth-callback", "access_token=", "refresh_token=", "code=", "error_description="];

function isAuthRedirect(path: string): boolean {
  return AUTH_MARKERS.some((m) => path.includes(m));
}

function isBareRoot(path: string): boolean {
  const stripped = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").split(/[?#]/)[0];
  return stripped === "" || stripped === "/";
}

// Password reset emails return to `skinlens://create-new-password#access_token=...&type=recovery`.
// Unlike OAuth, this one MUST navigate: the Linking listener in app/_layout.tsx only sets the
// session (setSession emits SIGNED_IN, not PASSWORD_RECOVERY), so nothing else opens the screen.
// An expired/used link arrives as `#error=...` — send the user back to request a new email.
function recoveryTarget(path: string): string | null {
  if (!path.includes("create-new-password") && !path.includes("type=recovery")) return null;
  return path.includes("error=") || path.includes("error_code=")
    ? "/forgot-password?expired=1"
    : "/create-new-password";
}

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string | null {
  try {
    const recovery = recoveryTarget(path);
    if (recovery) return recovery;
    if (initial) {
      // Cold start: an auth redirect boots normally through app/index.tsx.
      return isAuthRedirect(path) ? "/" : path;
    }
    // App already running: auth redirects and bare "open the app" links must never
    // move the user off the screen they're on.
    if (isAuthRedirect(path) || isBareRoot(path)) return null;
    return path;
  } catch {
    return initial ? "/" : null;
  }
}
