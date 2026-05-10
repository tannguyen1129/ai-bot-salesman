**VNETWORK JOINT STOCK COMPANY**

*Internal Confidential — Sales Automation R&D*

# KẾ HOẠCH TRIỂN KHAI

*Implementation Plan & Demo Playbook*

# AI SALES AGENT — PHASE 1

Roadmap · Mock-to-Real · Custom Crawler · Demo cho CEO

Phiên bản: 1.2 — Locked Stack (NestJS · Next.js · PostgreSQL · Docker) + Email Safe Mode + Test Scenario Chứng khoán

Ngày phát hành: 07/05/2026

Tài liệu đi kèm: SRS — AI Sales Agent — Phase 1 v3.0

# 1. Mục đích và bối cảnh

Tài liệu này là kế hoạch triển khai cụ thể của AI Sales Agent — Phase 1, đi cùng SRS v3.0 đã được CEO và Head Solution duyệt. Mục tiêu của tài liệu này không phải lặp lại nghiệp vụ — mà trả lời ba câu hỏi mà đội Dev và CEO đang hỏi nhau:

1.  Triển khai theo từng giai đoạn nào, mỗi giai đoạn ra sản phẩm gì có thể chạm vào được?

2.  Khi chưa có dữ liệu thật từ Apollo/Hunter/RapidAPI, đội làm sao demo được luồng end-to-end mà không bị lỗ hổng — và làm sao chuyển dần sang dữ liệu thật một cách kiểm soát?

3.  Đến buổi demo cho CEO, kịch bản từng phút diễn ra như thế nào, dùng dữ liệu công ty thật nào, nếu API bên ngoài chết giữa chừng thì có Plan B gì?

Đây là một tài liệu sống. Cập nhật theo demo rehearsal và phản hồi của CEO sau mỗi milestone.

## 1.1. Nguyên tắc triển khai

-   Demo-first, polish-later: ưu tiên đi xuyên end-to-end với chất lượng vừa đủ, sau đó mới đào sâu từng module. Không khoá module bên dưới hoàn hảo trước khi sang module trên.

-   Mock-by-default, real-by-flag: mỗi nguồn dữ liệu (Apollo, Rapid, Hunter, Gemini, OpenAI, SMTP, IMAP, Telegram, Crawler) đều có 2 phiên bản — Fake và Real — chuyển bằng feature flag. Demo cuối dùng Real, dev hằng ngày dùng Fake.

-   Không build cái không demo được trong Phase 1. Mọi câu "thêm cái này hay" đẩy sang P2/P3 nếu không nằm trong demo plan.

-   Demo dùng dữ liệu công ty thật của thị trường — không bịa. Nhưng chỉ chọn các công ty hạng B-tier (mid-size, không phải Big Tech) để giảm rủi ro pháp lý/PR và tránh khả năng bị block bởi anti-scraping của các tập đoàn lớn.

-   Mọi tích hợp ngoài VNETWORK đều phải có quota check + circuit breaker. Một API hết quota không được làm sập demo.

## 1.2. Đối tượng đọc

| Vai trò           | Phần cần đọc kỹ                                                      |
| --- | --- |
| CEO                   | Chương 1, 2 (Roadmap), 6 (Demo Plan), 8 (Acceptance Criteria)            |
| Head Solution         | Toàn bộ tài liệu — đặc biệt Chương 3 (Mock→Real), 4 (Crawler), 7 (Risks) |
| Sales Auto Team (Dev) | Chương 2, 3, 4, 5 (Team & Timeline)                                      |
| Sales Admin / HOS     | Chương 6 (Demo), 8 (Acceptance), Phụ lục A (Test data)                   |

# 2. Lộ trình triển khai theo Milestone

Phase 1 chia thành 6 milestone, đặt tên M0 → M5. Mỗi milestone kéo dài 2 tuần (tổng 12 tuần) và kết thúc bằng một bản demo nội bộ — kể cả khi nội dung còn ít. Cứ end-to-end là demo. Mỗi demo nội bộ đều có Head Solution dự, mỗi 2 demo có 1 lần CEO dự.

## 2.1. Tổng quan milestone

| Milestone | Tuần | Tên           | Demo deliverable                                                                                | Trạng thái dữ liệu             |
| --- | --- | --- | --- | --- |
| M0            | T1-T2    | Foundation        | Repo + CI/CD + skeleton chạy hello-world FE/BE/Worker; deploy được lên DEV                          | Mock 100%                          |
| M1            | T3-T4    | Search Core       | Nhập tên công ty → tạo job → 4 adapter mock chạy → có Company Report giả lưu DB; UI hiện realtime   | Mock 100%                          |
| M2            | T5-T6    | AI Layer          | Adapter Apollo + Hunter sandbox thật; Gemini + OpenAI thật; sinh draft email cho 1 prospect mẫu     | Mock 50% / Real 50%                |
| M3            | T7-T8    | Telegram Review   | Bot Telegram nhận draft, Approve/Edit/Reject; SMTP gửi mail tới hộp test nội bộ                     | Real cho test inbox; Real provider |
| M4            | T9-T10   | Bounce + Learning | IMAP listener thật; force bounce thử nghiệm; Template Learning promote candidate                    | Real toàn bộ trừ LinkedIn          |
| M5            | T11-T12  | Pre-Demo + UAT    | Custom Crawler hoàn thiện; RapidAPI LinkedIn live; UAT với 5 công ty thật; rehearsal demo CEO 2 lần | Real 100% — production-like        |

## 2.2. M0 — Foundation (T1-T2)

**Mục tiêu**

-   Repo monorepo với npm workspaces: apps/web (Next.js 14), apps/api (NestJS), apps/worker-\* (NestJS standalone), apps/bot-telegram (NestJS), libs/\* (shared).

-   Mỗi app có Dockerfile multi-stage riêng, sinh được 8 Docker image (xem SRS Chương 8.4.1).

-   Pipeline CI: build + lint + type-check + test + build Docker image + push lên registry (Harbor / GHCR).

-   Pipeline CD: auto deploy DEV qua GitHub Actions (compose pull && compose up -d); STG deploy theo nút bấm.

