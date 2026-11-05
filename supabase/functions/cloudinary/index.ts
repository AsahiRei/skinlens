// Supabase Edge Function: Cloudinary signing + per-user purge.
//
// Replaces the unsigned upload preset that was compiled into the app (anyone
// could extract it from the APK and upload to the account). The API secret
// now lives only here, uploads are scoped to the caller's own folder, and
// account deletion can purge that folder.
//
// Deploy:
//   supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
//   supabase functions deploy cloudinary
//
// POST body: { "action": "sign", "kind": "scans" | "faces" }
//         or { "action": "purge" }
// Requires the caller's Supabase JWT (supabase.functions.invoke sends it).

import { createClient } from "npm:@supabase/supabase-js@2";

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "";
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") ?? "";
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") ?? "";
const ROOT = "skinlens/users";
const KINDS = new Set(["scans", "faces"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Cloudinary signature: params sorted by key, joined as k=v&k=v, + secret.
async function sign(params: Record<string, string | number>): Promise<string> {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return sha1Hex(toSign + API_SECRET);
}

async function purgeFolder(prefix: string): Promise<number> {
  const auth = "Basic " + btoa(`${API_KEY}:${API_SECRET}`);
  let deleted = 0;
  // Admin API deletes at most 1000 per call; loop while it reports partial.
  for (let i = 0; i < 20; i++) {
    const url =
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image/upload` +
      `?prefix=${encodeURIComponent(prefix)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: { authorization: auth },
    });
    if (!res.ok) throw new Error(`Cloudinary purge failed: HTTP ${res.status}`);
    const data = (await res.json()) as {
      deleted?: Record<string, string>;
      partial?: boolean;
    };
    deleted += Object.keys(data.deleted ?? {}).length;
    if (!data.partial) break;
  }
  return deleted;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    return json({ error: "Cloudinary is not configured on the server." }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Not signed in." }, 401);

  let body: { action?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const userRoot = `${ROOT}/${user.id}`;

  if (body.action === "sign") {
    const kind = body.kind ?? "scans";
    if (!KINDS.has(kind)) return json({ error: "Unknown upload kind." }, 400);
    const folder = `${userRoot}/${kind}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sign({ folder, timestamp });
    return json({
      cloudName: CLOUD_NAME,
      apiKey: API_KEY,
      folder,
      timestamp,
      signature,
    });
  }

  if (body.action === "purge") {
    try {
      const deleted = await purgeFolder(`${userRoot}/`);
      return json({ deleted });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 502);
    }
  }

  return json({ error: "Unknown action." }, 400);
});
