import {
  userDB,
  requireMerchant,
  jsonBody,
  failure,
  reply,
  HttpError,
} from "../../../lib/server";
import { processEvent, SafeError } from "../../../../../src/w01.mjs";
import { createStore } from "../../../../../src/store.mjs";
import { createPlanner } from "../../../../../src/planner.mjs";
import { rulesPlanner } from "../../../../../src/rules.mjs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const { db, url, key, token, user } = await userDB(req);
    const body = await jsonBody(req);
    if (body.channel !== "website") throw new HttpError("sandbox_website_only");
    await requireMerchant(db, body.merchant_id, true, user.id);
    const { data: catalog, error } = await db
      .from("flowpi_variants")
      .select("sku,label,aliases")
      .eq("merchant_id", body.merchant_id)
      .limit(200);
    if (error) throw error;
    const planner =
      process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
        ? createPlanner({
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL,
          })
        : rulesPlanner((catalog ?? []).map((p) => ({ ...p, name: p.label })));
    const result = await processEvent(body, {
      store: createStore({ url, key, token }),
      planner,
    });
    return reply({
      ...result,
      mode:
        process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
          ? "openai"
          : "offline_rules",
      live_sending: false,
    });
  } catch (e) {
    if (e instanceof SafeError) return failure(new HttpError(e.code, e.status));
    return failure(e);
  }
}
