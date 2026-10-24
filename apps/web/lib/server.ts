import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export class HttpError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export async function userDB(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError("environment_not_configured", 503);
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 8192)
    throw new HttpError("authentication_required", 401);
  const token = header.slice(7);
  const db = createClient(url, key, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError("authentication_required", 401);
  return { db, token, user: data.user, url, key };
}
export async function requireMerchant(
  db: SupabaseClient,
  m: string,
  write: boolean,
  userId: string,
) {
  const { data, error } = await db
    .from("flowpi_memberships")
    .select("role")
    .eq("merchant_id", m)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data || (write && data.role === "viewer"))
    throw new HttpError("merchant_forbidden", 403);
  return data.role as string;
}
export async function jsonBody(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError("json_required", 415);
  // Read a bounded stream so chunked requests cannot bypass Content-Length checks.
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("body_required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new HttpError("body_too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError("invalid_json");
  }
}
export function failure(error: unknown) {
  const known = error instanceof HttpError;
  // No provider responses, request bodies, phone/address, or secrets are logged or returned.
  return Response.json(
    {
      error: known ? error.code : "operation_failed",
      correlation_id: crypto.randomUUID(),
    },
    {
      status: known ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export function reply(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
