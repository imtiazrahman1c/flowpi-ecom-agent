"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserDB } from "../lib/supabase";
import { parseCatalogCSV } from "../../../packages/shared/csv.mjs";
type Row = Record<string, any>;
type Data = {
  user: string;
  merchant_id: string;
  members: Row[];
  onboarding?: boolean;
  tables: Record<string, Row[]>;
  reports: Row;
  ai_mode: string;
};
const tabs = [
  "Inbox",
  "Orders",
  "Products",
  "Tasks",
  "Reports",
  "Sandbox",
  "Settings",
] as const;
const money = (n: unknown) =>
  "৳" +
  (Number(n ?? 0) / 100).toLocaleString("en-BD", { minimumFractionDigits: 2 });
const when = (s: string) =>
  new Date(s).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export default function Workspace() {
  const [session, setSession] = useState<Session | null>(null),
    [loaded, setLoaded] = useState(false),
    [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<string>("Inbox"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Row | null>(null),
    [chat, setChat] = useState<Row[]>([]),
    [customer, setCustomer] = useState(""),
    [message, setMessage] = useState("vai black shoe 42 size ase? price koto?");
  useEffect(() => {
    setCustomer("sandbox-" + crypto.randomUUID());
    const db = browserDB();
    if (!db) {
      setLoaded(true);
      return;
    }
    db.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const { data: sub } = db.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  async function request(path: string, body?: unknown) {
    const r = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const x = await r.json();
    if (!r.ok) throw Error(x.error ?? "Request failed");
    return x;
  }
  async function refresh() {
    setError("");
    try {
      setData(await request("/api/workspace"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (session) void refresh();
    else setData(null);
  }, [session?.access_token]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function auth(form: FormData) {
    await act(async () => {
      const db = browserDB();
      if (!db) throw Error("Supabase environment is not configured");
      const signup = form.get("intent") === "signup";
      const input = {
        email: String(form.get("email")),
        password: String(form.get("password")),
      };
      const { error } = signup
        ? await db.auth.signUp(input)
        : await db.auth.signInWithPassword(input);
      if (error) throw Error(error.message);
      if (signup) setNotice("Check your email for confirmation, then sign in.");
    });
  }
  const table = (name: string) => data?.tables?.["flowpi_" + name] ?? [];
  const merchants = table("merchants"),
    variants = table("variants"),
    orders = table("orders"),
    conversations = table("conversations");
  const merchant = merchants[0],
    m = data?.merchant_id;
  const role = data?.members.find((x) => x.merchant_id === m)?.role;
  const canWrite = role && role !== "viewer";
  const inventory = (id: string) =>
    table("inventory").find((x) => x.variant_id === id)?.available ?? 0;
  async function op(body: Row) {
    await request("/api/operations", { merchant_id: m, ...body });
    await refresh();
  }
  const allMessages = table("messages").toSorted(
    (a, b) => Number(a.id) - Number(b.id),
  );
  const current =
    conversations.find((c) => `${c.channel}:${c.customer_id}` === selected) ??
    conversations[0];
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brandIcon">F</span>
          <span>
            flowpi<span className="brandDot">.</span>
            <small>COMMERCE OPERATIONS</small>
          </span>
        </a>
        <div className="store">
          <div className="avatar">{merchant?.name?.[0] ?? "F"}</div>
          <div>
            <strong>{merchant?.name ?? "Your workspace"}</strong>
            <small>Bangladesh · {role ?? "Sign in"}</small>
          </div>
        </div>
        <div className="navLabel">WORKSPACE</div>
        <nav>
          {tabs.map((t, i) => (
            <button
              key={t}
              className={tab === t ? "nav active" : "nav"}
              onClick={() => {
                setTab(t);
                setError("");
                setNotice("");
              }}
            >
              <span className="navGlyph">
                {["◉", "▣", "◇", "✓", "▥", "⌘", "⚙"][i]}
              </span>
              {t}
              {t === "Tasks" && table("incidents").length > 0 && (
                <span className="count">{table("incidents").length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebarBottom">
          <div className="safeDot" />
          Sandbox environment<p>Live customer sending is off.</p>
          <span className="version">BUILD V5.2 · EARLY MVP</span>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> {tab}
          </div>
          <div className="headerRight">
            <span className="pill amber">Sandbox only</span>
            {session && (
              <button
                className="quiet"
                onClick={() => void browserDB()?.auth.signOut()}
              >
                Sign out
              </button>
            )}
          </div>
        </header>
        <main>
          <div className="pageHeading">
            <div>
              <div className="eyebrow">FLOWPI WORKSPACE</div>
              <h1>
                {!session
                  ? "Your commerce, connected."
                  : tab === "Sandbox"
                    ? "Test the customer journey"
                    : tab}
              </h1>
              <p>
                {!session
                  ? "One place for conversations, orders and the work in between."
                  : (
                      {
                        Inbox:
                          "Every conversation. The right owner. A clear next step.",
                        Orders:
                          "Verified totals, explicit confirmation, traceable orders.",
                        Products:
                          "Your catalog, variants and current internal inventory.",
                        Tasks:
                          "Keep exceptions visible and customer follow-ups controlled.",
                        Reports:
                          "Verified business activity. No estimated conversions.",
                        Sandbox:
                          "Synthetic customers only. Nothing is sent to a live channel.",
                        Settings:
                          "A dedicated development workspace. Integrations stay gated.",
                      } as Row
                    )[tab]}
              </p>
            </div>
            {session && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void act(refresh)}
              >
                ↻ Refresh
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error.replaceAll("_", " ")}
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
            </div>
          )}
          {!loaded ? (
            <div className="empty">Loading secure workspace…</div>
          ) : !session ? (
            <div className="loginGrid">
              <section className="welcome">
                <span className="pill">BUILT FOR BANGLADESH</span>
                <h2>
                  From the first “ভাই”
                  <br />
                  to a confirmed order.
                </h2>
                <p>
                  A single workspace for your multilingual support, verified
                  products and everyday commerce operations.
                </p>
                <div className="featureList">
                  <div>
                    <b>01</b> Conversations that keep context
                  </div>
                  <div>
                    <b>02</b> Prices and stock from your catalog
                  </div>
                  <div>
                    <b>03</b> Orders confirmed with confidence
                  </div>
                </div>
                <div className="disclaimer">
                  Development sandbox · Official messaging, payment and courier
                  integrations are pending approval.
                </div>
              </section>
              <form className="card login" action={auth}>
                <h2>Welcome to FlowPi</h2>
                <p>Sign in to your merchant workspace.</p>
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@yourstore.com"
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="current-password"
                    placeholder="Your password"
                  />
                </label>
                <button
                  className="primary"
                  name="intent"
                  value="signin"
                  disabled={busy || !browserDB()}
                >
                  Sign in
                </button>
                <button
                  className="secondary"
                  name="intent"
                  value="signup"
                  disabled={busy || !browserDB()}
                >
                  Create sandbox account
                </button>
                {!browserDB() && (
                  <p className="warningText">
                    Environment setup pending. Sign-in will be available after
                    Supabase configuration.
                  </p>
                )}
                <small>
                  New accounts require email confirmation. Only synthetic test
                  data belongs in this environment.
                </small>
              </form>
            </div>
          ) : data?.onboarding ? (
            <section className="card onboarding">
              <span className="pill">STEP 1 OF 1</span>
              <h2>Create your sandbox store</h2>
              <p>
                Includes synthetic products, inventory and delivery rules. It
                does not connect a real customer channel.
              </p>
              <form
                action={(f) =>
                  act(async () => {
                    await request("/api/workspace", {
                      store_name: f.get("store_name"),
                    });
                    await refresh();
                  })
                }
              >
                <label>
                  Store name
                  <input
                    name="store_name"
                    minLength={2}
                    maxLength={80}
                    required
                    placeholder="Your test store"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Create sandbox workspace
                </button>
              </form>
            </section>
          ) : !data ? (
            <div className="empty">Loading merchant data…</div>
          ) : (
            <>
              <div className="metrics">
                <Metric
                  label="Conversations"
                  value={data.reports.conversations}
                  note="Stored customer threads"
                />
                <Metric
                  label="Confirmed orders"
                  value={data.reports.confirmed_orders}
                  note="Explicitly confirmed"
                />
                <Metric
                  label="Paid amount"
                  value={money(data.reports.paid_minor)}
                  note="Verified payments only"
                />
                <Metric
                  label="Needs attention"
                  value={
                    Number(data.reports.human_owned) +
                    Number(data.reports.open_incidents)
                  }
                  note="Human threads + incidents"
                  accent
                />
              </div>
              {tab === "Inbox" && (
                <div className="inbox card">
                  <section className="threads">
                    <div className="sectionTitle">
                      <h2>Conversations</h2>
                      <span className="pill">{conversations.length}</span>
                    </div>
                    <input
                      aria-label="Search conversations"
                      placeholder="Search customer ID…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {conversations
                      .filter((c) =>
                        c.customer_id
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((c) => (
                        <button
                          key={c.customer_id + c.channel}
                          className={
                            "thread " + (current === c ? "chosen" : "")
                          }
                          onClick={() =>
                            setSelected(`${c.channel}:${c.customer_id}`)
                          }
                        >
                          <div className="avatar">
                            {c.customer_id[0].toUpperCase()}
                          </div>
                          <div>
                            <strong>{c.customer_id}</strong>
                            <small>
                              {c.channel} ·{" "}
                              <span
                                className={
                                  c.human_owned ? "warningText" : "greenText"
                                }
                              >
                                {c.human_owned ? "Human owned" : "AI active"}
                              </span>
                            </small>
                          </div>
                        </button>
                      ))}
                    {!conversations.length && (
                      <Empty
                        title="Your inbox is ready"
                        text="Run a synthetic conversation in Sandbox to see it here."
                      />
                    )}
                  </section>
                  <section className="timeline">
                    {current ? (
                      <>
                        <div className="sectionTitle">
                          <div>
                            <h2>{current.customer_id}</h2>
                            <small>
                              {current.channel} · synthetic test conversation
                            </small>
                          </div>
                          {canWrite && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  op({
                                    action: "takeover",
                                    channel: current.channel,
                                    customer_id: current.customer_id,
                                    take: !current.human_owned,
                                  }),
                                )
                              }
                            >
                              {current.human_owned ? "Resume AI" : "Take over"}
                            </button>
                          )}
                        </div>
                        <div className="messageList">
                          {allMessages
                            .filter(
                              (x) =>
                                x.customer_id === current.customer_id &&
                                x.channel === current.channel,
                            )
                            .map((x) => (
                              <div
                                className={
                                  "bubble " +
                                  (x.role === "assistant" ? "agent" : "")
                                }
                                key={x.id}
                              >
                                <small>
                                  {x.role === "assistant"
                                    ? "FlowPi · draft"
                                    : "Customer"}
                                </small>
                                <p>{x.content}</p>
                                <time>{when(x.created_at)}</time>
                              </div>
                            ))}
                        </div>
                        <div className="inboxFooter">
                          Reply delivery is disabled. AI messages shown here are
                          saved drafts.
                        </div>
                      </>
                    ) : (
                      <Empty
                        title="A clearer view of every conversation"
                        text="Select a thread to review its timeline and ownership."
                      />
                    )}
                  </section>
                </div>
              )}
              {tab === "Orders" && (
                <section className="card">
                  <div className="sectionTitle">
                    <h2>Order book</h2>
                    <button
                      className="primary"
                      onClick={() => setTab("Sandbox")}
                    >
                      + Create test order
                    </button>
                  </div>
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Order",
                            "Customer",
                            "Status",
                            "Total",
                            "Payment",
                            "Shipment",
                            "Actions",
                          ].map((x) => (
                            <th key={x}>{x}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td>
                              <strong>#{o.id.slice(0, 8)}</strong>
                              <small>{when(o.created_at)}</small>
                            </td>
                            <td>
                              {o.customer_name}
                              <small>{o.district}</small>
                            </td>
                            <td>
                              <Badge value={o.status} />
                            </td>
                            <td>{money(o.total_minor)}</td>
                            <td>
                              {table("payments").find(
                                (p) => p.order_id === o.id,
                              )?.status ?? "—"}
                              <small>
                                COD settlement:{" "}
                                {table("cod_settlements").find(
                                  (p) => p.order_id === o.id,
                                )?.status ?? "—"}
                              </small>
                            </td>
                            <td>
                              {table("shipments").find(
                                (p) => p.order_id === o.id,
                              )?.status ?? "—"}
                            </td>
                            <td>
                              <button
                                className="quiet"
                                onClick={() => {
                                  setDraft(o);
                                  setTab("Sandbox");
                                }}
                              >
                                Details
                              </button>
                              {o.status === "confirmed" && canWrite && (
                                <button
                                  className="quiet danger"
                                  disabled={busy}
                                  onClick={() =>
                                    void act(async () => {
                                      await request("/api/commerce", {
                                        merchant_id: m,
                                        action: "cancel",
                                        order_id: o.id,
                                      });
                                      await refresh();
                                    })
                                  }
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!orders.length && (
                    <Empty
                      title="Your first order starts with a conversation"
                      text="Create a test draft, check its summary and explicitly confirm it."
                    />
                  )}
                </section>
              )}
              {tab === "Products" && (
                <section className="card">
                  <div className="sectionTitle">
                    <div>
                      <h2>Product catalog</h2>
                      <small>
                        Canonical variant prices · internal inventory
                      </small>
                    </div>
                    <span className="pill">{variants.length} variants</span>
                  </div>
                  <div className="tableWrap">
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Variant</th>
                          <th>Price</th>
                          <th>Available</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <strong>{v.sku}</strong>
                            </td>
                            <td>{v.label}</td>
                            <td>{money(v.price_minor)}</td>
                            <td>
                              <span
                                className={
                                  inventory(v.id) <= 2
                                    ? "warningText"
                                    : "greenText"
                                }
                              >
                                {inventory(v.id)}
                              </span>
                            </td>
                            <td>Internal database</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {["owner", "admin"].includes(role) && (
                    <details className="import">
                      <summary>Import sandbox catalog from CSV</summary>
                      <p>
                        Headers: sku,name,label,price_bdt,stock. Up to 200 new
                        variants. Duplicate SKU rejects the entire import.
                      </p>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        aria-label="Import catalog CSV"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file)
                            void act(async () => {
                              const rows = parseCatalogCSV(await file.text());
                              await op({ action: "import", rows });
                              setNotice(`${rows.length} variants imported.`);
                            });
                        }}
                      />
                    </details>
                  )}
                </section>
              )}
              {tab === "Tasks" && (
                <div className="twoCol">
                  <section className="card">
                    <div className="sectionTitle">
                      <h2>Human support</h2>
                      <span className="pill">{table("handoffs").length}</span>
                    </div>
                    {table("handoffs").map((h) => (
                      <div className="taskRow" key={h.id}>
                        <span className="statusDot" />
                        <div>
                          <strong>{h.reason.replaceAll("_", " ")}</strong>
                          <small>
                            {h.customer_id} · {when(h.created_at)}
                          </small>
                        </div>
                        <Badge value="human_owned" />
                      </div>
                    ))}
                    {!table("handoffs").length && (
                      <Empty
                        title="No escalations"
                        text="Human requests and uncertain answers appear here."
                      />
                    )}
                    <h3>Backend incidents</h3>
                    {table("incidents").map((i) => (
                      <div className="taskRow" key={i.id}>
                        <strong>{i.code}</strong>
                        <Badge value={i.status} />
                      </div>
                    ))}
                  </section>
                  <section className="card">
                    <h2>Controlled follow-ups</h2>
                    <p>
                      Review due tasks against consent, human ownership and
                      order state. Live sending is blocked.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy || !canWrite}
                      onClick={() =>
                        void act(async () => {
                          await op({ action: "followups" });
                          setNotice(
                            "Due tasks reviewed. No customer messages sent.",
                          );
                        })
                      }
                    >
                      Review due tasks
                    </button>
                    <button
                      className="quiet"
                      disabled={busy || !canWrite}
                      onClick={() =>
                        void act(() => op({ action: "reconcile" }))
                      }
                    >
                      Reconcile expired jobs
                    </button>
                    {table("followups").map((f) => (
                      <div className="taskRow" key={f.id}>
                        <div>
                          <strong>{f.kind}</strong>
                          <small>{f.reason ?? when(f.due_at)}</small>
                        </div>
                        <Badge value={f.status} />
                      </div>
                    ))}
                    <div className="callout">
                      <b>{table("outbox").length} durable events</b>
                      <p>
                        Business events are stored separately from notification
                        delivery.
                      </p>
                    </div>
                  </section>
                </div>
              )}
              {tab === "Reports" && (
                <div className="twoCol">
                  <section className="card">
                    <div className="sectionTitle">
                      <h2>Money, clearly separated</h2>
                      <span className="pill">BDT</span>
                    </div>
                    {[
                      ["Verified paid", data.reports.paid_minor],
                      [
                        "COD awaiting settlement",
                        data.reports.cod_pending_minor,
                      ],
                      ["COD settled", data.reports.cod_settled_minor],
                    ].map(([label, val]) => (
                      <div className="reportLine" key={label}>
                        <span>{label}</span>
                        <strong>{money(val)}</strong>
                      </div>
                    ))}
                    <p>
                      Delivery does not mean payment or COD settlement. No AI
                      attribution is inferred.
                    </p>
                  </section>
                  <section className="card">
                    <h2>Operational health</h2>
                    {[
                      ["Low-stock variants", data.reports.low_stock],
                      ["Pending outbox jobs", data.reports.pending_jobs],
                      ["Open incidents", data.reports.open_incidents],
                      ["Human-owned conversations", data.reports.human_owned],
                    ].map(([l, v]) => (
                      <div className="reportLine" key={l}>
                        <span>{l}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                    <p>
                      All-time verified counts · timestamps use Asia/Dhaka.
                      Trends and AI token costs are not available yet.
                    </p>
                  </section>
                </div>
              )}
              {tab === "Sandbox" && (
                <div className="twoCol">
                  <section className="card">
                    <div className="sectionTitle">
                      <h2>Conversation lab</h2>
                      <span className="pill amber">
                        {data.ai_mode === "openai"
                          ? "OpenAI configured"
                          : "Offline rule planner"}
                      </span>
                    </div>
                    <p>
                      {data.ai_mode === "openai"
                        ? "Model-powered intent planning; mutable facts are verified in the database."
                        : "No paid model calls. Test multilingual catalog aliases and the protected conversation pipeline."}
                    </p>
                    <div className="samples">
                      {[
                        "ভাই কালো জুতা ৪২ আছে?",
                        "vai black shoe 42 size ase? price koto?",
                        "Is DEMO-SHIRT-M available?",
                      ].map((x) => (
                        <button
                          className="chip"
                          key={x}
                          onClick={() => setMessage(x)}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                    <div className="labChat">
                      {chat.map((x, i) => (
                        <div
                          key={i}
                          className={
                            "bubble " + (x.role === "assistant" ? "agent" : "")
                          }
                        >
                          <small>{x.role}</small>
                          <p>{x.text}</p>
                        </div>
                      ))}
                    </div>
                    <form
                      action={() =>
                        act(async () => {
                          setChat((x) => [
                            ...x,
                            { role: "customer", text: message },
                          ]);
                          const r = await request("/api/w01", {
                            merchant_id: m,
                            event_id: crypto.randomUUID(),
                            customer_id: customer,
                            channel: "website",
                            text: message,
                          });
                          setChat((x) => [
                            ...x,
                            {
                              role: "assistant",
                              text: r.draft ?? `Status: ${r.status}`,
                            },
                          ]);
                          await refresh();
                        })
                      }
                    >
                      <label>
                        Customer message
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          required
                          maxLength={4000}
                        />
                      </label>
                      <button className="primary" disabled={busy || !canWrite}>
                        Test conversation
                      </button>
                      <button
                        className="quiet"
                        type="button"
                        onClick={() => {
                          setCustomer("sandbox-" + crypto.randomUUID());
                          setChat([]);
                        }}
                      >
                        New test customer
                      </button>
                    </form>
                  </section>
                  <section className="card">
                    <h2>COD order test</h2>
                    <p>
                      Prices and fees are calculated in the database. Confirm
                      only after reviewing the summary.
                    </p>
                    <form
                      action={(f) =>
                        act(async () => {
                          const r = await request("/api/commerce", {
                            merchant_id: m,
                            action: "draft",
                            variant_id: f.get("variant"),
                            quantity: Number(f.get("quantity")),
                            name: f.get("name"),
                            phone: f.get("phone"),
                            district: f.get("district"),
                            address: f.get("address"),
                          });
                          setDraft(r.order);
                          await refresh();
                        })
                      }
                    >
                      <label>
                        Product variant
                        <select name="variant" required>
                          {variants.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.sku} · {money(v.price_minor)} ·{" "}
                              {inventory(v.id)} available
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="formRow">
                        <label>
                          Quantity
                          <input
                            name="quantity"
                            type="number"
                            min={1}
                            max={20}
                            defaultValue={1}
                            required
                          />
                        </label>
                        <label>
                          Test customer
                          <input
                            name="name"
                            defaultValue="Sandbox Customer"
                            required
                            minLength={2}
                          />
                        </label>
                      </div>
                      <div className="formRow">
                        <label>
                          Bangladesh phone
                          <input
                            name="phone"
                            defaultValue="01700000000"
                            pattern="01[3-9][0-9]{8}"
                            required
                          />
                        </label>
                        <label>
                          Delivery district
                          <select name="district">
                            <option>Dhaka</option>
                            <option>Khulna</option>
                            <option>Chattogram</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Test address
                        <textarea
                          name="address"
                          defaultValue="Synthetic test address, do not deliver"
                          required
                          minLength={10}
                        />
                      </label>
                      <button
                        className="secondary"
                        disabled={busy || !canWrite}
                      >
                        Calculate order summary
                      </button>
                    </form>
                    {draft && (
                      <div className="orderSummary">
                        <div className="sectionTitle">
                          <strong>#{draft.id.slice(0, 8)}</strong>
                          <Badge value={draft.status} />
                        </div>
                        <p>
                          {draft.customer_name} · {draft.phone}
                          <br />
                          {draft.address}, {draft.district}
                        </p>
                        <div className="reportLine">
                          <span>{draft.quantity} × item price</span>
                          <b>
                            {money(draft.quantity * draft.unit_price_minor)}
                          </b>
                        </div>
                        <div className="reportLine">
                          <span>Delivery</span>
                          <b>{money(draft.delivery_minor)}</b>
                        </div>
                        <div className="reportLine total">
                          <span>Total · COD</span>
                          <b>{money(draft.total_minor)}</b>
                        </div>
                        {draft.status === "awaiting_confirmation" && (
                          <form
                            action={(f) =>
                              act(async () => {
                                if (f.get("accepted") !== "yes")
                                  throw Error(
                                    "Explicit confirmation is required",
                                  );
                                const r = await request("/api/commerce", {
                                  merchant_id: m,
                                  action: "confirm",
                                  order_id: draft.id,
                                  confirmation_token: draft.confirmation_token,
                                  accepted: true,
                                });
                                setDraft(r.order);
                                setNotice(
                                  "One COD order confirmed. No payment collected or customer message sent.",
                                );
                                await refresh();
                              })
                            }
                          >
                            <label className="check">
                              <input
                                name="accepted"
                                type="checkbox"
                                value="yes"
                                required
                              />
                              I confirm this exact synthetic COD order.
                            </label>
                            <button
                              className="primary"
                              disabled={busy || !canWrite}
                            >
                              Confirm test order
                            </button>
                          </form>
                        )}
                        {draft.status === "confirmed" && (
                          <>
                            <small>
                              Payment and COD settlement remain pending.
                            </small>
                            <div className="samples">
                              {["booked", "in_transit", "delivered"].map(
                                (s) => (
                                  <button
                                    key={s}
                                    className="chip"
                                    disabled={busy || !canWrite}
                                    onClick={() =>
                                      void act(() =>
                                        op({
                                          action: "shipment",
                                          order_id: draft.id,
                                          state: s,
                                        }),
                                      )
                                    }
                                  >
                                    Simulate {s.replaceAll("_", " ")}
                                  </button>
                                ),
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              )}
              {tab === "Settings" && (
                <div className="twoCol">
                  <section className="card">
                    <h2>Workspace safety</h2>
                    <div className="reportLine">
                      <span>Environment</span>
                      <span className="pill amber">Sandbox</span>
                    </div>
                    <div className="reportLine">
                      <span>Live customer messages</span>
                      <strong>Disabled</strong>
                    </div>
                    <div className="reportLine">
                      <span>Your role</span>
                      <strong>{role}</strong>
                    </div>
                    <div className="reportLine">
                      <span>Timezone</span>
                      <strong>Asia/Dhaka</strong>
                    </div>
                    <p>
                      Products and delivery fees are synthetic. Merchant
                      approval is required before any production cutover.
                    </p>
                  </section>
                  <section className="card">
                    <h2>Integrations</h2>
                    {[
                      "Meta Messenger / Instagram / WhatsApp",
                      "Payment gateway",
                      "Courier provider",
                      "WooCommerce catalog",
                    ].map((x) => (
                      <div className="reportLine" key={x}>
                        <span>{x}</span>
                        <span className="pill amber">Not connected</span>
                      </div>
                    ))}
                    <p>
                      Official provider credentials and external approvals are
                      required. No integration is marked connected from a mock
                      result.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            FlowPi · Bangladesh commerce operations
            <span>Asia/Dhaka · Sandbox build</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  note: string;
  accent?: boolean;
}) {
  return (
    <section className={"metric " + (accent ? "accent" : "")}>
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
      <small>{note}</small>
    </section>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="emptyIcon">◇</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "pill " +
        (["confirmed", "answered", "delivered"].includes(value)
          ? "green"
          : ["human_owned", "awaiting_confirmation", "open"].includes(value)
            ? "amber"
            : "")
      }
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