-   Hạ tầng DEV qua docker-compose: PostgreSQL 15 (kèm pg_trgm + pgvector), Redis 7, MinIO, MailHog, traefik. Lệnh \`docker compose up\` là chạy.

-   App skeleton: api có /health, web (Next.js) hiện trang "AI Sales Agent v0.0.1", worker log mỗi 5s. Tất cả chạy trong container.

**Acceptance**

-   dev mới clone repo + chạy make up → mở http://localhost xem được trang chủ trong &lt; 10 phút.

-   Push commit vào main → CI pass → DEV được deploy auto trong &lt; 10 phút.

**Rủi ro chính**

-   Mất thời gian vào setup mạng/secret. Mitigation: có sẵn Vault dev shared, không tự host.

## 2.3. M1 — Search Core (T3-T4)

**Mục tiêu**

-   Màn hình SC-03 New Search hoạt động: nhập tên công ty + region → tạo SearchJob trong DB → chạy 4 adapter MOCK song song → ra JSON normalized → CompanyReport giả.

-   4 adapter mock đều có giả lập latency 1-3s và cố ý fail random ~10% để test resilience.

-   Realtime log job qua WebSocket vào màn SC-04.

-   Aggregator đầy đủ: dedup, weighted score, validate format.

-   CRUD job: list, retry, cancel.

**Demo nội bộ M1**

-   Nhập "Acme Corp" → 4 thanh progress chạy → 5 giây sau có Company Report giả với 8 key persons.

-   Nhấn retry trên job → vẫn hoạt động, idempotent.

**Acceptance**

-   E2E test (Playwright): nhập tên → đợi report → so JSON expected. Pass 10/10 lần.

-   Job duration P95 &lt; 10s với mock.

## 2.4. M2 — AI Layer (T5-T6)

**Mục tiêu**

-   Tích hợp Apollo sandbox thật + Hunter thật.

-   AI Gateway hoàn thiện với 3 task: serialize, scenario_pick, compose.

-   Dual-provider Gemini + OpenAI thật, có failover khi 1 trong 2 fail.

-   AI tạo Company Report từ raw thật, sinh ≥ 1 draft email cho 1 prospect.

-   Bảng Industry Scenario có sẵn 6 scenario seed do Sales Admin nhập (Fintech-CTO, Fintech-CEO, Ecom-CMO, Gov-CIO, Logistics-COO, Mfg-IT).

**Demo nội bộ M2**

-   Search 1 công ty thật (mid-size, ngành Fintech VN) → có report đầy đủ → có 3 draft email cho 3 key person → mở từng draft xem nội dung sinh tự nhiên, có chi tiết cá nhân hóa.

**Acceptance**

-   AI cost track có log chính xác/call.

-   Failover: tắt API Gemini cứng → vẫn ra draft (dùng OpenAI), không 5xx.

-   Schema validation: 0 lỗi schema trong 50 lần serialize.

## 2.5. M3 — Telegram Review (T7-T8)

**Mục tiêu**

-   Tích hợp Telegram Bot — webhook nhận callback Approve/Edit/Reject/Snooze.

-   Bảo mật bot: whitelist tg_user_id; verify HMAC initData.

-   SMTP relay (Postmark sandbox hoặc internal MTA test) gửi mail tới hộp test nội bộ (sales-test@vnetwork.vn).

-   Telegram Mini App SC-08 hoạt động: View full + Edit.

-   Lưu lịch sử email_history với message_id.

**Demo nội bộ M3**

-   Nhân viên Sales nhận draft trên Telegram → bấm Approve → 5 giây sau email rơi vào hộp sales-test@vnetwork.vn.

-   Sales bấm Edit → mở Mini App → sửa → quay lại Telegram approve → mail mới gửi.

**Acceptance**

-   Approve → Send latency P95 &lt; 10s.

-   Click ngoài whitelist bị từ chối + ghi audit.

-   Edit ghi diff đúng vào draft_review_logs.

## 2.6. M4 — Bounce + Template Learning (T9-T10)

**Mục tiêu**

-   IMAP listener trên hộp bounce@vnetwork.vn (mailbox dùng riêng cho test).

-   Parse DSN, lookup ngược draft.id qua header X-VN-Draft-Id, cập nhật trạng thái email + alert Telegram.

-   Suppression list hoạt động: gửi mail tới recipient đã suppress thì bị block.

-   Template Learning Engine: candidate sau approved-as-is → cron promote → Sales Admin notify.

**Demo nội bộ M4**

-   Cố ý gửi mail tới một địa chỉ không tồn tại (vd: trana123abc@gmail.com) → 1-2 phút sau Telegram đẩy alert bounce + prospect bị suppress.

-   Approve liên tiếp 3 draft Fintech-CTO không sửa → cron promote → Admin nhận notify trong UI.

**Acceptance**

-   Mean time to Telegram alert ≤ 5 phút từ DSN.

-   Suppression rule pass 5/5 test case.

-   Cron Template Learning đúng theo BR-22, BR-23.

## 2.7. M5 — Pre-Demo + UAT (T11-T12)

**Mục tiêu**

-   Custom Crawler hoàn thiện theo Chương 4.

-   RapidAPI LinkedIn live (đã mua plan).

-   UAT toàn bộ luồng với 5 công ty mid-size thật được CEO chọn (xem Phụ lục A).

-   Rehearsal demo CEO 2 lần — mỗi lần có Head Solution và HOS dự.

-   Quay video full demo dài 7 phút làm Plan B nếu hôm CEO xem live API có sự cố.

-   Đóng băng feature; chỉ cho phép bug fix tuần cuối.

**Acceptance**

-   UAT 5 công ty pass ≥ 4/5 — mỗi job ra report đủ + draft đủ + duyệt được + mail gửi được.

-   BRAC v3 (33 rule) tick ≥ 30/33; 3 rule còn lại documented và có lộ trình P1.5.

-   Rehearsal lần 2 không có sự cố blocking.

# Mục lục

# 3. Chiến lược Mock → Real Data

Đây là phần quan trọng nhất để dev chạy hằng ngày mà không bị cản bởi quota API, không lo lộ thông tin thật ra ngoài, và để khi cần demo thì "flip a switch" là có dữ liệu sống.

## 3.1. Tầng abstraction

Mọi nguồn dữ liệu bên ngoài đều có 1 interface chuẩn và 2 implementation: Fake (mock) và Real (thật). Hệ thống chọn implementation theo biến môi trường + bản ghi trong bảng feature_flags.

<table><tbody><tr class="odd"><td>// Source adapter interface<br />
interface SourceAdapter&lt;I, O&gt; {<br />
name: string;<br />
search(input: I, ctx: AdapterCtx): Promise&lt;O&gt;;<br />
}<br />
<br />
// Đăng ký bằng DI token<br />
provider({ provide: 'APOLLO_ADAPTER', useFactory: (cfg) =&gt;<br />
cfg.flags.useReal('apollo')<br />
? new ApolloRealAdapter(cfg.apolloKey)<br />
: new ApolloFakeAdapter(cfg.fixtureDir + '/apollo')<br />
});</td></tr></tbody></table>

## 3.2. Bảng feature flag (chuyển mock ↔ real)

| Flag                       | DEV mặc định    | STG             | PROD demo       | Mô tả                                                                                          |
| --- | --- | --- | --- | --- |
| use_real_apollo              | false               | true                | true                | Bật adapter Apollo thật                                                                            |
| use_real_rapid               | false               | true                | true                | Bật RapidAPI LinkedIn                                                                              |
| use_real_hunter              | false               | true                | true                | Bật Hunter                                                                                         |
| use_real_crawler             | true                | true                | true                | Crawler luôn thật (cào site công ty)                                                               |
| use_real_gemini              | false               | true                | true                | Gọi Gemini thật                                                                                    |
| use_real_openai              | false               | true                | true                | Gọi OpenAI thật                                                                                    |
| use_real_smtp                | false               | true                | true                | Gửi mail thật qua SMTP                                                                             |
| use_real_imap                | false               | true                | true                | Lắng nghe IMAP thật                                                                                |
| use_real_telegram            | true                | true                | true                | Telegram luôn thật (phòng test thoải mái)                                                          |
| enable_external_send         | false               | false               | false               | P1 LUÔN false. Cờ này khoá ở mức false xuyên suốt P1. Mail không bao giờ gửi tới recipient gốc.    |
| outbound_redirect_target     | tandtnt18@gmail.com | tandtnt18@gmail.com | tandtnt18@gmail.com | Nơi mọi email outbound bị redirect tới khi enable_external_send=false. P1 mặc định gmail của Tân |
| allow_external_send (legacy) | false               | false               | false               | ĐÃ thay bằng enable_external_send. Trong P1 chỉ giữ làm cờ kế thừa                               |
| compose_from_template        | true                | true                | true                | Ưu tiên template trước scratch                                                                     |

| An toàn — Email Safe Mode: Quan trọng — Quyết định ngày 07/05/2026 của CEO + Head Solution: TOÀN BỘ Phase 1 KHÔNG gửi mail ra ngoài. Mọi email đã approve được redirect cứng tới tandtnt18@gmail.com (gmail của Tân — Head Solution). Subject sẽ có prefix [P1-DEMO → recipient_gốc] và body có banner màu vàng cảnh báo. Cờ enable_external_send khoá ở false trong toàn bộ P1; chỉ thay đổi khi P1.5 có phê duyệt văn bản từ CEO. Điều này cho phép demo full luồng cho CEO mà không có rủi ro spam khách hàng thật, tổn hại reputation domain hay vi phạm Nghị định 13/2023. |
| --- |

## 3.3. Fake adapter — chiến lược fixture

Mỗi Fake adapter đọc fixture từ thư mục /fixtures/{adapter}/{slug}.json. Khi search một công ty, adapter normalize tên thành slug (vd "Acme Corp" → "acme-corp") và load file tương ứng. Nếu không có, fallback về một fixture generic được fuzz theo tên.

<table><tbody><tr class="odd"><td>// fixtures/apollo/acme-corp.json<br />
{<br />
"organizations": [{<br />
"id": "ap_001",<br />
"name": "Acme Corporation",<br />
"primary_domain": "acme.vn",<br />
"industry": "Fintech",<br />
"estimated_num_employees": "201-500",<br />
"founded_year": 2014<br />
}],<br />
"people": [<br />
{"first_name":"Văn A","last_name":"Trần","title":"CTO","email":"trana@acme.vn","email_status":"verified"},<br />
{"first_name":"Thị B","last_name":"Lê","title":"CMO","email":"leb@acme.vn","email_status":"verified"}<br />
]<br />
}</td></tr></tbody></table>

Tổng cộng cần seed 20 fixture:

-   10 fixture công ty mock cho dev hằng ngày — tên công ty fictional (Acme, BetaSoft, GammaPay, Zenith Edu, …).

-   5 fixture trùng tên 5 công ty thật ở Phụ lục A — nhưng dữ liệu là phiên bản đã sanitize (PII fake) để dev demo lần đầu không cần API thật.

-   5 fixture edge case: công ty không tồn tại, công ty không có email, công ty có 1 person duy nhất, công ty toàn email generic, công ty có Vietnamese diacritic phức tạp.

## 3.4. Fake AI

AI là phần đắt đỏ và chậm khi chạy thật trên dev. Có 3 chế độ:

| Chế độ | Cách chạy                                                                               | Khi dùng                                       |
| --- | --- | --- |
| Echo       | AI Gateway trả về JSON đúng schema từ template tĩnh, không gọi provider                     | Dev viết FE/BE, không cần test chất lượng nội dung |
| Recorded   | Gateway play lại response đã ghi lần đầu (nixt round-trip lưu vào /fixtures/ai/{hash}.json) | Test tích hợp, e2e — đảm bảo deterministic         |
| Live       | Gọi provider thật                                                                           | STG/PROD và rehearsal demo                         |

-   Mặc định DEV = Echo. Bật Recorded khi cần test e2e với nội dung gần thật. Live chỉ bật khi rehearsal hoặc trong session test có giới hạn budget.

-   Mỗi tuần Head Solution review chi phí AI; nếu DEV/STG vô tình gọi Live nhiều bất thường → có cảnh báo qua Grafana.

## 3.5. Fake SMTP / IMAP

-   DEV: dùng MailHog (mailhog.local:1025) — bắt mọi mail gửi đi và hiện trên UI nội bộ. Không có thật mail nào ra ngoài.

-   STG: dùng Postmark sandbox với domain vn-sales-test.com hoặc internal MTA. Mail thật gửi được nhưng chỉ tới các hộp đã whitelist.

-   PROD: Postmark prod domain hoặc internal MTA cho vnetwork.vn.

-   Bounce inbox DEV: MailHog không tạo DSN. Có một CLI nội bộ scripts/inject-bounce.ts giả lập DSN để worker bounce xử lý.

## 3.6. Fake Telegram

-   Bot dev tạo riêng @VNETWORKSalesBotDev. Whitelist toàn team dev.

-   Nếu không có internet, có một mock-telegram local (Express server) thay thế webhook → cho phép chạy hoàn toàn offline.

## 3.7. Cấu trúc dữ liệu seed cho database

-   scripts/seed/01-users.ts — tạo các user nội bộ có sẵn role + tg_user_id sandbox.

-   scripts/seed/02-scenarios.ts — 6 Industry Scenario chính cho Fintech, Ecom, Gov, Logistics, Mfg, EduTech.

-   scripts/seed/03-templates.ts — 3 template seed do Sales Admin viết tay (vi-formal cho CTO Fintech, en-formal cho CIO US, vi-casual cho CMO Ecom).

-   scripts/seed/04-suppression.ts — 5 email mẫu trong suppression.

-   Reset DB nhanh: make db-reset && make db-seed → 1 phút.

## 3.8. Check-list trước khi flip cờ thành Real

1.  Đã có API key thật của provider trong Vault.

2.  Đã chạy E2E test trên STG và pass 3 lần liên tục.

3.  Đã ngân sách AI cost ngày + alert vượt 80%.

4.  Domain gửi mail có SPF/DKIM/DMARC pass.

5.  Telegram bot prod đã whitelist user thật.

6.  Có rollback flag ngay (đổi flag = false → revert về Fake).

# 4. Custom Crawler — Bot lấy thông tin từ website

Custom Crawler là một module bot crawl tự dựng để bù chỗ Apollo/Rapid/Hunter còn thiếu. Phạm vi crawl chỉ là website của chính công ty mục tiêu (như acme.vn, betasoft.io) — không cào kết quả Google Search hay nội dung của Google. Khi cần dữ liệu phải qua Google (vd: tin tức công ty), hệ thống sử dụng dịch vụ thương mại có thoả thuận hợp pháp với Google (SerpAPI, DataForSEO) thay vì tự bypass.

| Tuyên bố pháp lý: VNETWORK CHỈ crawl website của bên thứ ba khi: (i) website đó tự công khai thông tin liên hệ/đội ngũ/giới thiệu, (ii) tôn trọng robots.txt của họ, (iii) không qua login wall, (iv) không bypass CAPTCHA. Vi phạm các điều này có thể vi phạm Luật An ninh mạng VN, CFAA (US), GDPR (EU). Head Solution chịu trách nhiệm pháp lý cho phần crawler. |
| --- |

## 4.1. Kiến trúc

<table><tbody><tr class="odd"><td>┌─────────────────────────────────────────────────────────────────────┐<br />
│ Crawler Service │<br />
│ │<br />
│ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐ │<br />
│ │ Queue │──▶│ Router │──▶│ Renderer │──▶│Extract │──▶│ Output │ │<br />
│ │ (Redis) │ │(by URL)│ │Playwright│ │Cheerio │ │JSON+raw │ │<br />
│ └─────────┘ └────────┘ │ + Cheerio│ │+heur. │ └─────────┘ │<br />
│ └─────┬────┘ └────────┘ │<br />
│ │ │<br />
│ ▼ │<br />
│ ┌────────────────┐ │<br />
│ │ Proxy Pool │ ─── rotate per request │<br />
│ │ (residential) │ │<br />
│ └────────────────┘ │<br />
└─────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

-   Renderer phân nhánh theo loại site: page tĩnh → Cheerio (nhanh, rẻ); page có JS render (SPA, React) → Playwright headless Chromium.

-   Extractor chạy nhiều rule song song: rule team, rule contact, rule news, rule social — mỗi rule độc lập, lỗi rule này không ảnh hưởng rule kia.

-   Output luôn lưu cả JSON normalized và raw HTML.gz (audit, có thể replay extractor mới mà không crawl lại).

## 4.2. Tôn trọng robots.txt và rate-limit (bắt buộc)

-   Mỗi domain target: lần đầu fetch /robots.txt và parse. Nếu Disallow path → skip.

-   Tôn trọng Crawl-delay header trong robots.txt. Nếu không có, default 2s.

-   Tối đa 4 request đồng thời / domain. Tối đa 60 request / domain / giờ.

-   Tổng concurrency cluster ≤ 50.

-   Nếu HTTP 429 hoặc 503 → exp backoff 60s, 300s, 900s. Quá 3 lần → bỏ domain trong 24h và alert.

-   Mỗi domain có max 30 page/job; ưu tiên path / /about /team /leadership /contact /careers /press /news.

## 4.3. Identification — tự khai báo, không giả mạo browser thật

-   User-Agent CỐ ĐỊNH, định danh bot rõ ràng:

|                                                                                               |
|-----------------------------------------------------------------------------------------------|
| User-Agent: VNETWORK-SalesBot/1.0 (+https://vnetwork.vn/bot.html; contact=botops@vnetwork.vn) |

-   Trang https://vnetwork.vn/bot.html mô tả bot, mục đích, cách webmaster yêu cầu chặn (chỉ cần thêm vào robots.txt). Đây là chuẩn của Googlebot, Bingbot — bot trung thực luôn có trang giới thiệu.

-   Không bao giờ giả lập User-Agent của Chrome/Firefox của con người.

-   Header Accept-Language: vi-VN,vi;q=0.9,en;q=0.8 (đúng với mục tiêu chính là site VN).

-   Bot KHÔNG submit form, KHÔNG đăng nhập, KHÔNG bấm nút. Chỉ GET trang công khai.

## 4.4. Khi site dùng kỹ thuật chặn — phương án hợp pháp

Một số site có anti-bot (Cloudflare WAF, JS challenge, fingerprinting). Cách xử lý của VNETWORK theo thứ tự ưu tiên:

| Tình huống                                    | Cách xử lý ĐÚNG                                                                                                                          | Tránh                                 |
| --- | --- | --- |
| Cloudflare 403/503 trên page tĩnh                 | Chuyển sang Playwright (Chromium thật) chạy headed với delay tự nhiên 2-5s; nếu vẫn fail, fallback dữ liệu từ Apollo/RapidAPI cho công ty đó | Không bypass JS challenge thủ công        |
| Site yêu cầu login để xem /team                   | Bỏ qua. Không tạo tài khoản giả                                                                                                              | Không scrape sau login wall               |
| Site có CAPTCHA (reCAPTCHA, hCaptcha, …)          | Bỏ qua page đó. Nếu cần dữ liệu này, dùng SerpAPI/DataForSEO mua kết quả qua dịch vụ hợp pháp                                                | Không bypass CAPTCHA bằng OCR/AI/thủ công |
| IP của VNETWORK bị site chặn cứng                 | Dùng residential proxy thương mại (Bright Data, Oxylabs) — các nhà cung cấp này có thoả thuận với owner IP, hợp pháp                         | Không dùng botnet, không dùng IP rác      |
| Page render JS phức tạp (React SPA), Cheerio fail | Playwright đợi network idle rồi extract; có timeout 20s                                                                                      | Không thử nhồi JS injection               |
| Cần kết quả Google Search                         | Dùng SerpAPI hoặc DataForSEO (paid) — họ trả về JSON kết quả, đã handle anti-bot phía họ                                                     | Không scrape google.com trực tiếp         |

| Quan điểm pháp lý của VNETWORK: Đây là điểm mà nhiều team dev đi sai. Bypass anti-bot bằng kỹ thuật giả mạo (rotating user-agent, fingerprint spoof, canvas spoof, CAPTCHA OCR) có thể chạy được trong DEV nhưng đẩy công ty vào rủi ro pháp lý dài hạn. Lựa chọn an toàn của VNETWORK: trả tiền cho dữ liệu khó (qua Apollo/Rapid/SerpAPI), tự crawl chỉ những gì site công khai cho phép. |
| --- |

## 4.5. Proxy pool

-   DEV: không proxy, đi trực tiếp.

-   STG/PROD: dùng Bright Data residential pool (paid). Mỗi job dùng 1 sticky session hoặc rotate theo request tuỳ flag.

-   Health-check: trước mỗi job, ping qua proxy đến httpbin.org/ip để kiểm tra IP còn sống.

-   Nếu proxy fail liên tiếp 3 lần → quay về direct (kèm ghi nhận đã không qua proxy, để Head Solution review).

-   Không bao giờ dùng free proxy / public proxy — rủi ro security cao.

## 4.6. Headless browser — cấu hình

-   Playwright Chromium 124+, persistent context để cache cookies an toàn.

-   Vẫn khai báo User-Agent VNETWORK-SalesBot (override mặc định Playwright).

-   Disable image, font, media để giảm bandwidth.

-   Wait until: networkidle (timeout 20s) hoặc domcontentloaded (cho site đơn giản).

-   Không stealth-mode: chính sách của VNETWORK là không che giấu là bot.

## 4.7. Trích xuất (Extractor)

Mỗi rule là một function (DOM) → partial JSON. Áp dụng theo path:

| Path                        | Rule chính                                                        | Output               |
| --- | --- | --- |
| /team, /leadership, /about/team | scan tag h1-h4 + p liền kề; pattern "role keyword" (CEO/CTO/Head of)  | key_persons[]         |
| /contact, /lien-he              | regex email + phone E.164; tìm địa chỉ trong block address            | company.contact          |
| /news, /press, /blog            | lấy 5 entries gần nhất theo time meta + title                         | company.recent_news[] |
| /, /about                       | meta og:description, h1, schema.org/Organization                      | company.about, name      |
| footer toàn site                | social link (linkedin/facebook/twitter), copyright year, registration | company.socials          |

## 4.8. Hợp nhất với Aggregator

-   Output Crawler chuyển vào Aggregator với weight 0.15 (theo SRS Chương 11.6).

-   Khi Crawler đồng thuận với Apollo/Rapid → tăng confidence score 0.10.

-   Khi Crawler là nguồn duy nhất có email cho 1 person → đánh dấu need_verify = true; bắt buộc Hunter verify trước khi gửi mail thật.

## 4.9. Lịch chạy và resilience

-   Crawler chạy đồng bộ trong job search (timeout 30s). Sau 30s, kết quả gì có thì dùng, không chặn job.

-   Có cron "recrawl-stale" hằng đêm, recrawl các công ty có report &gt; 30 ngày để cập nhật news.

-   Mọi lỗi crawler ghi vào bảng crawler_errors với screenshot (Playwright auto-capture).

## 4.10. Chống lạm dụng từ phía VNETWORK

-   Sales bấm "Re-search" cùng 1 công ty trong &lt; 24h → chặn ở UI, dùng cache.

-   Không cho job hàng loạt &gt; 100 công ty cùng lúc qua API. Bulk import phải có Admin approve.

-   Mỗi tháng Head Solution review log crawler: domain top, 4xx/5xx, audit để chắc bot không gây phiền cho ai.

-   Email botops@vnetwork.vn đăng ký trong robots.txt và User-Agent — sẵn sàng nhận yêu cầu chặn từ webmaster.

## 4.11. Test crawler trước demo

-   Chuẩn bị 1 sandbox site nội bộ (mirror.vnetwork.vn/sandbox) bắt chước cấu trúc 5 công ty Phụ lục A — để dev test extractor mà không gọi internet.

-   Chạy crawler thật vào 5 site Phụ lục A một tuần trước demo. Nếu site nào fail (403/CAPTCHA), thay công ty khác trong list.

# 5. Đội ngũ và lịch trình

## 5.1. Team Phase 1

| Vai trò       | Số người | Trách nhiệm chính trong P1                                        |
| --- | --- | --- |
| Head Solution     | 1            | Owner kỹ thuật, duyệt PR core, kiểm soát rủi ro pháp lý/quota/AI cost |
| Tech Lead BE      | 1            | API + worker + AI Gateway + Source Adapter; review code BE            |
| Tech Lead FE      | 1            | Web app (17 màn) + Telegram Mini App; review code FE                  |
| BE Engineer       | 2            | Cài source adapter, email/IMAP, Telegram bot, template engine         |
| FE Engineer       | 1            | Build các màn UI theo SRS, e2e Playwright                             |
| Crawler Engineer  | 1            | Custom Crawler module (Chương 4)                                      |
| DevOps            | 0.5          | CI/CD, infra DEV/STG/PROD, monitoring, secret                         |
| QA                | 1            | E2E test, BRAC checklist, UAT chuẩn bị                                |
| Sales Admin (rep) | 0.5          | Viết Industry Scenario, template seed, hỗ trợ UAT                     |

## 5.2. Lịch nhịp tuần

| Hoạt động         | Tần suất                | Người tham dự                      |
| --- | --- | --- |
| Daily standup         | Mỗi ngày 9h, 15 phút        | Toàn team Dev                          |
| Demo nội bộ milestone | Cuối mỗi sprint 2 tuần      | Toàn team + Head Solution              |
| CEO checkpoint        | Cuối M2, M4, M5 (3 lần)     | CEO + Head Solution + Tech Leads       |
| AI cost review        | Thứ Sáu hằng tuần, 30 phút  | Head Solution + Tech Lead BE           |
| UAT session           | Tuần T11 — 2 ngày liên tiếp | QA + Sales Admin + HOS + Head Solution |
| Demo rehearsal        | Tuần T12 — 2 lần            | Toàn team + Head Solution              |
| Demo CEO              | Cuối tuần T12               | CEO + Head Solution + Sales Auto Team  |

## 5.3. Sơ đồ Gantt rút gọn

<table><tbody><tr class="odd"><td>T1 T2 T3 T4 T5 T6 T7 T8 T9 T10 T11 T12<br />
M0 Foundation ██ ██<br />
M1 Search Core ██ ██<br />
M2 AI Layer ██ ██<br />
M3 Telegram Review ██ ██<br />
M4 Bounce + Learn ██ ██<br />
M5 Pre-Demo + UAT ██ ██<br />
Crawler dev ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ██ ██ (intensify M5)<br />
QA / Test ░░ ░░ ░░ ░░ ░░ ░░ ██ ██<br />
Documentation ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░ ░░</td></tr></tbody></table>

# 6. Demo Plan cho CEO

Demo cuối Phase 1 dài tổng cộng ~45 phút. Mục tiêu: chứng minh hệ thống chạy end-to-end với dữ liệu thật, từ thao tác Sales đến mail tới hộp thư khách hàng test, rồi quay lại Telegram alert khi bounce — tất cả trong 1 phiên.

## 6.1. Mục tiêu demo (CEO sẽ kiểm tra)

1.  Chứng minh nhập tên công ty thật → có Company Report đầy đủ trong &lt; 5 phút.

2.  Chứng minh AI viết được email tự nhiên, cá nhân hóa, không sai chính tả tiếng Việt.

3.  Chứng minh quy trình duyệt qua Telegram đảm bảo zero auto-send.

4.  Chứng minh hệ thống học được từ template hiệu quả.

5.  Chứng minh độ tin cậy: bounce được phát hiện và alert.

6.  Tạo niềm tin để CEO duyệt ngân sách cho Phase 2 (LinkedIn) và Phase 3 (Zalo).

## 6.2. Trước demo — checklist 24h trước

1.  Restart STG sạch, seed lại dữ liệu seed (scenario, template seed, suppression test).

2.  Chạy 5 search test trên 5 công ty Phụ lục A. Bất kỳ công ty nào fail (không có report đẹp) → thay bằng dự phòng.

3.  Quota check: Apollo còn ≥ 100 search, Hunter còn ≥ 200 verify, RapidAPI còn ≥ 200 call, AI budget còn ≥ 20 USD.

4.  Mail test inbox: dùng tandtnt18@gmail.com (gmail của Tân — Head Solution) làm catch-all inbox cho demo. Đảm bảo đăng nhập sẵn trên máy chiếu phụ. P1 KHÔNG gửi mail ra ngoài: mọi mail dù được approve cho recipient nào đều được redirect tới hộp này; CEO sẽ thấy mail tới đây kèm subject [P1-DEMO → recipient_gốc] để biết hệ thống đáng lẽ đã gửi cho ai.

5.  Telegram bot online; whitelist có CEO + tài khoản dự phòng của Head Solution.

6.  Quay sẵn video full demo 7 phút (Plan B nếu hôm CEO xem live API có sự cố).

7.  Chuẩn bị slide intro 3 slide + slide kết 2 slide; in giấy A3 sơ đồ flow để treo.

8.  Internet phòng họp: 2 line (cáp + 4G dự phòng), test nói chuyện qua VPN nếu cần.

## 6.3. Kịch bản demo từng phút

| Phút | Hoạt động                                                                                                                                                                                                                                                                                                                  | Người trình bày     | Plan B                                                                                    |
| --- | --- | --- | --- |
| 0-3      | Mở đầu: lý do làm sản phẩm, scope P1/P2/P3, kỳ vọng từ CEO                                                                                                                                                                                                                                                                     | Head Solution           | —                                                                                             |
| 3-5      | Tour nhanh 17 màn: lướt qua sidebar, dashboard, settings                                                                                                                                                                                                                                                                       | Tech Lead FE            | —                                                                                             |
| 5-7      | Trên SC-03: nhập "Công ty A — Phụ lục A" + region VN + ngành Fintech → Bắt đầu                                                                                                                                                                                                                                                 | Sales (đại diện)        | Nếu Apollo timeout &gt; 20s: chuyển sang Công ty B                                            |
| 7-12     | Theo dõi SC-04 realtime — 4 progress bar, log job, AI serialize → REPORT_READY                                                                                                                                                                                                                                                | Tech Lead BE giải thích | Nếu Crawler fail: vẫn còn Apollo + Rapid + Hunter — đủ ra report                              |
| 12-16    | Mở SC-06 Company Report: zoom thông tin công ty, key persons, news, confidence                                                                                                                                                                                                                                                 | Sales                   | —                                                                                             |
| 16-19    | Bấm "Generate Drafts" → mở SC-08: xem 3 draft AI sinh, đọc to 1 draft                                                                                                                                                                                                                                                          | Sales đọc draft         | Nếu AI sinh kém: dùng template seed có sẵn                                                    |
| 19-24    | Chuyển sang điện thoại CEO: bot Telegram đẩy 3 draft. CEO bấm Edit 1 draft → sửa 1 câu, Approve. Bấm Approve 2 draft còn lại không sửa                                                                                                                                                                                         | CEO trực tiếp           | Nếu CEO không tiện điện thoại: dùng máy Sales-Lead                                            |
| 24-27    | Quay lại web SC-11 Email History: 3 mail ở trạng thái SENT, cột intended_recipient hiện email gốc (vd. ceo@hsc.com.vn), cột actual_recipient hiện tandtnt18@gmail.com, badge 'redirected'. Mở tandtnt18@gmail.com trên màn phụ: 3 mail rơi vào inbox với subject prefix [P1-DEMO → ceo@hsc.com.vn] và banner vàng đầu body | Tech Lead FE            | Nếu mail chưa tới sau 30s: refresh; nếu vẫn chưa: chiếu video Plan B đã quay sẵn từ rehearsal |
| 27-31    | Show bounce: gửi 1 draft tới địa chỉ không tồn tại đã chuẩn bị → 1-2 phút sau Telegram đẩy alert; mở SC-12 Bounce Center                                                                                                                                                                                                       | Tech Lead BE            | Nếu IMAP chậm: dùng CLI scripts/inject-bounce.ts giả lập DSN                                  |
| 31-35    | Show Template Learning: trong Admin panel hiện candidate Fintech-CTO có 3 candidate sim 0.91 — bấm Promote                                                                                                                                                                                                                     | Sales Admin             | —                                                                                             |
| 35-38    | Roadmap: cùng kiến trúc, P2 LinkedIn (T1-T8 Phase 2), P3 Zalo (T1-T8 Phase 3)                                                                                                                                                                                                                                                  | Head Solution           | —                                                                                             |
| 38-43    | Q&A với CEO                                                                                                                                                                                                                                                                                                                    | Toàn team               | —                                                                                             |
| 43-45    | Kết: ngân sách cần cho P1 production, đề xuất tiếp Phase 2                                                                                                                                                                                                                                                                     | Head Solution           | —                                                                                             |

## 6.4. Quy ước an toàn trong demo

-   Toàn bộ Phase 1 KHÔNG gửi mail ra ngoài: cờ enable_external_send khoá cứng ở false. Mọi mail đã approve được hệ thống tự redirect tới tandtnt18@gmail.com — kể cả khi CEO bấm Approve cho recipient thật.

-   Allowlist domain SMTP cứng = [gmail.com, vnetwork.vn]. Mọi domain khác bị reject ở pre-send hook và ghi log security_violation, đảm bảo dù dev có lỗi cũng không thoát được.

-   Subject prefix [P1-DEMO → recipient_gốc] và banner vàng đầu body bắt buộc trong P1, để CEO/Sales nhận biết ngay đây là email demo, recipient không phải đích thật.

-   Suppression list seed sẵn 1 entry = email cá nhân của CEO — phòng trường hợp ai bấm nhầm gửi email không phù hợp.

-   Mỗi nút Approve trong demo CEO bấm đều được team theo dõi qua Grafana/log realtime.

-   Có 2 dev đứng cạnh máy chiếu phòng trường hợp cần can thiệp — không cố sửa lỗi trên screen của CEO.

## 6.5. Plan B chi tiết

| Tình huống                           | Plan B                                                                        |
| --- | --- |
| Apollo down                              | Switch flag use_real_apollo = false → fixture cho công ty đó. CEO không nhận ra |
| RapidAPI quota cạn                       | Show toast "LinkedIn paused" → vẫn ra report bằng 3 nguồn còn lại                 |
| Gemini + OpenAI cùng down (rất hiếm)     | Dùng AI mode = Recorded — phát lại response đã ghi từ rehearsal                   |
| Internet phòng họp lag                   | Chuyển sang 4G dự phòng. Nếu vẫn lag → chiếu video Plan B đã quay sẵn             |
| CEO không có Telegram lúc demo           | Tài khoản Head Solution thay thế nhận draft, bấm như CEO sẽ bấm                   |
| Bounce không tới trong 5 phút            | Chạy CLI giả lập DSN — vẫn show được Telegram alert đầy đủ                        |
| Template Learning chưa có 3 candidate đủ | Tạo trước 3 candidate trong rehearsal để cron promote chạy đúng demo              |

## 6.6. Sau demo

-   Trong 24h, gửi CEO bản tóm tắt 1 trang: "đã demo gì, kết quả, đề xuất Phase 2 timeline".

-   Gửi feedback survey 5 câu cho CEO + Head Solution + HOS + Sales Admin.

-   Họp postmortem nội bộ: cái gì work, cái gì không, ai làm gì cho P2.

-   Đóng băng nhánh release/p1, mở nhánh feature/p2.

# 7. Rủi ro triển khai và biện pháp

| Rủi ro                         | Mức | Triệu chứng                                 | Biện pháp                                                                                                      |
| --- | --- | --- | --- |
| AI cost vượt ngân sách demo        | Cao     | Bill cuối tuần &gt; 1.5x kế hoạch               | Daily check; alert 80% qua Telegram cho Head Solution; cap monthly_max ở provider                                 |
| Provider thay đổi schema đột ngột  | Trung   | Adapter trả 4xx hoặc thiếu trường               | Adapter có version contract test chạy nightly trên STG; alert khi schema lệch                                      |
| Domain mail bị đánh dấu spam       | Cao     | Mail rơi vào Junk; Postmark cảnh báo reputation | Throttle nghiêm; warmup tuần T1; rotate sub-domain (sales1, sales2); dùng domain phụ vn-sales.com cho test         |
| Crawler bị site target chặn        | Trung   | 403/503 trên domain quan trọng                  | Fallback Apollo/Rapid; dùng residential proxy nếu hợp đồng cho phép; thay đổi domain trong UAT                     |
| AI sinh nội dung không phù hợp     | Trung   | Sai tên, sai chức danh, lời lẽ kỳ               | Validator subject/body; bắt buộc review qua Telegram; có ngưỡng confidence chặn auto-template                      |
| Telegram webhook bị lỗi            | Trung   | Bot không phản hồi callback                     | Có chế độ polling fallback; healthcheck mỗi 30s                                                                    |
| Dữ liệu demo bị PR sự cố           | Cao     | Công ty trong demo phàn nàn                     | Chỉ dùng công ty B-tier; trước demo email/gọi xin phép owner cho phép VNETWORK demo enrich; sẵn 5 công ty thay thế |
| Team bị burnout 4 tuần cuối        | Trung   | Velocity giảm, code quality giảm                | Đặt feature freeze T11 nghiêm; không nhận thêm feature từ T9; bonus sau demo                                       |
| CEO yêu cầu thêm tính năng giữa kỳ | Trung   | Scope creep; trễ demo                           | Head Solution là gatekeeper; mọi yêu cầu mới đẩy P1.5 hoặc P2                                                      |

# 8. Acceptance Criteria cho Demo CEO

Demo coi là thành công khi và chỉ khi tất cả tiêu chí dưới đây pass. Mỗi tiêu chí có người chịu trách nhiệm verify.

| Mã | Tiêu chí                                                                                                                                                   | Verify bởi    | Cách kiểm                                         |
| --- | --- | --- | --- |
| DA-01  | End-to-end search → report → draft → approve → send hoạt động cho ≥ 4/5 công ty Phụ lục A                                                                      | QA                | Chạy 5 lần liên tiếp ngày T-1                         |
| DA-02  | Job duration P95 &lt; 5 phút trên STG (không cache)                                                                                                            | Tech Lead BE      | Grafana metrics 7 ngày gần nhất                       |
| DA-03  | AI sinh draft tiếng Việt không sai chính tả, không có placeholder chưa thay (vd {{first_name}})                                                               | Sales Admin       | Đọc 10 draft mẫu liên tiếp                            |
| DA-04  | Telegram approve → mail tới inbox demo trong &lt; 30s                                                                                                          | Tech Lead BE      | Đo trên rehearsal lần 2                               |
| DA-05  | Bounce alert tới Telegram trong &lt; 5 phút từ khi mail bị từ chối                                                                                             | QA                | Trigger DSN bằng địa chỉ test không tồn tại           |
| DA-06  | Template Learning: ít nhất 1 template được promote thành công trong demo                                                                                       | Sales Admin       | Tạo trước 3 candidate trong rehearsal                 |
| DA-07  | Tất cả secret (API key, Telegram token, SMTP password) lưu Vault, không trong code                                                                             | DevOps            | Audit repo + config                                   |
| DA-08  | Audit log có đầy đủ record cho 5 search demo + các approve                                                                                                     | Head Solution     | Mở UI Audit, tick từng record                         |
| DA-09  | Crawler chỉ truy cập 5 domain công ty trong UAT; có log User-Agent + robots.txt được tôn trọng                                                                 | Crawler Engineer  | Xem crawler_errors + access log                      |
| DA-10  | Trong toàn bộ demo, KHÔNG có email nào tới domain ngoài gmail.com/vnetwork.vn. Tất cả mail rơi vào tandtnt18@gmail.com với subject prefix và banner đúng chuẩn | Head Solution     | Inspect SMTP outbound log + tandtnt18@gmail.com inbox |
| DA-11  | Documentation đầy đủ: README repo, runbook ops, playbook Sales Admin                                                                                           | Tech Lead BE + FE | PR review                                             |
| DA-12  | Video Plan B 7 phút có sẵn, chất lượng đủ chiếu nếu live fail                                                                                                  | Tech Lead FE      | Test chiếu trên máy chiếu thật trước demo             |

# Phụ lục A — Danh sách 5 công ty UAT/demo

Đây là danh sách hạng B-tier (mid-size, không phải Big Tech) được chọn để giảm rủi ro PR/pháp lý và tăng khả năng thành công. Trước demo, Head Solution gọi/email mỗi công ty xin phép VNETWORK "enrich data từ public source cho mục đích demo nội bộ" — phương án bảo vệ thanh danh.

| Lưu ý: Các tên dưới đây là tên đại diện. Sales Admin sẽ thay bằng 5 tên thật được CEO duyệt 1 tuần trước UAT. |
| --- |

| # | Tên (placeholder)        | Ngành | Region | Ghi chú                                         |
| --- | --- | --- | --- | --- |
| 1      | Công ty A — Fintech VN       | Fintech   | VN         | Trang chủ tiếng Việt, /team rõ, không Cloudflare    |
| 2      | Công ty B — Logistics VN     | Logistics | VN         | Có nhiều branch, page /careers tốt                  |
| 3      | Công ty C — Ecom VN          | Ecom      | VN         | Public press release nhiều, news rõ                 |
| 4      | Công ty D — EduTech SEA      | EduTech   | SEA        | Site đa ngôn ngữ vi/en, dùng test compose tiếng Anh |
| 5      | Công ty E — Manufacturing VN | Mfg       | VN         | Trang ít hiện đại, test crawler với HTML cũ         |

Mỗi công ty có 1 "prospect demo" do team setup trước trên Gmail miễn phí (vd hr.democoa.uat@gmail.com) — đây là email rơi mail thật trong demo, không gây phiền hà cho ai. Sau demo, các tài khoản Gmail này được giữ 30 ngày để debug rồi xoá.

# Phụ lục B — CLI nội bộ phục vụ demo

<table><tbody><tr class="odd"><td># Reset DB sạch + seed<br />
make db-reset &amp;&amp; make db-seed<br />
<br />
# Đặt redirect target và đảm bảo P1 không gửi ra ngoài<br />
npm run flag set outbound_redirect_target tandtnt18@gmail.com<br />
npm run flag set enable_external_send false # P1 KHOÁ ở false xuyên suốt<br />
npm run flag set use_real_apollo false<br />
<br />
# Trigger giả lập bounce DSN cho draft cụ thể<br />
npm run scripts/inject-bounce.ts --draft DR-2026-0517 --reason "550 mailbox not found"<br />
<br />
# Force promote candidate Fintech-CTO ngay (cho rehearsal)<br />
npm run scripts/promote-candidates.ts --industry Fintech --role CTO --force<br />
<br />
# Chạy AI mode = Recorded (replay fixture)<br />
AI_MODE=recorded npm run dev:api<br />
<br />
# Quay video Plan B<br />
npx playwright test --headed --grep "demo-record" --project=chromium</td></tr></tbody></table>

# Phụ lục C — Định nghĩa hoàn thành Phase 1

-   DA-01 → DA-12 đều pass.

-   BRAC SRS v3.0: 30/33 rule pass, 3 rule còn lại có ticket P1.5.

-   Chi phí AI tháng cuối ≤ ngân sách Head Solution duyệt.

-   Không có security/legal incident được ghi nhận.

-   CEO sign-off bằng email "approve to enter Phase 2 planning".

*— Hết tài liệu —*

# Phụ lục D — Kịch bản test mẫu: Chứng khoán (Securities)

Đây là kịch bản test thực tế do Sales Admin VNETWORK chuẩn bị, dùng để nghiệm thu khả năng AI Sales Agent soạn email cho ngành Chứng khoán. Kịch bản gồm 6 email — chia 2 nhánh đối tượng: 3 email gửi cho CEO/Tổng giám đốc và 3 email gửi cho CTO/IT Manager. Mỗi nhánh là một chuỗi follow-up 3 lần khi khách im lặng.

Trong giai đoạn test, dev seed các email này như Industry Scenario "Securities-CEO" và "Securities-CTO" với 3 variant follow_up_step = 1, 2, 3. AI Composer được prompt: "thay biến công ty mục tiêu vào placeholder [.....] và cá nhân hóa thêm 1 chi tiết suy ra từ company data".

| Cách dùng kịch bản: Khi demo: nhập một công ty chứng khoán thật trong UAT (vd. Công ty B-tier do CEO chỉ định) → hệ thống dùng đúng kịch bản này → email được gửi (qua redirect) tới tandtnt18@gmail.com. CEO mở Gmail xem được nội dung gần như nguyên văn template, có thay tên công ty và cá nhân hóa. |
| --- |

**D.1. Nhánh A — Gửi cho CEO / Tổng giám đốc**

Tình huống: gửi mail nhưng khách hàng im lặng. Mục tiêu: giới thiệu giải pháp VNETWORK cho ngành chứng khoán.

**D.1.1. Email lần 1 — Giới thiệu (CEO/TGĐ)**

Đối tượng nhận: CEO và Tổng giám đốc

Ghi chú: Gửi mail lần đầu để giới thiệu

**Tiêu đề**

|                                                                    |
|--------------------------------------------------------------------|
| Tăng cường an toàn hệ thống giao dịch & giảm thiểu rủi ro vận hành |

**Nội dung**

<table><tbody><tr class="odd"><td>Kính gửi Ban Lãnh Đạo Công Ty [.....]<br />
<br />
Em là Ngọc Y, phụ trách tư vấn giải pháp bảo mật tại VNETWORK.<br />
Với hơn 12 năm kinh nghiệm, VNETWORK tiên phong trong Cloud Security,<br />
DDoS Protection, Firewall AI, CDN, SOC — giúp tăng cường an ninh thông tin,<br />
giảm thiểu rủi ro tấn công mạng.<br />
<br />
Hôm nay, em xin phép gửi Anh/Chị một góc nhìn ngắn về an toàn hệ thống<br />
trong lĩnh vực chứng khoán.<br />
<br />
Với đặc thù hệ thống giao dịch trực tuyến, các rủi ro như gián đoạn<br />
dịch vụ (DDoS), tấn công vào ứng dụng, rò rỉ dữ liệu hay giả mạo email<br />
đang ngày càng phổ biến và có thể ảnh hưởng trực tiếp đến uy tín,<br />
doanh thu và trải nghiệm khách hàng.<br />
<br />
VNETWORK hiện đang triển khai các nhóm giải pháp giúp kiểm soát toàn<br />
diện các rủi ro này:<br />
- Bảo vệ hệ thống giao dịch web/app/API trước tấn công và gián đoạn<br />
- Ngăn chặn giả mạo email, phishing và rủi ro từ người dùng nội bộ<br />
- Giám sát an ninh 24/7, phát hiện sớm và xử lý sự cố nhanh chóng<br />
- Kiểm soát tài khoản đặc quyền, hạn chế rủi ro nội bộ<br />
- Đánh giá bảo mật định kỳ để phát hiện lỗ hổng trước khi bị khai thác<br />
<br />
Các giải pháp này giúp:<br />
- Đảm bảo hệ thống giao dịch vận hành ổn định<br />
- Giảm thiểu rủi ro tài chính và pháp lý<br />
- Nâng cao mức độ tin cậy với khách hàng và đối tác<br />
<br />
Nếu Anh/Chị quan tâm, em rất mong có cơ hội trao đổi ngắn (15–20 phút)<br />
để hiểu thêm về hiện trạng và chia sẻ cách các đơn vị cùng ngành đang<br />
triển khai.<br />
<br />
Trân trọng,</td></tr></tbody></table>

**D.1.2. Email lần 2 — Follow-up (CEO/TGĐ)**

Ghi chú: Email lần 2 remind khách hàng nếu họ không reply mail

**Tiêu đề**

|                                                                        |
|------------------------------------------------------------------------|
| [Follow up] Tăng cường bảo mật và duy trì ổn định hệ thống giao dịch |

**Nội dung**

<table><tbody><tr class="odd"><td>Kính gửi Ban Lãnh Đạo Công Ty [.....]<br />
<br />
Em xin phép follow-up lại email trước vì đây là một điểm em nghĩ có thể<br />
liên quan trực tiếp đến vận hành hệ thống của bên mình.<br />
<br />
Thực tế gần đây, các sự cố trong ngành tài chính không còn dừng ở việc<br />
bị tấn công, mà nằm ở:<br />
- Gián đoạn hệ thống giao dịch vào thời điểm cao điểm<br />
- Email giả mạo nội bộ gây sai lệch thông tin hoặc giao dịch<br />
- Lỗ hổng tồn tại nhưng không được phát hiện sớm<br />
<br />
Điểm chung là đa số đều xuất phát từ việc thiếu một lớp kiểm soát tổng<br />
thể và phản ứng kịp thời.<br />
<br />
Bên em đang làm việc với một số đơn vị trong ngành để:<br />
- Giữ hệ thống luôn hoạt động ổn định ngay cả khi bị tấn công<br />
- Phát hiện và xử lý sự cố trong thời gian thực<br />
- Giảm thiểu rủi ro trước khi ảnh hưởng đến khách hàng và doanh thu<br />
<br />
Em tin rằng chỉ với 15–30 phút trao đổi, Anh/Chị sẽ có thêm góc nhìn<br />
thực tế để đánh giá và tối ưu hiện trạng an toàn hệ thống.<br />
<br />
Nếu thuận tiện, em xin phép đề xuất một buổi trao đổi ngắn theo lịch<br />
phù hợp của Anh/Chị. Em sẵn sàng linh hoạt theo thời gian Anh/Chị<br />
sắp xếp.<br />
<br />
Trân trọng</td></tr></tbody></table>

**D.1.3. Email lần 3 — ANTT cấp độ 3 (CEO/TGĐ)**

Ghi chú: Email lần 3 remind kèm dẫn chứng compliance + case study

**Tiêu đề**

|                                                                     |
|---------------------------------------------------------------------|
| Đáp ứng ANTT cấp độ 3 & đảm bảo vận hành hệ thống giao dịch ổn định |

**Nội dung**

<table><tbody><tr class="odd"><td>Kính gửi Ban Lãnh Đạo Công Ty [.....]<br />
<br />
Trong bối cảnh các yêu cầu về An toàn thông tin (ANTT cấp độ 3) ngày<br />
càng chặt chẽ, việc đảm bảo hệ thống giao dịch vận hành ổn định và<br />
kiểm soát rủi ro an ninh đang trở thành ưu tiên hàng đầu đối với các<br />
công ty chứng khoán.<br />
<br />
Từ thực tế triển khai, các doanh nghiệp trong ngành thường tập trung<br />
vào 3 lớp kiểm soát chính:<br />
<br />
1. Bảo vệ hệ thống và dịch vụ giao dịch<br />
Ngăn chặn tấn công vào web/app/API, hạn chế gián đoạn dịch vụ và<br />
đảm bảo hệ thống luôn sẵn sàng phục vụ khách hàng.<br />
<br />
2. Giám sát và phản ứng sự cố theo thời gian thực<br />
Thu thập và phân tích dữ liệu toàn hệ thống, phát hiện sớm các dấu<br />
hiệu bất thường và tự động hóa quy trình xử lý để giảm thiểu thời<br />
gian ảnh hưởng.<br />
<br />
3. Kiểm soát truy cập và rủi ro nội bộ<br />
Quản lý chặt chẽ tài khoản đặc quyền, ghi nhận đầy đủ hoạt động và<br />
giảm thiểu nguy cơ phát sinh từ bên trong.<br />
<br />
Các lớp kiểm soát này được triển khai thông qua các nền tảng như WAAP,<br />
SIEM, SOAR, SOC và PAM, giúp:<br />
- Đáp ứng yêu cầu ANTT cấp độ 3 theo quy định<br />
- Giảm thiểu nguy cơ gián đoạn hệ thống giao dịch<br />
- Hạn chế rủi ro tài chính và ảnh hưởng đến uy tín doanh nghiệp<br />
- Tăng khả năng phát hiện và xử lý sự cố trong thời gian thực<br />
<br />
Hiện VNETWORK đang triển khai mô hình này cho một số doanh nghiệp trong<br />
lĩnh vực tài chính tại Việt Nam như: HSC, Vietcap, ACBS, Yuanta, Fireant,<br />
Funan, VTGS, BMSC, VPS, BVSC,... với mục tiêu đảm bảo hệ thống luôn ổn<br />
định ngay cả trong các tình huống rủi ro cao.<br />
<br />
Nếu Anh/Chị quan tâm, em xin phép trao đổi ngắn để chia sẻ cách các đơn<br />
vị cùng ngành đang triển khai thực tế.<br />
<br />
Trân trọng,</td></tr></tbody></table>

**D.2. Nhánh B — Gửi cho CTO / IT Manager**

Tình huống tương tự nhưng đối tượng là người kỹ thuật. Tone đậm chất kiến trúc, nhấn mạnh WAAP/SIEM/SOAR/SOC/PAM.

**D.2.1. Email lần 1 — Đề xuất kiến trúc (CTO/IT)**

Đối tượng: CTO/ IT Manager — Ghi chú: Gửi mail lần đầu để giới thiệu

**Tiêu đề**

|                                                                                                 |
|-------------------------------------------------------------------------------------------------|
| Đề xuất giải pháp WAAP – SIEM – SOAR – SOC – PAM đáp ứng ANTT cấp độ 3 cho hệ thống Chứng khoán |

**Nội dung**

<table><tbody><tr class="odd"><td>Kính gửi Ban Lãnh Đạo Công Ty [.....]<br />
<br />
Em là Ngọc Y, phụ trách tư vấn giải pháp bảo mật tại VNETWORK.<br />
Với hơn 12 năm kinh nghiệm, VNETWORK tiên phong trong Cloud Security,<br />
DDoS Protection, Firewall AI, CDN, SOC — giúp tăng cường an ninh thông<br />
tin, giảm thiểu rủi ro tấn công mạng.<br />
<br />
Trong quá trình làm việc với các tổ chức tài chính – chứng khoán, bên<br />
em nhận thấy 3 nhóm rủi ro phổ biến nhưng thường chưa được kiểm soát<br />
triệt để:<br />
- Tấn công vào Web/App/API (OWASP Top 10, DDoS layer 7)<br />
- Thiếu khả năng phát hiện &amp; phản ứng sớm khi có sự cố (log rời rạc,<br />
không correlation)<br />
- Rủi ro từ tài khoản đặc quyền (admin, DB, hệ thống core trading)<br />
<br />
Để đáp ứng đầy đủ yêu cầu An toàn thông tin cấp độ 3, bên em đề xuất<br />
mô hình tích hợp gồm:<br />
<br />
1. WAAP (Web Application &amp; API Protection)<br />
- Bảo vệ Web/App/API trước tấn công OWASP, bot, DDoS layer 7<br />
- Xử lý tấn công tại EDGE, giảm tải trực tiếp cho hạ tầng core<br />
- Đảm bảo tính sẵn sàng dịch vụ giao dịch<br />
<br />
2. SIEM (Security Information &amp; Event Management)<br />
- Thu thập &amp; chuẩn hóa log tập trung từ toàn bộ hệ thống<br />
- Correlation sự kiện theo use-case tài chính (fraud, privilege<br />
abuse, lateral movement)<br />
- Đáp ứng yêu cầu lưu trữ, truy vết theo chuẩn kiểm toán<br />
<br />
3. SOAR (Security Orchestration, Automation &amp; Response)<br />
- Tự động hóa quy trình xử lý sự cố (playbook)<br />
- Rút ngắn thời gian phản ứng (MTTR) từ giờ xuống phút<br />
- Giảm phụ thuộc vào xử lý thủ công của SOC<br />
<br />
4. SOC (Security Operation Center)<br />
- Giám sát 24/7, phân tích &amp; cảnh báo theo ngữ cảnh hệ thống chứng<br />
khoán<br />
- Hỗ trợ điều tra sự cố và báo cáo theo chuẩn compliance<br />
- Đóng vai trò vận hành thực tế cho SIEM &amp; SOAR<br />
<br />
5. PAM (Privileged Access Management)<br />
- Kiểm soát, ghi log và audit toàn bộ truy cập tài khoản đặc quyền<br />
- Ngăn chặn lạm dụng quyền nội bộ — một trong các nguyên nhân chính<br />
gây sự cố nghiêm trọng<br />
- Đáp ứng yêu cầu kiểm soát truy cập trong ANTT cấp độ 3<br />
<br />
Giá trị mang lại:<br />
- Đáp ứng đầy đủ các nhóm kiểm soát của ANTT cấp độ 3<br />
(bảo vệ – giám sát – phát hiện – phản ứng – kiểm soát truy cập)<br />
- Tăng khả năng phát hiện sớm và giảm thiểu thiệt hại khi có sự cố<br />
- Chuẩn hóa vận hành an toàn thông tin theo mô hình enterprise<br />
<br />
Bên em tin rằng với cách tiếp cận theo kiến trúc tổng thể (không rời<br />
rạc từng sản phẩm), hệ thống của Anh/Chị sẽ vừa đảm bảo compliance,<br />
vừa thực sự vận hành hiệu quả trong thực tế.<br />
<br />
Trường hợp Anh/Chị cần, bên em có thể chia sẻ chi tiết kiến trúc triển<br />
khai phù hợp với mô hình hệ thống hiện tại.<br />
<br />
Trân trọng,</td></tr></tbody></table>

**D.2.2. Email lần 2 — Follow-up kiến trúc tổng thể (CTO/IT)**

**Tiêu đề**

|                                                        |
|--------------------------------------------------------|
| Follow-up: Trao đổi thêm về kiến trúc bảo mật tổng thể |

**Nội dung**

<table><tbody><tr class="odd"><td>Kính gửi Anh/Chị,<br />
<br />
Em xin phép follow-up lại sau buổi trao đổi trước về giải pháp bảo mật<br />
cho hệ thống web/app/api bên mình.<br />
<br />
Hiện tại trên thị trường có nhiều đơn vị cung cấp các giải pháp riêng<br />
lẻ, tuy nhiên bên em tập trung vào triển khai thực tế theo hướng bảo<br />
vệ tổng thể, đặc biệt với các hệ thống có yêu cầu cao như chứng khoán<br />
và nền tảng online.<br />
<br />
Bên em đã triển khai cho một số khách hàng như HSC, VPS, Yuanta, ABCS,<br />
Vietcap,... với các bài toán từ chống DDoS, bảo vệ ứng dụng đến đảm<br />
bảo hệ thống vận hành ổn định trong giờ cao điểm.<br />
<br />
Ngoài lớp bảo vệ web/app/api, bên em còn xây dựng hệ sinh thái bảo mật<br />
gồm:<br />
- Bảo mật email: ngăn chặn phishing, giả mạo và tấn công qua email<br />
- SIEM &amp; SOAR: thu thập, phân tích log và tự động hóa phản ứng sự cố<br />
- SOC: giám sát và xử lý sự kiện an ninh 24/7<br />
- PAM: kiểm soát và quản lý tài khoản đặc quyền<br />
<br />
Thế mạnh của VNETWORK là hạ tầng được xây dựng và tối ưu cho thị trường<br />
Việt Nam, giúp xử lý lưu lượng nội địa hiệu quả, giảm độ trễ và hiểu rõ<br />
đặc thù tấn công thực tế.<br />
<br />
Em tin rằng nếu có thêm 20–30 phút trao đổi, bên em có thể cùng Anh/Chị<br />
rà soát nhanh kiến trúc hiện tại và đề xuất hướng tối ưu phù hợp hơn<br />
với hệ thống bên mình.<br />
<br />
Không biết Anh/Chị có thời gian phù hợp trong tuần này hoặc tuần tới<br />
để mình trao đổi thêm không ạ?</td></tr></tbody></table>

**D.2.3. Email lần 3 — Kiểm tra nhu cầu (CTO/IT)**

**Tiêu đề**

|                                                              |
|--------------------------------------------------------------|
| Follow-up: Kiểm tra lại nhu cầu trao đổi về bảo mật hệ thống |

**Nội dung**

<table><tbody><tr class="odd"><td>Kính gửi Anh/Chị,<br />
<br />
Em xin phép follow-up lại email trước do chưa nhận được phản hồi từ<br />
Anh/Chị.<br />
<br />
Không rõ hiện tại bên mình đã có kế hoạch cụ thể cho việc nâng cấp hoặc<br />
rà soát hệ thống bảo mật trong thời gian tới chưa. Trong quá trình làm<br />
việc với các khách hàng cùng lĩnh vực, bên em nhận thấy một số rủi ro<br />
phổ biến liên quan đến DDoS, bảo mật ứng dụng và kiểm soát truy cập<br />
nội bộ.<br />
<br />
Bên em hiện đang cung cấp giải pháp bảo mật tổng thể bao gồm:<br />
- Bảo vệ web/app/api (WAF, Anti-DDoS)<br />
- Bảo mật email (chống phishing, giả mạo)<br />
- SIEM &amp; SOAR (giám sát và tự động phản ứng sự cố)<br />
- SOC 24/7 (theo dõi và xử lý sự kiện an ninh)<br />
- PAM (quản lý tài khoản đặc quyền)<br />
<br />
Các giải pháp đã được triển khai thực tế tại một số khách hàng chứng<br />
khoán như HSC, VPS, Yuanta, ABCS, Vietcap,... với yêu cầu cao về hiệu<br />
năng và độ ổn định.<br />
<br />
Trong trường hợp Anh/Chị vẫn đang cân nhắc hoặc chưa ưu tiên ở thời<br />
điểm này, em cũng rất mong nhận được phản hồi ngắn để bên em có thể<br />
chủ động sắp xếp hỗ trợ phù hợp hơn trong thời gian tới.<br />
<br />
Trân trọng,</td></tr></tbody></table>

**D.3. Mapping kịch bản này vào hệ thống AI Sales Agent**

**D.3.1. Industry Scenario seed**

Sales Admin tạo 2 Industry Scenario chính trong DB ở M2 (xem Roadmap):

| scenario_id | industry | role_level | language | tone | Mục đích                       |
| --- | --- | --- | --- | --- | --- |
| sec-ceo-intro    | Securities   | C-LEVEL         | vi-VN        | formal   | Email 1 cho CEO/TGĐ                |
| sec-ceo-fu1      | Securities   | C-LEVEL         | vi-VN        | formal   | Email 2 follow-up CEO              |
| sec-ceo-antt3    | Securities   | C-LEVEL         | vi-VN        | formal   | Email 3 nhấn ANTT cấp độ 3 cho CEO |
| sec-cto-arch     | Securities   | C-LEVEL/VP      | vi-VN        | formal   | Email 1 kiến trúc cho CTO/IT       |
| sec-cto-fu1      | Securities   | C-LEVEL/VP      | vi-VN        | formal   | Email 2 follow-up CTO              |
| sec-cto-fu2      | Securities   | C-LEVEL/VP      | vi-VN        | formal   | Email 3 follow-up cuối CTO         |

**D.3.2. Biến cá nhân hóa cần thay**

-   [.....] → {{company.legal_name}} (vd. Công ty Cổ phần Chứng khoán XYZ)

-   Thêm 1 chi tiết suy luận: nếu có news_hint về vòng huy động vốn, niêm yết, ra mắt app mới → chèn vào câu mở. Nếu không, giữ nguyên.

-   Tên người gửi {{sender_name}} thay cho "Ngọc Y" tuỳ Sales nào đứng tên.

-   Chữ ký {{signature}} cuối thư.

**D.3.3. Cấu hình follow-up automation**

-   Sau khi Email 1 (sec-ceo-intro hoặc sec-cto-arch) được approve & gửi, hệ thống schedule Email 2 sau 5 ngày làm việc nếu không có reply.

-   Sau Email 2, schedule Email 3 sau 7 ngày làm việc nếu vẫn không reply.

-   Mỗi email 2/3 đều phải qua Telegram review riêng — không tự gửi mặc dù đã có template.

-   Nếu khách reply bất kỳ lúc nào → cancel hết các email follow-up đang schedule.

-   Trong P1 (chế độ Email Safe Mode): cả 3 email đều redirect tới tandtnt18@gmail.com với subject prefix [P1-DEMO → ceo@xyz-securities.com.vn].

**D.3.4. Test case cụ thể trong UAT**

| TC    | Mô tả                                          | Bước test                                                                        | Kết quả mong đợi                                                           |
| --- | --- | --- | --- |
| TC-SEC-01 | AI sinh đúng email lần 1 cho CEO ngành Chứng khoán | Search 1 công ty chứng khoán, generate draft cho key person có role_level = C-LEVEL | Draft body match 95% template sec-ceo-intro; thay đúng tên công ty             |
| TC-SEC-02 | AI sinh đúng email lần 1 cho CTO/IT                | Cùng công ty, generate cho key person có title chứa CTO / IT Manager                 | Draft body theo sec-cto-arch; có nhắc WAAP/SIEM/SOAR/SOC/PAM                   |
| TC-SEC-03 | Approve & redirect                                 | Telegram approve cả 2 draft trên                                                     | Cả 2 mail rơi vào tandtnt18@gmail.com với prefix subject + banner              |
| TC-SEC-04 | Schedule follow-up                                 | Đợi 5 ngày làm việc (hoặc fast-forward bằng CLI)                                     | Hệ thống đẩy Email 2 lên Telegram review tự động                               |
| TC-SEC-05 | Cancel khi có reply                                | Reply giả lập từ tandtnt18@gmail.com về hộp gốc của VNETWORK                         | Email 3 bị huỷ, draft.status = 'CANCELLED_REPLY_RECEIVED'                    |
| TC-SEC-06 | Tone & chính tả                                    | Sales Admin đọc 6 draft AI sinh                                                      | Không sai chính tả tiếng Việt; không có placeholder chưa thay (vd {{company}}) |
| TC-SEC-07 | Cá nhân hóa news                                   | Search công ty có press release gần đây trong recent_news                           | Email 1 chèn câu liên quan press release ở phần mở đầu                         |
| TC-SEC-08 | Allowlist enforce                                  | Force draft.recipient = test@unknown.com → approve                                   | Reject ở SMTP pre-send hook + log security_violation; mail KHÔNG đi           |

**D.3.5. CLI fast-forward dùng trong UAT**

<table><tbody><tr class="odd"><td># Tạo trước 1 công ty test ngành Chứng khoán có 2 key persons<br />
npm run scripts/seed-test-company.ts <br />
--industry Securities <br />
--name "Công ty Cổ phần Chứng khoán XYZ" <br />
--persons "ceo@xyz.vn:CEO,cto@xyz.vn:CTO"<br />
<br />
# Generate draft từ scenario seed<br />
npm run scripts/generate-drafts.ts --company-id &lt;uuid&gt;<br />
<br />
# Fast-forward thời gian để trigger follow-up email 2<br />
npm run scripts/advance-clock.ts --days 5<br />
<br />
# Giả lập reply để test cancel logic<br />
npm run scripts/inject-reply.ts --draft-id &lt;uuid&gt; --from tandtnt18@gmail.com</td></tr></tbody></table>

**D.4. Note pháp lý**

| Compliance: Nội dung 6 email trên là tài liệu nội bộ VNETWORK do Sales Admin sản xuất. Các tên khách hàng được nhắc trong email (HSC, VPS, Vietcap, ACBS, Yuanta, Fireant, Funan, VTGS, BMSC, BVSC) là khách hàng/đối tác tham chiếu thực tế của VNETWORK, có quyền nhắc theo thoả thuận. Khi AI tự sinh email cho khách mới, KHÔNG được nhắc tên khách hàng khác trừ khi nằm trong danh sách reference được Head Solution duyệt — quy tắc này được hard-code trong Allowlist Reference List của AI Composer. |
| --- |

*— Hết Phụ lục D —*