# Actual test evidence — 24 October 2026

Environment: dedicated Supabase `rfmgtigefzofqxquxwvp`, local Node 24.22.1. No live customers or payment providers.

- 42 Node tests pass: 3 language heuristics; sandbox alias/ambiguity routing; risky request handoff; validated price/stock rendering; stale stock escalation; duplicate/busy/human locks; provider failure; CSV quoting/minor units/rejection; sandbox HMAC tamper/time checks; follow-up stop rules.
- Next.js production build passes; TypeScript check passes.
- Runtime dependency audit: high-severity Zod finding detected, upgraded to 4.6.7; subsequent audit reports 0 vulnerabilities.
- `db/v52-smoke.sql`: actual authenticated database role + JWT claims tested; tenant isolation, viewer write rejection, explicit confirmation, calculated totals, duplicate confirmation, single stock decrement/outbox event, independent shipment/payment/COD states, reports, human takeover race and follow-up cancellation pass. Synthetic data rolled back.
- Concurrent confirmation: two independently committed drafts competed for one available unit, using two concurrent database calls. Exactly one confirmed, the other returned `out_of_stock`; database showed stock 0 and one outbox event. Disposable test tenant removed after verification.
- 22 tenant tables have RLS enabled. Security advisor reports warnings on 13 intentional authenticated SECURITY DEFINER RPCs; documented review gate, not suppressed.

Not yet evidenced: paid OpenAI calls, 200-case model evaluation, full browser customer-to-order flow with owner acceptance, official channel/webhook/payment/courier tests, n8n restart tests, backup restore, load/latency targets, production readiness. Sandbox HMAC tests are not provider-certification evidence.

Additional HTTP smoke: `node scripts/http-smoke.mjs` starts/stops the production Next server in the same test process. `/` and `/api/health` returned 200; unauthenticated workspace, W01, commerce, operations and reports routes returned 401. This does not replace signed-in browser E2E.

n8n evidence: separate W01 sandbox workflow `p1V7zVprZKBJOC1U` saved with manual trigger, synthetic configuration and authenticated backend HTTP node; unpublished, not executed. Backend URL/merchant/credential placeholders remain until preview authorization and merchant authentication. Execution storage disabled and timezone set to Asia/Dhaka.

Vercel preview attempt: blocked by a missing team access grant (403), so no deployed URL is claimed. Owner authorization requested through provider-issued consent link.
