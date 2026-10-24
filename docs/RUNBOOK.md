# Sandbox operation and production gates

## Setup

Node 22+, `npm ci`, `npm test`, `npm run typecheck`, `npm run build`. Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the dedicated Vercel preview environment. No service key is exposed to browsers. `OPENAI_API_KEY`/`OPENAI_MODEL` are optional server-only variables; absent credentials mean explicit offline rules mode. Never paste secrets in chat or source control.

Sign up/confirm email, sign in, create a sandbox workspace. The owner becomes the merchant's owner through a checked, idempotent onboarding RPC. Seed products and delivery rules are synthetic. Test in Sandbox, inspect Inbox/Orders/Products/Tasks/Reports, then exercise takeover. CSV imports create new SKUs only and reject duplicates transactionally.

## Recovery

Do not retry a financial/shipping action without checking prior provider outcome. Outbox leases expire to manual reconciliation. For stuck W01 processing, the recovery RPC marks the thread human-owned and creates an incident after 2 minutes. It does not resend. Resume AI only after inspecting the timeline and clearing the incident operationally. Independent uptime monitoring is not yet configured.

## Release gates

No production deployment or live channel activation is authorized by a successful sandbox test. Before cutover: review privileged RPCs; add per-agent assignment permissions; approve retention/export/deletion; load/rate/cost tests; 200+ model evaluations; authoritative catalog; genuine provider callbacks and identity checks; worker credentials; verified send receipts and channel windows; external monitoring; backup/restore evidence; merchant acceptance; n8n licensing and privacy/ToS review. Billing remains inactive.

## Backup / rollback

Versioned source and additive migrations are retained. This is NOT a tested backup system. Verify Supabase plan backup capabilities and take a secure database export before real merchant data. Restore into a separate project and reconcile order counts/amounts before any production claim. Roll back the application to a tested preview commit without dropping business data. New migrations require review; never use destructive reset on a populated project.
