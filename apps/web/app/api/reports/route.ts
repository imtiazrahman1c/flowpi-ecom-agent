import { z } from "zod";
import {
  userDB,
  requireMerchant,
  failure,
  reply,
  HttpError,
} from "../../../lib/server";
export async function GET(req: Request) {
  try {
    const { db, user } = await userDB(req);
    const m = new URL(req.url).searchParams.get("merchant");
    if (!z.uuid().safeParse(m).success) throw new HttpError("invalid_merchant");
    await requireMerchant(db, m!, false, user.id);
    const { data, error } = await db.rpc("flowpi_reports", { m });
    if (error) throw error;
    return reply(data);
  } catch (e) {
    return failure(e);
  }
}
