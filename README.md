# FlowPi E-com Agent V5

Development foundation for the approved self-hosted n8n + Supabase + Vercel stack. W01 produces **drafts only**, never sends customer messages. Live customer workflows require owner approval.

## Implemented

- Authenticated, merchant-scoped `POST /api/w01` with default-off enable switch.
- OpenAI structured intent/query planning for Bangla, English, Banglish; bounded conversation history.
- Tenant-scoped catalog search (name, SKU, multilingual aliases), separate price/stock re-read, 60-second freshness gate. Integer minor-unit BDT prices are rendered by code.
- Approved policy lookup, human escalation, pending AI draft suppression on takeover.
- Transactional event claim/deduplication, per-conversation serialization, message and draft logging.
- Supabase foundation: eight private RLS-enabled tables and eight service-only RPC functions.
- Inactive manual-only n8n W01 workflow export, without customer triggers or send nodes.

## Development

Node 22+; `npm ci`, `npm test`, `npm run check`. No runtime dependencies. Copy `.env.example` to an untracked `.env.local`. Configure secrets through secure Vercel/n8n credential interfaces, never GitHub or chat. No development server or remote deployment has been started yet.

The endpoint accepts `{merchant_id,event_id,customer_id,channel,text}`. This is a trusted normalized internal envelope, **not** a raw Meta/WhatsApp webhook. A future channel gateway must validate provider signatures, map credentials to merchant, enforce rate limits, and normalize events before calling it.

## Infrastructure

- GitHub: `imtiazrahman1c/flowpi-ecom-agent`
- Supabase development ref: `rfmgtigefzofqxquxwvp` (Singapore)
- Vercel development project: `flowpi-ecom-agent-v5-dev`
- n8n: existing owner-hosted instance; login/import pending.

Apply `db/foundation.sql` only to an empty dedicated development project. It is already applied to the above Supabase project. `db/smoke.sql` creates synthetic fixtures inside a transaction and rolls back everything.

## Remaining before an end-to-end test

1. Securely configure OpenAI API access and select a model supporting Responses structured output.
2. Configure backend Supabase server credential and a random ingress token (at least 32 characters), bind one development merchant UUID, then enable development processing deliberately.
3. Connect an authoritative store catalog/inventory source. Current Supabase catalog is empty; importing names/aliases is not a live inventory integration. `verified_at` must reflect a genuine source verification, never an arbitrary freshness refresh.
4. Deploy a protected preview and validate it before importing/configuring n8n.
5. In n8n, import `n8n/W01-development.json`, keep inactive, configure its backend URL, development merchant UUID, and HTTP Header Auth credential (`Authorization: Bearer <ingress token>`). Vercel protected previews also need authorized machine access configured securely.
6. Run manual synthetic Bangla, English, Banglish cases. No channel send step is present.

## Scope and limitations

This is an initial functional backend slice, not completed production W01. Language detection is a heuristic; natural-language classification still needs real model evaluation. Product replies use localized templates. FAQ answers reproduce approved policy text in its stored language (no translation or vector RAG yet). Voice/image require human handling; W02/W03 are routed to human support, not implemented. No channel gateway, customer UI, automated delivery, live catalog sync, or production monitoring is claimed.

A process crash can leave a conversation locked with `processing_event`. There is intentionally no unsafe automatic replay timeout. An operator must inspect the event/draft and reconcile before clearing it; no customer send can occur in this version. The service-role credential bypasses RLS, so all RPC queries enforce merchant constraints and the ingress token is bound to a single merchant. No frontend database access policies are installed.
