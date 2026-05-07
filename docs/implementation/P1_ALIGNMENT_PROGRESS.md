# P1 Alignment Progress (SRS v3.2 + Implementation Plan v1.2)

Last update: 2026-05-07 (UTC)

## Scope of this alignment pass
- Compare current codebase against:
  - `docs/srs/SRS_AI_Sales_Agent_P1_v3_2.docx`
  - `docs/implementation/Implementation_Plan_AI_Sales_Agent_P1_v1_2.docx`
- Remove runtime parts not on active P1 flow.
- Add missing foundations required by locked documents, prioritize BR-01 and BR-21A..D.

## Completed in this pass
- [x] Runtime API trimmed to active P1 modules only.
  - Removed legacy module wiring from `AppModule`: `DiscoveryModule`, `IcpModule`, `CandidateModule`, `AnalysisModule`.
  - Removed unused legacy queue registration `discovery` from queue bootstrap.
- [x] Search input aligned with BR-01.
  - `companyName/keyword`: validated length `2..128`.
  - Added optional `industry` input (`2..120`) in API DTO and persisted to `search_jobs.industry`.
  - Workspace form updated to send/display `industry`.
- [x] P1 Email Safe Mode foundation added (BR-21A..D preparation).
  - New migration `0007_p1_email_safe_mode.sql` with:
    - `feature_flags`
    - `drafts`
    - `draft_review_logs`
    - `email_history` (with `intended_recipient`, `actual_recipient`, `redirected`)
  - Seeded flags:
    - `enable_external_send = false`
    - `outbound_redirect_target = tandtnt18@gmail.com`
    - `smtp_allowlist_domains = ["gmail.com", "vnetwork.vn"]`
  - Added API endpoints:
    - `GET /p1/email-safe-mode`
    - `POST /p1/email-safe-mode/preview`
  - Preview logic applies:
    - redirect when safe mode is on
    - subject prefix `[P1-DEMO -> intended_recipient]`
    - P1 demo banner in body
    - allowlist domain guard
    - audit headers `X-VN-*`
- [x] Environment/config alignment for safe mode.
  - Added `.env.example` vars:
    - `P1_ENABLE_EXTERNAL_SEND`
    - `P1_OUTBOUND_REDIRECT_TARGET`
    - `P1_SMTP_ALLOWLIST_DOMAINS`
  - Added matching env validation + config mapping.
- [x] Playbook/UI wording updated to avoid outdated statements.
- [x] Telegram-ready review flow scaffolding for demo.
  - Added webhook endpoint: `POST /p1/telegram/webhook?secret=...`
  - Added Telegram command support:
    - `/prompt_show compose|serialize`
    - `/prompt_set compose|serialize <text>`
  - Added inline callback actions: `Approve` / `Reject` from bot card.
- [x] Draft + review + safe-send demo flow.
  - Added `POST /p1/prospects/:id/generate-draft`
  - Added `GET /p1/drafts`
  - Added `POST /p1/drafts/:id/review` (approve/reject/edit)
  - Added queue worker `p1-email-send` writing `email_history` in Safe Mode.
- [x] Frontend demo workspace rebuilt for CEO rehearsal.
  - `workspace` now includes:
    - SC-03 New Search form
    - SC-04 Job tracking table + retry
    - SC-05 Prospect pipeline with quick status update + generate draft
    - SC-07 Draft inbox
    - SC-08 Draft editor + approve/reject/edit actions
    - Safe-mode preview panel for redirected outbound payload
  - Landing page updated for demo-day narrative and setup checklist.

## Pending gaps (not implemented yet)
- [ ] SMTP real delivery (Nodemailer/relay) is not wired yet; current send stage is safe-mode persisted send for demo traceability.
- [ ] IMAP bounce listener + DSN parse + Telegram alert.
- [ ] AI dual-provider serialize/compose failover (Gemini/OpenAI) per SRS.
- [ ] Realtime SC-04 transport (SSE/WebSocket) for worker progress.
- [ ] Docker packaging target in SRS 8.4 (multi-service image matrix) not fully split yet.

## Notes
- Legacy source files remain in repo for reference, but are no longer mounted in runtime `AppModule`.
- This file should be updated after every implementation batch.
