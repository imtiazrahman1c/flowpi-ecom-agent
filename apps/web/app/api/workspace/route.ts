import { z } from "zod";
import {
  userDB,
  requireMerchant,
  jsonBody,
  failure,
  reply,
  HttpError,
} from "../../../lib/server";
export async function GET(req: Request) {
  try {
    const { db, user } = await userDB(req);
    const { data: members, error: me } = await db
      .from("flowpi_memberships")
      .select("merchant_id,role")
      .eq("user_id", user.id);
    if (me) throw me;
    const chosen =
      new URL(req.url).searchParams.get("merchant") ??
      members?.[0]?.merchant_id;
    if (!chosen)
      return reply({ user: user.email, members: [], onboarding: true });
    await requireMerchant(db, chosen, false, user.id);
    const tables = [
      "flowpi_merchants",
      "flowpi_variants",
      "flowpi_inventory",
      "flowpi_conversations",
      "flowpi_messages",
      "flowpi_orders",
      "flowpi_payments",
      "flowpi_shipments",
      "flowpi_cod_settlements",
      "flowpi_handoffs",
      "flowpi_followups",
      "flowpi_incidents",
      "flowpi_outbox",
      "flowpi_audit",
    ];
    const data: Record<string, unknown> = {};
    const results = await Promise.all(
      tables.map(async (t) => {
        const base = db
          .from(t)
          .select("*")
          .eq(t === "flowpi_merchants" ? "id" : "merchant_id", chosen);
        const { data: rows, error } = await base.limit(200);
        if (error) throw error;
        return [t, rows] as const;
      }),
    );
    for (const [t, rows] of results) data[t] = rows;
    const { data: reports, error } = await db.rpc("flowpi_reports", {
      m: chosen,
    });
    if (error) throw error;
    return reply({
      user: user.email,
      members,
      merchant_id: chosen,
      tables: data,
      reports,
      ai_mode: process.env.OPENAI_API_KEY ? "openai" : "offline_rules",
      live_sending: false,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { db } = await userDB(req);
    const parsed = z
      .object({ store_name: z.string().trim().min(2).max(80) })
      .safeParse(await jsonBody(req));
    if (!parsed.success) throw new HttpError("invalid_store_name");
    const { data, error } = await db.rpc("flowpi_onboard_sandbox", parsed.data);
    if (error) throw error;
    return reply({ merchant_id: data }, 201);
  } catch (e) {
    return failure(e);
  }
}
