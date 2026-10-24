import { test } from "node:test";
import assert from "node:assert/strict";
import { processEvent, language, validateEvent } from "../src/w01.mjs";
import handler from "../api/w01.mjs";
const e = {
  merchant_id: "11111111-1111-4111-8111-111111111111",
  event_id: "test-1",
  customer_id: "synthetic",
  channel: "website",
  text: "shirt price",
};
function fixture(overrides = {}) {
  const calls = [];
  return {
    calls,
    store: {
      begin: async () => ({ status: "claimed" }),
      search: async () => [{ id: "p1" }],
      verify: async () => ({
        id: "p1",
        sku: "TS-BLK-M",
        name: "Shirt",
        price_minor: 125000,
        stock: 3,
        currency: "BDT",
        verified_at: new Date().toISOString(),
      }),
      policies: async () => [],
      handoff: async (...a) => calls.push(a),
      finish: async (e, r) => r,
      fail: async () => calls.push("failed"),
      ...overrides,
    },
    planner: async () => ({ intent: "product", query: "shirt" }),
  };
}
for (const [text, want] of [
  ["দাম কত", "bn"],
  ["dam koto bhai", "banglish"],
  ["What is the price?", "en"],
])
  test("language " + want, () => assert.equal(language(text), want));
test("verified price/stock rendered from database", async () => {
  const r = await processEvent(e, fixture());
  assert.match(r.draft, /1250.00/);
  assert.match(r.draft, /Stock: 3/);
  assert.equal(r.send, false);
});
test("stale catalog never quotes price", async () => {
  const f = fixture({ verify: async () => ({ verified_at: "2000-01-01" }) });
  const r = await processEvent(e, f);
  assert.equal(r.status, "handoff");
  assert.equal(f.calls.length, 1);
  assert.ok(!r.draft.includes("1250"));
});
test("out of stock", async () => {
  const f = fixture();
  const p = await f.store.verify();
  f.store.verify = async () => ({ ...p, stock: 0 });
  assert.match((await processEvent(e, f)).draft, /Out of stock/);
});
for (const [status, result] of [
  ["duplicate", "duplicate"],
  ["human", "human_owned"],
])
  test(status + " does not call AI", async () => {
    const f = fixture({ begin: async () => ({ status }) });
    f.planner = () => {
      throw Error("must not call");
    };
    assert.equal((await processEvent(e, f)).status, result);
  });
test("busy returns retryable 409", async () => {
  await assert.rejects(
    processEvent(e, fixture({ begin: async () => ({ status: "busy" }) })),
    (x) => x.status === 409,
  );
});
test("model failure clears processing state", async () => {
  const f = fixture();
  f.planner = () => {
    throw Error("provider details must stay private");
  };
  await assert.rejects(
    processEvent(e, f),
    (x) => x.code === "processing_failed",
  );
  assert.deepEqual(f.calls, ["failed"]);
});
test("human takeover suppresses pending answer", async () =>
  assert.equal(
    (
      await processEvent(
        e,
        fixture({ finish: async () => ({ status: "suppressed" }) }),
      )
    ).draft,
    null,
  ));
test("FAQ without approved policy escalates", async () => {
  const f = fixture();
  f.planner = async () => ({ intent: "faq", query: "returns" });
  assert.equal((await processEvent(e, f)).status, "handoff");
});
test("invalid and oversized inputs rejected", () => {
  assert.throws(() => validateEvent({ ...e, text: "x".repeat(4001) }));
  assert.throws(() => validateEvent({ ...e, merchant_id: "bad" }));
  assert.throws(() => validateEvent({ ...e, media_type: "image" }));
});
test("ingress rejects missing credential", async () => {
  let code;
  const res = {
    setHeader() {},
    status(c) {
      code = c;
      return this;
    },
    json(v) {
      return v;
    },
  };
  await handler({ method: "POST", headers: {} }, res);
  assert.equal(code, 401);
});
