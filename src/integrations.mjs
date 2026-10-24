import { createHmac, timingSafeEqual } from "node:crypto";
// Sandbox-only signed envelopes. These are NOT bKash/SSLCommerz/Meta signatures.
export function verifySandboxEnvelope(
  raw,
  { signature, timestamp, secret, now = Date.now() },
) {
  if (typeof secret !== "string" || secret.length < 32)
    throw Error("sandbox_secret_not_configured");
  if (
    !/^\d{13}$/.test(timestamp ?? "") ||
    Math.abs(now - Number(timestamp)) > 300000
  )
    throw Error("stale_webhook");
  if (!/^[0-9a-f]{64}$/.test(signature ?? "")) throw Error("invalid_signature");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    throw Error("invalid_signature");
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    throw Error("invalid_json");
  }
  if (
    event.provider !== "flowpi_sandbox" ||
    event.currency !== "BDT" ||
    !Number.isSafeInteger(event.amount_minor) ||
    event.amount_minor < 1 ||
    typeof event.event_id !== "string" ||
    event.event_id.length > 160 ||
    !["paid", "failed"].includes(event.status)
  )
    throw Error("invalid_payment_event");
  return event;
}
export function followupEligibility({
  consented,
  optedOut,
  humanOwned,
  orderStatus,
  attempts,
  maxAttempts = 2,
  channel,
  lastMessageAt,
  approvedTemplate = false,
  now = Date.now(),
}) {
  if (optedOut) return { allowed: false, reason: "opted_out" };
  if (!consented) return { allowed: false, reason: "no_consent" };
  if (humanOwned) return { allowed: false, reason: "human_owned" };
  if (["confirmed", "cancelled", "paid", "delivered"].includes(orderStatus))
    return { allowed: false, reason: "order_stopped" };
  if (attempts >= maxAttempts)
    return { allowed: false, reason: "attempt_limit" };
  if (
    channel !== "website" &&
    (!Number.isFinite(Date.parse(lastMessageAt)) ||
      now - Date.parse(lastMessageAt) > 86400000) &&
    !approvedTemplate
  )
    return { allowed: false, reason: "approved_template_required" };
  return { allowed: false, reason: "live_sending_disabled" };
}
export const providerStatus = {
  meta: "approval_required",
  payment: "sandbox_interface_only",
  courier: "sandbox_simulator_only",
  woocommerce: "not_connected",
};
