# V5.2 architecture checkpoint

Master requirements: `MASTER_SPEC_V5_2.md`. Existing repository baseline is preserved on a development branch. No unrelated project is changed.

- `apps/web`: Next.js/TypeScript dashboard and authenticated HTTP API. Supabase user identity is validated server-side using `getUser(token)`. Browser receives only a publishable key. API reads use that user's JWT and RLS; no service key is needed for the dashboard.
- `src`: W01 conversation processing, OpenAI structured intent extraction, explicit offline rule planner, server-only catalog adapter. Model-written price/stock is never accepted.
- `supabase/migrations`: versioned schema. Every tenant table has RLS and explicit grants. Member reads are tenant scoped. Commerce writes use named RPC functions with fixed search paths and explicit role/tenant checks.
- `flowpi_private.allowed`: private membership lookup with validated `auth.uid()`, not editable user metadata. It is SECURITY DEFINER solely to avoid recursive membership RLS.
- Named public SECURITY DEFINER commerce RPCs are intentional to prevent arbitrary table writes while retaining atomic transactions. Supabase advisor warns on this exposure; role/tenant tests pass, but an independent security review is still a release gate. No blanket claim of zero security issues.
- Canonical catalog = `flowpi_products` descriptions + `flowpi_variants` prices + `flowpi_inventory` stock. Legacy product price/stock columns remain only for baseline compatibility, are not commerce truth, and are not writable by dashboard users.
- Internal inventory is re-read transactionally. External inventory is not integrated and cannot be used to confirm orders without a source-of-truth adapter.
- Confirming a COD draft locks order + variant + inventory, rechecks price/fee/quantity, decrements stock once, creates items/payment/shipment/COD/outbox/audit records atomically. Confirmation token + draft row are the retry key. No financial capture occurs.
- Outbox claims use SKIP LOCKED and lease tokens. Expired claims dead-letter for reconciliation rather than blindly replaying external operations. A durable scheduled worker is not active.
- Sandbox shipment transitions cannot alter payment or COD state. Follow-up review cancels ineligible tasks and defers everything else while sending is disabled.
- n8n remains an inactive orchestration layer; the transactional backend does not require an n8n node chain to create orders.

## Not finished

Conversational order-field collection is not complete: the sandbox currently uses the explicit COD form. OpenAI API evaluation, multilingual natural reply generation, vector RAG, media, real messaging gateway, customer identity verification, payment/courier/catalog providers, staff assignment/case resolution, subscriptions, quotas/billing, production retention/export/delete, independent monitoring and backup restore drills remain separate work. Current dashboard returns a bounded first 200 records; production pagination and per-agent assignment restrictions are not implemented. All current staff roles are tenant scoped; viewer is read-only. No customer-facing website widget is published.
