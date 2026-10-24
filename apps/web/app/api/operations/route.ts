import { z } from "zod";
import {
  userDB,
  requireMerchant,
  jsonBody,
  failure,
  reply,
  HttpError,
} from "../../../lib/server";
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("takeover"),
    merchant_id: z.uuid(),
    channel: z.enum(["website", "messenger", "whatsapp", "instagram"]),
    customer_id: z.string().min(1).max(160),
    take: z.boolean(),
  }),
  z.object({
    action: z.literal("incident"),
    merchant_id: z.uuid(),
    code: z.string().regex(/^[a-z0-9_]{1,80}$/),
    correlation: z.string().min(1).max(160),
  }),
  z.object({ action: z.literal("followups"), merchant_id: z.uuid() }),
  z.object({ action: z.literal("reconcile"), merchant_id: z.uuid() }),
  z.object({ action: z.literal("recover"), merchant_id: z.uuid() }),
  z.object({
    action: z.literal("shipment"),
    merchant_id: z.uuid(),
    order_id: z.uuid(),
    state: z.enum([
      "booked",
      "in_transit",
      "delivered",
      "delivery_failed",
      "returned",
    ]),
  }),
  z.object({
    action: z.literal("import"),
    merchant_id: z.uuid(),
    rows: z
      .array(
        z.object({
          sku: z.string().min(1).max(80),
          name: z.string().min(1).max(150),
          label: z.string().min(1).max(100),
          price_minor: z.number().int().min(0).max(100000000),
          stock: z.number().int().min(0).max(100000),
        }),
      )
      .min(1)
      .max(200),
  }),
]);
export async function POST(req: Request) {
  try {
    const { db, user } = await userDB(req);
    const parsed = schema.safeParse(await jsonBody(req));
    if (!parsed.success) throw new HttpError("invalid_operation");
    const x = parsed.data;
    const role = await requireMerchant(db, x.merchant_id, true, user.id);
    let result;
    if (x.action === "takeover")
      result = await db.rpc("flowpi_takeover", {
        m: x.merchant_id,
        c: x.channel,
        u: x.customer_id,
        take: x.take,
      });
    else if (x.action === "incident")
      result = await db.rpc("flowpi_record_incident", {
        m: x.merchant_id,
        code: x.code,
        correlation: x.correlation,
      });
    else if (x.action === "followups")
      result = await db.rpc("flowpi_followup_sweep", { m: x.merchant_id });
    else if (x.action === "recover")
      result = await db.rpc("flowpi_recover_conversations", {
        m: x.merchant_id,
      });
    else if (x.action === "reconcile")
      result = await db.rpc("flowpi_reconcile_jobs", { m: x.merchant_id });
    else if (x.action === "shipment")
      result = await db.rpc("flowpi_simulate_shipment", {
        m: x.merchant_id,
        oid: x.order_id,
        next_state: x.state,
      });
    else {
      if (!["owner", "admin"].includes(role))
        throw new HttpError("owner_required", 403);
      result = await db.rpc("flowpi_import_catalog", {
        m: x.merchant_id,
        rows: x.rows,
      });
    }
    if (result.error) throw new HttpError("operation_rejected", 409);
    return reply({ result: result.data });
  } catch (e) {
    return failure(e);
  }
}
