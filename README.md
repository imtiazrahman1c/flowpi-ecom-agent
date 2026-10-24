# FlowPi E-com Agent — V5.2 sandbox MVP

Master product specification: [docs/MASTER_SPEC_V5_2.md](docs/MASTER_SPEC_V5_2.md).

A Next.js/TypeScript merchant workspace backed by Supabase Auth/Postgres. Core navigation: Inbox, Orders, Products, Tasks, Reports, with a synthetic customer test lab. No live customer sending or financial capture is enabled.

## Run

Node 22+. `npm ci`, `npm test`, `npm run typecheck`, `npm run build`. For local development configure the two public Supabase environment variables in `.env.local`, then `npm run dev`. OpenAI API/model credentials are server-only and optional; without them the UI explicitly says offline rule planner. No real AI evaluation is claimed from deterministic tests.

## What works in the implemented sandbox

- Tenant membership and RLS; server-validated user identity; viewer read-only access.
- Multilingual alias-based product inquiry through the W01 pipeline; canonical database price/stock verification, duplicate handling, logged drafts, human takeover.
- Synthetic catalog seeding and transactional CSV import.
- COD draft summary with server-calculated prices/fees, explicit confirmation, atomic inventory/outbox writes, retry safety and cancellation restrictions.
- Separate order/payment/shipment/COD states; sandbox shipment simulator.
- Follow-up eligibility review with no-send guard; incident capture; leased durable jobs/reconciliation; tenant-scoped reports.
- Versioned inactive n8n W01–W07 exports with explicit blockers; W02 notification template intentionally blocks unconfigured external sends.

See [test evidence](docs/TEST_EVIDENCE.md), [architecture/limitations](docs/ARCHITECTURE.md), [runbook](docs/RUNBOOK.md) and [workflow status](n8n/workflows/README.md).

## Infrastructure

Dedicated development Supabase ref `rfmgtigefzofqxquxwvp`, Vercel project `flowpi-ecom-agent-v5-dev`, GitHub `imtiazrahman1c/flowpi-ecom-agent`. The existing self-hosted n8n is authenticated; unrelated workflows remain unchanged. Migrations are applied to the development database; never re-run the initial schema over an existing project. Baseline `api/w01.mjs` is an older disabled internal ingress; the dashboard uses `apps/web/app/api/w01/route.ts`.

## Honest boundaries

This is not a finished W01–W07 SaaS or production-ready release. Full conversational ordering, natural multilingual AI replies, voice/image, official Meta/payment/courier/catalog integration, staff assignment, complete support cases, billing, production monitoring and restore drills remain unfinished. Provider access/owner acceptance gates are documented. Do not enable live automations from this repository without approval.
