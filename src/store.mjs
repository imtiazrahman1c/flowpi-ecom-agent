export function createStore({ url, key, token = key, fetcher = fetch }) {
  if (!url || !key) throw Error("database_not_configured");
  async function rpc(name, args) {
    const r = await fetcher(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw Error("database_operation_failed");
    return r.json();
  }
  const event = (e) => ({
    m: e.merchant_id,
    c: e.channel,
    u: e.customer_id,
    e: e.event_id,
  });
  return {
    begin: (e) => rpc("flowpi_begin", { ...event(e), t: e.text }),
    search: (m, q) => rpc("flowpi_search", { m, q }),
    verify: async (m, p) => (await rpc("flowpi_verify", { m, p }))[0] ?? null,
    policies: (m, q) => rpc("flowpi_policies", { m, q }),
    handoff: (e, reason) => rpc("flowpi_handoff", { ...event(e), reason }),
    finish: (e, result) => rpc("flowpi_finish", { ...event(e), result }),
    fail: (e) => rpc("flowpi_fail", event(e)),
  };
}
