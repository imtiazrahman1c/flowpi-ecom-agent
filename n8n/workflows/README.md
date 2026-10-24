# FlowPi V5.2 workflow inventory

All exports are inactive, have execution-body persistence disabled, and contain no credential values. HTTP nodes require a configured **HTTP Header Auth** credential and verified protected-preview URL. The application endpoints require an authenticated Supabase user bearer token scoped by membership; do not use a publishable key as bearer identity. Short-lived user tokens are suitable for manual sandbox tests only. Durable machine credentials/worker identity remain a blocker before scheduled use.

| Group | Current implementation | Evidence / limitation |
|---|---|---|
| W01 | Manual synthetic event → secure backend → saved draft | Backend tests passed; n8n network integration not yet tested |
| W02 | Backend atomic COD confirmation + durable outbox | Notification workflow deliberately throws until sender/worker configured |
| W03 | Manual sandbox shipment state update | No courier booking/payment provider integration |
| W04 | Inactive schedule → eligibility review; send count always zero | No consent-based live sender configured |
| W05 | Manual human takeover API | Customer thread must already exist |
| W06 | Inactive schedule → tenant-scoped reports API | No merchant email/notification configured |
| W07 | Error trigger → sanitized incident API | Independent external uptime monitoring still required |

Do not activate schedules or publish customer triggers. Replace only synthetic placeholders. Protected Vercel previews additionally require authorized machine access; do not weaken deployment protection. Test against the installed n8n node versions before treating exports as validated imports. Re-run generator to reproduce JSON.
