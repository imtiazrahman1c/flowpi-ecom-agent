import { z } from "zod";
import {
  userDB,
  requireMerchant,
  jsonBody,
  failure,
  reply,
  HttpError,
} from "../../../lib/server";
const base = { merchant_id: z.uuid() };
const schemas = {
  draft: z.object({
    ...base,
    action: z.literal("draft"),
    variant_id: z.uuid(),
    quantity: z.number().int().min(1).max(20),
    name: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^01[3-9]\d{8}$/),
    district: z.enum(["Dhaka", "Khulna", "Chattogram"]),
    address: z.string().trim().min(10).max(500),
  }),
  confirm: z.object({
    ...base,
    action: z.literal("confirm"),
    order_id: z.uuid(),
    confirmation_token: z.uuid(),
    accepted: z.literal(true),
  }),
  cancel: z.object({
    ...base,
    action: z.literal("cancel"),
    order_id: z.uuid(),
  }),
};
export async function POST(req: Request) {
  try {
    const { db, user } = await userDB(req);
    const input = await jsonBody(req);
    const schema = schemas[input.action as keyof typeof schemas];
    if (!schema) throw new HttpError("invalid_action");
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new HttpError("invalid_order_details");
    const x = parsed.data;
    await requireMerchant(db, x.merchant_id, true, user.id);
    let result;
    if (x.action === "draft")
      result = await db.rpc("flowpi_create_order_draft", {
        m: x.merchant_id,
        v: x.variant_id,
        q: x.quantity,
        n: x.name,
        ph: x.phone,
        d: x.district,
        a: x.address,
      });
    else if (x.action === "confirm")
      result = await db.rpc("flowpi_confirm_order", {
        m: x.merchant_id,
        oid: x.order_id,
        token: x.confirmation_token,
        accepted: x.accepted,
      });
    else
      result = await db.rpc("flowpi_cancel_order", {
        m: x.merchant_id,
        oid: x.order_id,
      });
    if (result.error) {
      const allowed = [
        "out_of_stock",
        "price_changed_create_new_draft",
        "delivery_fee_changed",
        "draft_expired_or_invalid",
        "explicit_confirmation_required",
        "shipping_started_staff_review_required",
      ];
      throw new HttpError(
        allowed.find((s) => result.error.message.includes(s)) ??
          "order_operation_failed",
        409,
      );
    }
    return reply({ order: result.data });
  } catch (e) {
    return failure(e);
  }
}
