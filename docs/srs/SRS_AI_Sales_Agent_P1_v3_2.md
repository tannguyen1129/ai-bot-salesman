**VNETWORK JOINT STOCK COMPANY**

*Internal Confidential — Sales Automation R&D*

# TÀI LIỆU ĐẶC TẢ YÊU CẦU PHẦN MỀM

*Software Requirements Specification (SRS)*

# AI SALES AGENT

Phase 1 — Email Outreach Automation (Approved Flow v3.2)

Phiên bản: 3.2 — Locked Stack (NestJS · Next.js · PostgreSQL · Docker)

Ngày phát hành: 07/05/2026

Trạng thái: Draft for Review (CEO + Head Solution)

Phạm vi: P1 Email · P2 LinkedIn (roadmap) · P3 Zalo (roadmap)

# 1. Kiểm soát tài liệu

Tài liệu này là phiên bản nâng cấp của SRS v2.0 trước đây, được viết lại sau khi luồng nghiệp vụ chính đã được anh Lead (Head Solution) và chị CEO chốt với bổ sung các điểm thay đổi quan trọng so với sơ đồ gốc. Mọi yêu cầu trong tài liệu sau đây có giá trị ràng buộc cho đội phát triển trong giai đoạn Phase 1 và là cơ sở để mở rộng sang Phase 2 (LinkedIn) và Phase 3 (Zalo).

| Mục               | Thông tin                                                                                                                                  |
| --- | --- |
| Tên tài liệu          | SRS — AI Sales Agent — Phase 1 Email Outreach                                                                                                  |
| Phiên bản             | 3.2                                                                                                                                            |
| Ngày tạo              | 07/05/2026                                                                                                                                     |
| Đơn vị chủ quản       | VNETWORK JSC — Sales Automation R&D                                                                                                            |
| Người duyệt nghiệp vụ | CEO, Head Solution                                                                                                                             |
| Người soạn            | Sales Automation Team                                                                                                                          |
| Mục tiêu tài liệu     | Đặc tả chi tiết yêu cầu Backend / Frontend / AI / Search / Email / Telegram / Data model / BRAC để đội Dev triển khai Phase 1 và roadmap P2-P3 |
| Tài liệu nguồn        | Sơ đồ flow P1 (ai_sales_p1_original_flow.svg) + ghi chú miệng từ CEO/Head Solution (07/05/2026)                                            |

## 1.1. Lịch sử thay đổi

| Phiên bản | Ngày   | Tác giả     | Mô tả thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --- | --- | --- |
| 1.0           | 20/04/2026 | Sales Auto Team | Bản nháp đầu tiên dựa trên ý tưởng phác thảo                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2.0           | 06/05/2026 | Sales Auto Team | Khớp với sơ đồ flow P1 đã chốt (LinkedIn + Hunter, Gemini, Google Sheets, IMAP, Telegram alert)                                                                                                                                                                                                                                                                                                                                                               |
| 3.0           | 07/05/2026 | Sales Auto Team | Cập nhật theo ghi chú mới của CEO + Head Solution: input là tên công ty (kèm region tùy chọn); thêm Apollo AI và custom crawler vào tổ hợp nguồn; AI có dual-provider Gemini/OpenAI; bổ sung lớp soạn email theo kịch bản ngành nghề; bắt buộc review qua Telegram trước khi gửi; bổ sung template learning. Khẳng định phạm vi P1 = Email, P2 = LinkedIn, P3 = Zalo.                                                                                         |
| 3.1           | 07/05/2026 | Sales Auto Team | Hai cập nhật từ phản hồi sau review: (a) Frontend chuyển sang Next.js 14 App Router thay cho React + Vite — lý do: SSR/streaming cho dashboard, server actions, Telegram Mini App tích hợp tự nhiên; (b) Phase 1 KHÔNG gửi mail ra ngoài VNETWORK — mọi email đã approve đều redirect tới catch-all tandtnt18@gmail.com với banner và header định danh; thêm BR-21A → BR-21D và trường intended_recipient/actual_recipient vào bảng email_history.         |
| 3.2           | 07/05/2026 | Sales Auto Team | Khoá cứng 3 lõi tech stack theo chỉ đạo: Backend = NestJS, Frontend = Next.js, Database = PostgreSQL — mọi mention trong toàn tài liệu đều thống nhất, gỡ Prisma/Kysely khỏi stack DB (chỉ dùng pg driver thuần + node-pg-migrate). Đổi tooling từ pnpm sang npm + npm workspaces. Bổ sung Chương 8.4 mới về đóng gói Docker bắt buộc — kèm danh sách 12 image, Dockerfile mẫu cho Next.js và NestJS, docker-compose.yml lõi, và 9 quy tắc đóng gói bắt buộc. |

## 1.2. Phân loại bảo mật

Tài liệu thuộc nhóm Internal Confidential. Cấm chia sẻ ra ngoài VNETWORK khi chưa có phê duyệt từ Head Solution hoặc CEO. Các API key, SMTP credential, Telegram bot token đề cập trong tài liệu chỉ mang tính minh họa cấu trúc — giá trị thực tế lưu trong Vault/SecretsManager riêng và không được ghi vào bất kỳ tài liệu nào.

# 2. Tóm tắt điều hành

AI Sales Agent là một hệ thống tự động hóa hoạt động prospecting và outreach đầu phễu của VNETWORK. Mục tiêu của hệ thống là rút ngắn thời gian Sales/CEO phải bỏ ra cho khâu nghiên cứu khách hàng tiềm năng, tổng hợp thông tin liên hệ và soạn email tiếp cận lần đầu — từ vài giờ mỗi công ty xuống còn vài phút mỗi công ty, đồng thời nâng cao tỉ lệ phản hồi nhờ kịch bản bán hàng được chọn theo ngành nghề.

Khác với chatbot trả lời tự động, AI Sales Agent là một workflow automation theo hướng human-in-the-loop. Hệ thống tự thu thập, chuẩn hóa và soạn thảo, nhưng thao tác xác nhận gửi email luôn cần Sales hoặc CEO duyệt qua Bot Telegram. Sau khi gửi, hệ thống tiếp tục theo dõi trạng thái phản hồi qua IMAP và cảnh báo bounce. Toàn bộ chu trình được lưu vết để team kinh doanh theo dõi hiệu quả và để mô hình AI học từ các email được duyệt gửi không cần chỉnh sửa.

Phase 1 tập trung vào kênh Email. Phase 2 sẽ tái sử dụng phần lõi (search, AI scoring, template learning, Telegram review) cho kênh LinkedIn outreach. Phase 3 mở rộng thêm kênh Zalo để phục vụ thị trường Việt Nam.

## 2.1. Giá trị kinh doanh kỳ vọng

-   Tăng số lượng prospect xử lý mỗi tuần lên ít nhất 5x so với hiện tại nhờ tự động hóa phần search và serialize.

-   Tăng tỉ lệ mở email và phản hồi nhờ template được lựa chọn theo ngành nghề và cá nhân hóa theo key person.

-   Giảm sai sót do thao tác thủ công — sai email, sai chức danh, gửi nhầm template — nhờ kiểm soát qua kịch bản và xác nhận trước khi gửi.

-   Tích lũy tài sản dữ liệu prospects và template hiệu quả cho VNETWORK theo thời gian, có thể tái sử dụng ở P2/P3.

-   Đặt nền móng cho dashboard CRM nội bộ và mô hình lead scoring trong các giai đoạn sau.

# 3. Mục tiêu kinh doanh và mục tiêu sản phẩm

## 3.1. Mục tiêu kinh doanh (Business Goals)

1.  BG-01 — Mở rộng tệp khách hàng: tự động khám phá các công ty mục tiêu thuộc nhiều ngành (Fintech, E-commerce, Gaming, EduTech, Logistics, MediaTech, Government, …) để Sales tiếp cận.

2.  BG-02 — Tăng doanh thu: nuôi pipeline ổn định với volume prospects mới mỗi tuần, hỗ trợ Sales đạt KPI hàng tháng.

3.  BG-03 — Chuẩn hóa quy trình: giảm phụ thuộc vào kinh nghiệm cá nhân; mọi chiến dịch outreach đều theo template được CEO/Head duyệt.

4.  BG-04 — Sản sinh dữ liệu chiến lược: thu thập dữ liệu thị trường có cấu trúc về key persons, ngành, region để phục vụ chiến lược dài hạn.

## 3.2. Mục tiêu sản phẩm (Product Goals)

1.  PG-01 — Cho phép Sales/CEO nhập tên công ty (kèm region tùy chọn) và nhận về một báo cáo có cấu trúc trong vòng dưới 5 phút (P95).

2.  PG-02 — Tự động tổng hợp dữ liệu từ Apollo AI, Rapid LinkedIn, Hunter Contacts và bot crawler tự dựng, đảm bảo độ phủ tối đa.

3.  PG-03 — Tự động chọn kịch bản bán hàng phù hợp ngành nghề và soạn email cá nhân hóa cho từng key person.

4.  PG-04 — Bắt buộc Sales/CEO duyệt từng email qua Telegram trước khi hệ thống gửi đi (zero auto-send).

5.  PG-05 — Tự học: lưu lại các email được duyệt gửi không cần chỉnh sửa làm template chính thức để dùng cho các lần sau, chỉ cần thay biến cá nhân hóa.

6.  PG-06 — Theo dõi gửi: ghi nhận lịch sử gửi và phản hồi bounce, cảnh báo Telegram nếu email không đến được.

7.  PG-07 — Có khả năng mở rộng: cùng kiến trúc, P2 chuyển kênh outreach sang LinkedIn, P3 sang Zalo, không phải viết lại lõi.

## 3.3. Chỉ số đo lường thành công

| Mã KPI | Chỉ số                                                         | Mục tiêu Phase 1         |
| --- | --- | --- |
| KPI-01     | Thời gian sinh báo cáo công ty (P95)                               | ≤ 5 phút                     |
| KPI-02     | Tỉ lệ trùng / sai email do hệ thống đề xuất                        | &lt; 5%                      |
| KPI-03     | Tỉ lệ email được duyệt gửi không cần chỉnh sửa (template hit rate) | ≥ 40% sau 3 tháng            |
| KPI-04     | Số prospect xử lý/người/tuần                                       | ≥ 60 (so với 10–15 thủ công) |
| KPI-05     | Tỉ lệ bounce email                                                 | &lt; 8%                      |
| KPI-06     | Mean time to alert khi bounce                                      | ≤ 5 phút từ lúc DSN về inbox |
| KPI-07     | Open rate trung bình                                               | ≥ 25%                        |
| KPI-08     | Reply rate trung bình                                              | ≥ 5%                         |

# 4. Phạm vi sản phẩm

## 4.1. Định nghĩa Phase

| Phase | Kênh outreach | Phạm vi                                                                                                                                            | Trạng thái                             |
| --- | --- | --- | --- |
| P1        | Email             | Search company → enrich key person → AI serialize → AI scenario → Telegram review → Send → Bounce monitor → Template learning                          | Đặc tả trong tài liệu này — implement ngay |
| P2        | LinkedIn          | Tái sử dụng search/serialize/scenario/Telegram review của P1, kênh send chuyển sang LinkedIn DM/InMail; thêm bộ chống chặn account; thêm cơ chế warmup | Roadmap — đặc tả riêng sau khi P1 GA       |
| P3        | Zalo              | Tái sử dụng pipeline P1, kênh send chuyển sang Zalo OA/ZNS; áp dụng cho khách Việt; thêm xác thực Zalo OA và quản lý tag                               | Roadmap — đặc tả riêng sau khi P2 GA       |

## 4.2. In-scope cho Phase 1

-   Màn hình nhập tên công ty + region (tùy chọn) cho Sales/CEO.

-   Cơ chế multi-source search song song: Apollo AI, Rapid LinkedIn (qua RapidAPI), Hunter Contacts, custom crawler.

-   Tìm thông tin chi tiết công ty, danh sách key persons (CEO/CTO/CIO/Head/VP/Manager) và thông tin liên hệ chi tiết của họ.

-   AI serialization theo cơ chế dual-provider: Gemini làm primary, OpenAI làm fallback và ngược lại tùy cấu hình; chuyển raw data hỗn loạn thành structured JSON.

-   Lưu báo cáo công ty (Company Report) trong PostgreSQL và xuất được PDF/Excel.

-   AI engine chọn kịch bản bán hàng theo ngành nghề và soạn nháp email cá nhân hóa cho từng key person.

-   Telegram review workflow: hệ thống không tự gửi; gửi nháp về Bot Telegram để Sales/CEO duyệt, sửa hoặc reject.

-   SMTP send sau khi được Telegram approve; lưu lịch sử gửi (message-id, content snapshot, timestamp).

-   Template learning: nếu một nháp được approve gửi luôn không sửa, đánh dấu nháp đó là template chính thức cho ngành/role tương ứng và ưu tiên dùng lại.

-   Bounce listener IMAP: parse DSN, xác định email lỗi, push alert Telegram, đánh dấu prospect là invalid trong DB.

-   Quản lý cấu hình: SMTP, IMAP, Telegram bot, API keys, prompt templates.

-   RBAC tối thiểu: Admin / CEO / Head / Sales — mỗi role có phạm vi quyền khác nhau (xem chi tiết ở Chương 19).

## 4.3. Out-of-scope cho Phase 1

-   Tự động gửi LinkedIn DM hoặc connect note (P2).

-   Gửi Zalo OA / ZNS (P3).

-   Chatbot hai chiều với khách hàng (sẽ bàn ở phase sau, không nằm trong roadmap hiện tại).

-   Tự động đàm phán giá, chốt deal, sinh hợp đồng.

-   Tích hợp đầy đủ với CRM bên ngoài (HubSpot, Salesforce); P1 chỉ export CSV/JSON.

-   Tự động cào dữ liệu vi phạm điều khoản LinkedIn ở quy mô lớn — chỉ dùng API hợp pháp (Apollo, RapidAPI provider được trả phí).

-   Auto warmup cho domain mail mới — admin tự warmup theo best practice.

## 4.4. Giả định và phụ thuộc

1.  Apollo, RapidAPI (LinkedIn provider), Hunter có hợp đồng/quota hợp lệ trước khi P1 lên production.

2.  Domain gửi mail của VNETWORK đã warmup, có SPF/DKIM/DMARC chuẩn.

3.  Tài khoản Telegram của các Sales/CEO đã được thêm vào Bot whitelist.

4.  Hạ tầng đặt ở môi trường nội bộ (VPC) hoặc trên VPS riêng có quyền outbound HTTPS đến các SaaS bên trên.

5.  Người dùng nội bộ ≤ 30 trong P1; concurrency search ≤ 50 job song song.

# 5. Thuật ngữ và viết tắt

| Thuật ngữ     | Định nghĩa                                                                                                                                    |
| --- | --- |
| AI Sales Agent    | Tên hệ thống được mô tả trong tài liệu này.                                                                                                       |
| Prospect          | Một cá nhân (key person) tại công ty mục tiêu mà VNETWORK định tiếp cận.                                                                          |
| Key Person        | Người có quyền quyết định hoặc ảnh hưởng đến việc mua giải pháp: CEO/CTO/CIO/COO/Head of IT/Head of Marketing/VP Engineering/Procurement Manager… |
| Company Report    | Bản tổng hợp có cấu trúc về công ty mục tiêu sau khi đã serialize, gồm thông tin công ty + danh sách key persons + thông tin liên hệ.             |
| Industry Scenario | Kịch bản bán hàng (sales playbook) được CEO/Head chốt trước, gồm pain point chính, value proposition, dẫn chứng case study và CTA cho từng ngành. |
| Draft Email       | Email được AI soạn dựa trên Industry Scenario và thông tin key person, chờ Sales/CEO review trên Telegram.                                        |
| Approved-As-Is    | Trạng thái draft email được approve mà không có chỉnh sửa nào — là tín hiệu để Template Learning Engine lưu lại làm template chính thức.          |
| Template          | Mẫu email cố định cho một (industry × role) cụ thể, có biến cá nhân hóa, được duyệt và sẵn sàng tái sử dụng.                                      |
| Telegram Review   | Cơ chế xác nhận trước khi gửi email; nháp được đẩy về Telegram bot, người duyệt bấm nút Approve / Edit / Reject.                                  |
| Bounce / DSN      | Delivery Status Notification do mail server đối tác trả về khi email không gửi được.                                                              |
| Apollo AI         | SaaS database B2B giúp tra cứu công ty và contact theo nhiều thuộc tính (Apollo.io).                                                              |
| Rapid LinkedIn    | Bộ API LinkedIn cung cấp qua RapidAPI marketplace để truy vấn thông tin công ty/profile.                                                          |
| Hunter            | Hunter.io — công cụ tìm địa chỉ email theo domain công ty và xác minh email.                                                                      |
| Custom Crawler    | Bot crawl tự dựng của VNETWORK, đi qua website công ty, page liên hệ, page nhân sự, news… để gom thông tin bổ sung khi các nguồn SaaS thiếu.      |
| Source Adapter    | Module backend đóng vai trò chuẩn hóa giao tiếp với một nguồn dữ liệu (Apollo/Rapid/Hunter/Crawler) — tách biệt để có thể bật/tắt và thay thế.    |
| Aggregator        | Module hợp nhất kết quả từ các Source Adapter, khử trùng lặp và đánh điểm tin cậy trước khi đưa vào AI.                                           |
| RBAC              | Role-Based Access Control.                                                                                                                        |
| BRAC              | Business Rules and Acceptance Criteria — bộ luật nghiệp vụ và tiêu chí nghiệm thu (Chương 19).                                                    |
| NFR               | Non-Functional Requirements — yêu cầu phi chức năng (Chương 18).                                                                                  |
| P95 / P99         | Latency tại percentile 95 / 99.                                                                                                                   |
| DLQ               | Dead Letter Queue — hàng đợi chứa job thất bại nhiều lần.                                                                                         |

# 6. Stakeholders và Actors

## 6.1. Người dùng nội bộ

| Vai trò         | Trách nhiệm chính trong hệ thống                                                                                   | Quyền truy cập                                       |
| --- | --- | --- |
| CEO                 | Theo dõi pipeline tổng quan, review/approve các email gửi cho key person cấp cao (C-level), duyệt kịch bản theo ngành. | Toàn quyền xem, approve, reject, sửa template, xem audit |
| Head Solution       | Owner kỹ thuật. Quản lý cấu hình hệ thống, prompt, source adapter, API key, RBAC.                                      | Toàn quyền cấu hình + quyền user thường                  |
| Head of Sales (HOS) | Phân công công ty cần search cho team Sales, xem report, duyệt email cho lead chiến lược.                              | Approve/reject draft, xem report, gán prospect           |
| Sales Executive     | Người dùng chính. Nhập công ty, xem report, review draft trên Telegram, theo dõi reply.                                | Nhập search, xem báo cáo của mình, approve/edit draft    |
| Sales Admin         | Quản lý template thư viện, cập nhật Industry Scenario, theo dõi quota API, xử lý bounce hàng loạt.                     | Quản lý template, cấu hình Industry Scenario             |

## 6.2. Hệ thống bên ngoài

| Hệ thống                                     | Vai trò                                                     | Loại tích hợp             |
| --- | --- | --- |
| Apollo.io                                        | Tra cứu thông tin công ty và contact theo domain/tên/region     | REST API + API key            |
| RapidAPI — LinkedIn provider                     | Tra cứu thông tin công ty + profile từ LinkedIn                 | REST API qua RapidAPI gateway |
| Hunter.io                                        | Tìm pattern email và xác minh email                             | REST API + API key            |
| Custom Crawler Service                           | Crawl bổ sung từ website, page contact, news                    | gRPC / REST nội bộ            |
| Google Gemini API                                | Serialize raw data thành JSON; soạn email; chấm scenario        | REST API + API key            |
| OpenAI API (GPT-4o / GPT-4o-mini)                | Cùng vai trò với Gemini, làm fallback hoặc primary tùy cấu hình | REST API + API key            |
| SMTP relay (Postmark/SendGrid hoặc internal MTA) | Gửi email outbound                                              | SMTP TLS                      |
| IMAP mailbox (Bounce inbox)                      | Đọc email DSN/bounce                                            | IMAP IDLE hoặc poll 60s       |
| Telegram Bot API                                 | Đẩy draft, nhận lệnh approve/edit/reject; alert bounce          | HTTPS webhook                 |
| Vault / SecretsManager                           | Lưu API key, SMTP credential, OAuth token                       | SDK nội bộ                    |

# 7. Đặc tả nghiệp vụ chi tiết — 7 bước đã chốt

Chương này diễn giải nghiệp vụ theo đúng 7 bước anh Lead và chị CEO đã chốt, bám sát sơ đồ flow đính kèm nhưng có cập nhật điểm mới. Các chương kỹ thuật phía sau (Backend, AI, Search, Email, Telegram) chính là phân rã chi tiết của các bước này.

## 7.1. Bước 1 — Nhập thông tin công ty cần tìm

Sales hoặc CEO mở màn hình "New Search" và nhập tên công ty mục tiêu. Trường thông tin gồm:

-   Tên công ty (bắt buộc) — text, độ dài 2-128 ký tự, hỗ trợ tiếng Việt có dấu.

-   Region (tùy chọn) — dropdown các region: Vietnam, SEA, APAC, EU, US, Global. Nếu để trống, hệ thống suy luận từ tên công ty.

-   Ngành nghề ưu tiên (tùy chọn) — dropdown ngành: Fintech, E-commerce, Gaming, EduTech, Logistics, MediaTech, Government, Healthcare, Manufacturing, Other. Dùng để gợi ý kịch bản; nếu để trống sẽ do AI suy luận sau.

-   Tag (tùy chọn) — gắn nhãn chiến dịch để dễ filter sau.

Sau khi submit, hệ thống tạo một bản ghi SearchJob (status = QUEUED) và đẩy vào queue "company.search". Người dùng được redirect sang màn hình Job Detail để xem tiến trình.

| Điểm mới so với v2.0: Khác với phiên bản cũ: input không còn là "keyword" tự do mà là tên công ty cụ thể. Điều này phản ánh đúng cách anh Lead muốn — Sales đã có target list thì hệ thống chỉ tập trung enrich thật sâu cho từng công ty. |
| --- |

## 7.2. Bước 2 — Multi-source search

Khi worker pick được job, nó gọi song song 4 Source Adapter:

| Adapter            | Vai trò                                                                                                                 | Output thô            |
| --- | --- | --- |
| Apollo Adapter         | Tra cứu công ty theo tên + region; lấy domain, ngành, headcount, revenue, mô tả; lấy danh sách contact gắn với công ty.     | JSON Apollo schema        |
| RapidLinkedIn Adapter  | Lấy profile công ty trên LinkedIn (ngành, vị trí, About) và danh sách nhân sự cấp Senior trở lên.                           | JSON LinkedIn schema      |
| Hunter Adapter         | Khi đã có domain, tìm pattern email công ty và verify email cho từng key person.                                            | JSON Hunter schema        |
| Custom Crawler Adapter | Crawl website công ty (trang chủ, About, Team, Careers, Contact), lấy địa chỉ, số điện thoại, hình ảnh team, news mới nhất. | HTML dump + meta snippets |

Mỗi adapter có timeout riêng (mặc định 30s) và circuit breaker. Kết quả được Aggregator hợp nhất, khử trùng lặp theo (full_name + company_domain) và chấm điểm tin cậy theo công thức weighted: Apollo 0.35 + LinkedIn 0.30 + Hunter 0.20 + Crawler 0.15.

## 7.3. Bước 3 — Lấy 3 nhóm thông tin

Aggregator phải đảm bảo gom đủ 3 nhóm thông tin sau cho mỗi công ty:

**a) Thông tin chi tiết công ty**

-   Tên chính thức, tên giao dịch, mã số thuế (nếu Vietnam).

-   Domain chính, sub-domain phụ, profile LinkedIn URL.

-   Ngành nghề chính + sub-industry.

-   Headcount (range), revenue (range), năm thành lập.

-   Trụ sở, các văn phòng phụ, region hoạt động.

-   Mô tả ngắn (tagline/About), tech stack nếu thu được.

-   Tin tức gần đây (3-5 entries) gồm tiêu đề + nguồn + ngày.

**b) Danh sách key persons**

-   Họ tên đầy đủ + các tên/biệt danh hay dùng.

-   Chức danh chính, phòng ban, level (C-level / VP / Director / Manager).

-   Profile LinkedIn URL, ảnh đại diện URL.

-   Years in role, years at company, các company trước đó.

-   Confidence score (0-1) tổng hợp từ các nguồn.

**c) Thông tin liên hệ chi tiết của key person**

-   Email công việc (đã verify Hunter), độ tin cậy (verified / risky / unknown).

-   Email cá nhân nếu lộ public — chỉ dùng khi email công việc không có.

-   Số điện thoại văn phòng, mobile (nếu có).

-   Profile mạng xã hội phụ: Twitter/X, GitHub (cho CTO), Facebook (cho profile bán lẻ).

-   Múi giờ và giờ làm việc (suy luận từ region).

## 7.4. Bước 4 — AI serialize raw data thành dữ liệu có cấu trúc

Tất cả raw output từ Aggregator được tổng hợp thành một message duy nhất rồi gửi vào AI Serialize Service. Service này có 2 provider chạy theo cấu hình:

-   Gemini 1.5 Pro (mặc định primary cho serialize do strong với JSON-mode rẻ)

-   OpenAI GPT-4o (fallback hoặc primary cho ngành phức tạp)

AI nhận prompt với JSON Schema bắt buộc và phải trả về đúng schema. Nếu output không hợp lệ, hệ thống retry tối đa 2 lần, sau đó switch sang provider còn lại. Output cuối được validate bằng AJV trước khi ghi DB.

## 7.5. Bước 5 — Lưu báo cáo và soạn email theo kịch bản ngành nghề

Kết quả structured được lưu thành Company Report trong bảng company_report (xem Chương 17 — Data Model). Trên màn hình Company Report, người dùng thấy báo cáo đầy đủ và có nút "Generate Email Drafts".

Khi nút này được bấm (hoặc tự động chạy nếu config auto_generate = true), AI Scenario Selector phân tích ngành + mô tả công ty + key person và lựa chọn:

-   Industry Scenario phù hợp nhất từ thư viện scenario do Sales Admin duyệt.

-   Variant của scenario theo role (CEO khác CTO khác Procurement).

-   Tone phù hợp (Vietnamese formal / Vietnamese casual / English formal).

AI Email Composer dùng scenario được chọn + dữ liệu cá nhân hóa để soạn nháp email cho từng key person. Mỗi nháp gồm: subject, preview, body HTML + plain-text fallback, lý do AI chọn scenario này (xếp hạng tin cậy).

## 7.6. Bước 6 — Telegram review trước khi gửi

Hệ thống không gửi email tự động. Mỗi nháp được đẩy vào Telegram của người chủ job (hoặc nhóm review) qua Bot "VNETWORK Sales Bot". Tin nhắn Telegram gồm:

-   Tóm tắt prospect: tên, chức danh, công ty, ngành.

-   Subject + 200 ký tự đầu của body.

-   Link inline mở web app để xem full draft (hoặc nút "View full").

-   Bốn nút: Approve & Send · Edit · Reject · Snooze 1h.

Nếu Approve, hệ thống chuyển trạng thái sang APPROVED và đẩy vào queue "email.send". Nếu Edit, người dùng được mở form chỉnh sửa trên web app, lưu xong sẽ quay lại Telegram để approve lần cuối. Nếu Reject, draft bị huỷ và prospect bị đánh dấu "skipped this round".

| Điểm mới so với v2.0: Đây là điểm khác lớn so với sơ đồ gốc — sơ đồ cũ gửi thẳng SMTP. Yêu cầu mới: zero auto-send, mọi email đều phải có dấu vân tay người duyệt. |
| --- |

## 7.7. Bước 7 — Lưu hội thoại và Template Learning

Mọi tương tác trên Telegram (gồm thời gian gửi draft, ai approve, ai edit, diff giữa nháp gốc và bản đã sửa) được lưu vào bảng draft_review_log. Đây là dữ liệu quan trọng phục vụ Template Learning Engine.

Cơ chế Template Learning hoạt động như sau:

1.  Khi một draft được Approve & Send mà KHÔNG có chỉnh sửa nào (approved_as_is = true), engine đánh dấu draft đó là "template candidate" cho tổ hợp (industry, role_level, tone, language).

2.  Sau khi candidate xuất hiện ≥ 3 lần với cùng industry+role và đều approved-as-is, engine promote nó thành Template chính thức và đưa vào Template Library.

3.  Lần search sau với cùng industry+role, AI Email Composer sẽ ưu tiên dùng Template chính thức và chỉ thay thế biến cá nhân hóa ({{first_name}}, {{company}}, {{tech_stack_hint}}, ...) thay vì sinh từ đầu — giảm chi phí AI và tăng tỉ lệ approved-as-is.

4.  Sales Admin có thể khóa, sửa hoặc nghỉ hưu (deprecate) template trong Template Library.

## 7.8. Các bước sau — giống sơ đồ

Từ bước 8 trở đi, luồng giống nguyên sơ đồ flow P1: SMTP Send → Save History → Bounce IMAP listener → Extract bounce → Telegram Alert. Chi tiết kỹ thuật được mô tả ở Chương 12 (Email System) và Chương 13 (Telegram).

-   SMTP Send: gửi email qua SMTP Sender với rate-limit 60 mail/giờ/sender; ghi message-id.

-   Save History: lưu vào bảng email_history toàn bộ snapshot subject, body HTML, thời gian, status.

-   Bounce Listener: chạy worker IMAP IDLE 24/7 trên hộp mail bounce, parse DSN, lookup message-id ngược lại để tìm prospect tương ứng.

-   Telegram Alert: bot push thông báo bounce tới Sales/HOS, kèm lý do (mailbox not found / over quota / blocked / soft bounce …).

-   Đánh dấu prospect status = INVALID_EMAIL, không retry trong 30 ngày, đẩy vào danh sách suppression.

# Mục lục

# 8. Kiến trúc tổng thể

AI Sales Agent được thiết kế theo kiến trúc service-oriented modular monolith ở giai đoạn P1, có thể tách thành microservices ở P2/P3 khi tải tăng. Toàn bộ giao tiếp giữa các thành phần đi qua message queue (Redis Streams hoặc RabbitMQ) để đảm bảo bất đồng bộ và resume được khi worker chết giữa chừng.

## 8.1. Sơ đồ thành phần (logical view)

<table><tbody><tr class="odd"><td>┌─────────────────────┐ ┌────────────────────────────────────────┐<br />
│ Web App (Next.js) │◄──►│ API Gateway (NestJS, Node.js 20) │<br />
│ + Telegram Bot │ │ REST + Webhooks + WebSocket (job log) │<br />
└─────────────────────┘ └─────────────────┬──────────────────────┘<br />
│<br />
┌─────────────────────────────────┼───────────────────────────────────┐<br />
▼ ▼ ▼<br />
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐<br />
│ Search Worker │ │ AI Worker │ │ Email Worker │<br />
│ (Apollo, Rapid, │ │ (Gemini/OpenAI │ │ (SMTP send, │<br />
│ Hunter, Crawler)│ │ serialize + │ │ history log) │<br />
│ │ │ scenario + │ │ │<br />
│ │ │ composer) │ │ │<br />
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘<br />
│ │ │<br />
└──────────────┬─────────────────┴────────────────┬─────────────────┘<br />
▼ ▼<br />
┌────────────────────┐ ┌────────────────────┐<br />
│ PostgreSQL │ │ Object Storage │<br />
│ (primary store) │ │ (raw HTML, attach)│<br />
└────────────────────┘ └────────────────────┘<br />
│<br />
▼<br />
┌────────────────────┐ ┌────────────────────┐<br />
│ Redis (queue + │ │ IMAP Listener │<br />
│ cache + rate-lim) │ │ (bounce daemon) │<br />
└────────────────────┘ └────────────────────┘<br />
│<br />
▼<br />
┌────────────────────┐<br />
│ Telegram Bot Svc │ ◄── webhook from api.telegram.org<br />
└────────────────────┘</td></tr></tbody></table>

## 8.2. Tech stack đề xuất

| Lớp                    | Công nghệ đề xuất                                                                                                       | Lý do                                                                                                         |
| --- | --- | --- |
| Frontend                   | Next.js 14 (App Router) + TypeScript 5 + React 18, TanStack Query, Tailwind CSS, shadcn/ui, Zustand, NextAuth v5, next-intl | Lõi FE chốt cứng. SSR/streaming cho dashboard, server actions cho form, Telegram Mini App tích hợp tự nhiên       |
| API / Backend              | NestJS (Node.js 20 + TypeScript), Zod cho validation, BullMQ cho queue                                                      | Lõi BE chốt cứng. Module/DI rõ ràng, phù hợp modular monolith; cùng TypeScript với FE để chia sẻ schema Zod       |
| Worker runtime             | BullMQ trên Redis 7                                                                                                         | Reliable queue với retry/backoff, concurrency control, native cho Node                                            |
| Database                   | PostgreSQL 15 + extension pg_trgm (fuzzy match) + pgvector (semantic search template)                                      | Lõi DB chốt cứng. Phù hợp dữ liệu quan hệ + cần search ngữ nghĩa template                                         |
| DB driver                  | node-postgres (pg) — kết nối thuần Postgres, không qua ORM                                                                  | Đơn giản, ít magic; team viết SQL trực tiếp, parameterized query, kiểm soát query plan                            |
| Migration                  | node-pg-migrate — file SQL/JS thuần, version-control trong repo                                                             | Không phụ thuộc ORM; lệnh up/down rõ ràng; tích hợp CI/CD dễ                                                      |
| Cache + queue + rate-limit | Redis 7 (cluster optional)                                                                                                  | Đa năng, tin cậy                                                                                                  |
| Object storage             | MinIO self-hosted hoặc S3 compatible                                                                                        | Lưu raw HTML/JSON dump nặng, không nhồi vào DB                                                                    |
| Crawler                    | Playwright (headless Chromium) cho page động + Cheerio cho page tĩnh                                                        | Cân bằng giữa render JS và performance                                                                            |
| AI Gateway nội bộ          | Service Node.js wrap Gemini/OpenAI SDK                                                                                      | Đặt tầng abstraction để dễ chuyển provider, log token, áp policy                                                  |
| Telegram Bot               | node-telegram-bot-api hoặc grammY                                                                                           | Phổ biến, hỗ trợ inline keyboard                                                                                  |
| Mail send                  | Nodemailer + SMTP relay (Postmark/SendGrid) + DKIM signing                                                                  | Reputation tốt, có analytics                                                                                      |
| IMAP listen                | imapflow (Node)                                                                                                             | Hỗ trợ IDLE, parse DSN tốt                                                                                        |
| Auth                       | JWT (access 15 phút) + refresh token + Passport (OAuth Google cho login nội bộ)                                             | Chuẩn, dễ debug                                                                                                   |
| Logging / Metrics          | Pino + OpenTelemetry → Grafana Loki + Prometheus + Tempo                                                                    | Observability đầy đủ                                                                                              |
| Secrets                    | HashiCorp Vault hoặc AWS Secrets Manager                                                                                    | Tách secret khỏi code                                                                                             |
| Containerization           | Docker + docker-compose (P1) → Kubernetes (P2+)                                                                             | Lõi packaging chốt cứng. Mỗi service đóng gói thành Docker image; toàn stack dựng được bằng \`docker compose up\` |

## 8.3. Môi trường

| Môi trường | Mục đích                   | Đặc điểm                                                |
| --- | --- | --- |
| Local dev      | Lập trình viên chạy trên máy   | docker-compose, mock provider                               |
| DEV            | Chia sẻ giữa team dev          | Provider sandbox, dữ liệu giả                               |
| STG            | QA + UAT với CEO/Head Solution | Provider production nhưng quota riêng, mailbox bounce riêng |
| PROD           | Vận hành thực                  | Provider production, mailbox bounce thật, Telegram bot thật |

## 8.4. Đóng gói Docker (bắt buộc)

Toàn bộ hệ thống được đóng gói bằng Docker. Mỗi service là 1 image riêng, deploy theo 1 trong 2 cách: (a) docker-compose ở môi trường dev/STG ban đầu, (b) Kubernetes/Docker Swarm khi sang PROD/P2. Không có service nào chạy bare-metal.

### 8.4.1. Danh sách image

| Image                                | Base                                    | Build từ        | Cổng nội bộ | Ghi chú                                                                 |
| --- | --- | --- | --- | --- |
| vnetwork/sales-web                       | node:20-alpine → nginx:alpine (multi-stage) | apps/web (Next.js)  | 3000            | Build standalone Next.js (next build && next start hoặc output: standalone) |
| vnetwork/sales-api                       | node:20-alpine                              | apps/api (NestJS)   | 4000            | Expose /health, /metrics; chạy bằng node dist/main.js                       |
| vnetwork/sales-worker-search             | node:20-alpine                              | apps/worker-search  | —               | BullMQ worker; không expose cổng                                            |
| vnetwork/sales-worker-ai                 | node:20-alpine                              | apps/worker-ai      | —               | Gọi Gemini/OpenAI; có timeout cao 60s                                       |
| vnetwork/sales-worker-email              | node:20-alpine                              | apps/worker-email   | —               | Gửi qua SMTP, throttle nội bộ                                               |
| vnetwork/sales-worker-bounce             | node:20-alpine                              | apps/worker-bounce  | —               | IMAP IDLE 24/7; cần restart-unless-stopped                                  |
| vnetwork/sales-bot-telegram              | node:20-alpine                              | apps/bot-telegram   | 5000            | Webhook handler                                                             |
| vnetwork/sales-crawler                   | node:20-alpine + chromium                   | apps/worker-crawler | —               | Image lớn nhất ~ 800MB do Playwright Chromium                               |
| postgres:15-alpine + pgvector + pg_trgm | official                                    | —                   | 5432            | Init script bật extension                                                   |
| redis:7-alpine                           | official                                    | —                   | 6379            | Queue + cache                                                               |
| minio/minio:latest                       | official                                    | —                   | 9000            | Object storage cho raw HTML dump                                            |
| mailhog/mailhog (DEV)                    | official                                    | —                   | 1025/8025       | Bắt mail outbound khi DEV                                                   |

### 8.4.2. Multi-stage Dockerfile mẫu cho Next.js

<table><tbody><tr class="odd"><td># apps/web/Dockerfile<br />
FROM node:20-alpine AS deps<br />
WORKDIR /app<br />
COPY package*.json ./<br />
COPY apps/web/package.json apps/web/<br />
RUN npm ci<br />
<br />
FROM node:20-alpine AS build<br />
WORKDIR /app<br />
COPY --from=deps /app/node_modules ./node_modules<br />
COPY . .<br />
ENV NEXT_TELEMETRY_DISABLED=1<br />
RUN npm run build --workspace=apps/web<br />
<br />
FROM node:20-alpine AS runner<br />
WORKDIR /app<br />
ENV NODE_ENV=production<br />
COPY --from=build /app/apps/web/.next/standalone ./<br />
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static<br />
COPY --from=build /app/apps/web/public ./apps/web/public<br />
USER node<br />
EXPOSE 3000<br />
CMD ["node", "apps/web/server.js"]</td></tr></tbody></table>

### 8.4.3. Multi-stage Dockerfile mẫu cho NestJS API

<table><tbody><tr class="odd"><td># apps/api/Dockerfile<br />
FROM node:20-alpine AS deps<br />
WORKDIR /app<br />
COPY package*.json ./<br />
RUN npm ci<br />
<br />
FROM node:20-alpine AS build<br />
WORKDIR /app<br />
COPY --from=deps /app/node_modules ./node_modules<br />
COPY . .<br />
RUN npm run build --workspace=apps/api<br />
<br />
FROM node:20-alpine AS runner<br />
WORKDIR /app<br />
ENV NODE_ENV=production<br />
COPY --from=build /app/apps/api/dist ./dist<br />
COPY --from=deps /app/node_modules ./node_modules<br />
COPY apps/api/package.json ./<br />
USER node<br />
EXPOSE 4000<br />
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 <br />
CMD wget -qO- http://localhost:4000/health || exit 1<br />
CMD ["node", "dist/main.js"]</td></tr></tbody></table>

### 8.4.4. docker-compose.yml — cấu trúc lõi

<table><tbody><tr class="odd"><td># docker-compose.yml (rút gọn)<br />
services:<br />
web:<br />
image: vnetwork/sales-web:${TAG:-latest}<br />
env_file: .env<br />
depends_on: [api]<br />
ports: ["3000:3000"]<br />
<br />
api:<br />
image: vnetwork/sales-api:${TAG:-latest}<br />
env_file: .env<br />
depends_on: [postgres, redis]<br />
ports: ["4000:4000"]<br />
<br />
worker-search:<br />
image: vnetwork/sales-worker-search:${TAG:-latest}<br />
env_file: .env<br />
depends_on: [postgres, redis]<br />
deploy: { replicas: 2 }<br />
<br />
worker-ai:<br />
image: vnetwork/sales-worker-ai:${TAG:-latest}<br />
env_file: .env<br />
depends_on: [postgres, redis]<br />
<br />
worker-email:<br />
image: vnetwork/sales-worker-email:${TAG:-latest}<br />
env_file: .env<br />
depends_on: [postgres, redis, mailhog]<br />
<br />
worker-bounce:<br />
image: vnetwork/sales-worker-bounce:${TAG:-latest}<br />
env_file: .env<br />
restart: unless-stopped<br />
<br />
bot-telegram:<br />
image: vnetwork/sales-bot-telegram:${TAG:-latest}<br />
env_file: .env<br />
ports: ["5000:5000"]<br />
<br />
crawler:<br />
image: vnetwork/sales-crawler:${TAG:-latest}<br />
env_file: .env<br />
depends_on: [redis]<br />
shm_size: '1gb' # cần cho Playwright Chromium<br />
<br />
postgres:<br />
image: postgres:15-alpine<br />
environment:<br />
POSTGRES_DB: ai_sales<br />
POSTGRES_USER: vn<br />
POSTGRES_PASSWORD: ${PG_PASSWORD}<br />
volumes:<br />
- pgdata:/var/lib/postgresql/data<br />
- ./infra/init.sql:/docker-entrypoint-initdb.d/init.sql:ro<br />
ports: ["5432:5432"]<br />
<br />
redis:<br />
image: redis:7-alpine<br />
volumes: [redisdata:/data]<br />
ports: ["6379:6379"]<br />
<br />
minio:<br />
image: minio/minio:latest<br />
command: server /data --console-address ":9001"<br />
environment:<br />
MINIO_ROOT_USER: ${MINIO_USER}<br />
MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}<br />
volumes: [miniodata:/data]<br />
ports: ["9000:9000", "9001:9001"]<br />
<br />
mailhog:<br />
image: mailhog/mailhog:latest<br />
ports: ["1025:1025", "8025:8025"]<br />
profiles: ["dev"]<br />
<br />
volumes:<br />
pgdata:<br />
redisdata:<br />
miniodata:</td></tr></tbody></table>

### 8.4.5. Quy tắc đóng gói bắt buộc

-   Mỗi image multi-stage để giảm size; layer cuối chạy bằng user \`node\` (UID 1000) — không root.

-   Mỗi image có HEALTHCHECK; orchestrator dùng healthcheck để restart.

-   Không nhúng secret vào image. Mọi secret chỉ inject qua env_file (.env) hoặc Docker secrets ở PROD.

-   Tag image theo Git SHA (vd. vnetwork/sales-api:abc1234) cho deploy reproducible. Tag latest chỉ dùng cho DEV.

-   Image push lên registry riêng của VNETWORK (Harbor hoặc GitHub Container Registry); CI tự động push trên branch main và tag release.

-   .dockerignore loại trừ node_modules, .git, .next, dist, \*.md, test/, fixtures/, để build cache hiệu quả.

-   Không bao giờ cài thêm package trong runtime stage. Mọi dependency phải có trong package.json và đi qua build stage.

-   Crawler image cần shm_size ≥ 1GB và --cap-add=SYS_ADMIN khi chạy Chromium ở production.

-   PostgreSQL image dùng init.sql để bật pg_trgm + pgvector tự động ở khởi tạo cluster.

# 9. Đặc tả Backend

## 9.1. Cấu trúc module

Backend tổ chức theo NestJS module, mỗi domain một module rõ ràng:

<table><tbody><tr class="odd"><td>apps/<br />
api/ # API Gateway, Auth, RBAC<br />
worker-search/ # Multi-source search worker<br />
worker-ai/ # AI serialize + scenario + composer<br />
worker-email/ # SMTP send + history<br />
worker-bounce/ # IMAP listener<br />
bot-telegram/ # Telegram webhook handler<br />
libs/<br />
db/ # pg pool config, helper query, parameterized SQL builder nội bộ<br />
migrations/ # node-pg-migrate files: 001_init.sql, 002_*, ...<br />
domain/ # Repository functions (raw SQL parameterized) + Zod DTO<br />
ai-gateway/ # Wrap Gemini + OpenAI<br />
source-adapter/ # Apollo, Rapid, Hunter, Crawler adapters<br />
mail-utils/ # SMTP, DKIM, DSN parser<br />
template-engine/ # Render template + diff detector<br />
rbac/ # Role/permission<br />
shared/ # logger, error, dto, utils</td></tr></tbody></table>

## 9.2. REST API endpoints (chính)

Các endpoint dưới đây phục vụ Frontend. Tất cả đều JSON, header Authorization Bearer JWT, response chuẩn { data, error, meta }.

| Method | Path                     | Mô tả                                                  | Role        |
| --- | --- | --- | --- |
| POST       | /auth/login                  | Login bằng Google OAuth nội bộ                             | Public          |
| POST       | /auth/refresh                | Refresh access token                                       | Authenticated   |
| GET        | /auth/me                     | Profile user hiện tại                                      | Authenticated   |
| POST       | /searches                    | Tạo SearchJob mới (Bước 1)                                 | Sales+          |
| GET        | /searches                    | List SearchJob (filter status/owner/date)                  | Sales+          |
| GET        | /searches/:id                | Chi tiết job + tiến trình từng adapter                     | Sales+          |
| POST       | /searches/:id/retry          | Retry job đã fail                                          | Sales+          |
| GET        | /companies/:id/report        | Lấy Company Report đã serialize                            | Sales+          |
| GET        | /companies/:id/report/export | Export PDF/Excel                                           | Sales+          |
| POST       | /companies/:id/drafts        | Trigger AI Composer sinh draft email cho key persons       | Sales+          |
| GET        | /drafts                      | List draft (filter status: pending/approved/sent/rejected) | Sales+          |
| GET        | /drafts/:id                  | Chi tiết draft + lịch sử review                            | Sales+          |
| PATCH      | /drafts/:id                  | Sửa draft (subject/body)                                   | Sales+          |
| POST       | /drafts/:id/approve          | Approve and queue send                                     | Sales+          |
| POST       | /drafts/:id/reject           | Reject + lý do                                             | Sales+          |
| GET        | /templates                   | List Template Library                                      | Sales+          |
| POST       | /templates                   | Tạo template thủ công                                      | Admin           |
| PATCH      | /templates/:id               | Sửa/khoá/deprecate template                                | Admin           |
| GET        | /scenarios                   | List Industry Scenario                                     | Sales+          |
| POST       | /scenarios                   | Tạo scenario                                               | Admin/CEO       |
| PATCH      | /scenarios/:id               | Sửa scenario                                               | Admin/CEO       |
| GET        | /email-history               | Lịch sử gửi (filter)                                       | Sales+          |
| GET        | /bounces                     | List bounce gần đây                                        | Sales+          |
| POST       | /webhooks/telegram           | Webhook Telegram                                           | Public + secret |
| GET        | /settings/smtp               | Lấy SMTP config (mask)                                     | Admin           |
| PUT        | /settings/smtp               | Cập nhật SMTP                                              | Admin           |
| GET        | /settings/imap               | Lấy IMAP config                                            | Admin           |
| PUT        | /settings/imap               | Cập nhật IMAP                                              | Admin           |
| GET        | /settings/api-keys           | Lấy danh sách provider key (mask)                          | Admin           |
| PUT        | /settings/api-keys           | Cập nhật key provider                                      | Admin           |
| GET        | /users                       | List user nội bộ                                           | Admin           |
| POST       | /users                       | Tạo user                                                   | Admin           |
| PATCH      | /users/:id                   | Đổi role/disable                                           | Admin           |
| GET        | /audit-logs                  | Audit log (action, user, time)                             | Admin           |

## 9.3. WebSocket / SSE

Để hiển thị tiến trình job real-time, API expose WebSocket channel /ws hoặc Server-Sent Events. Khi worker push event vào Redis Pub/Sub, gateway forward về client. Event payload:

<table><tbody><tr class="odd"><td>{<br />
"type": "search.progress",<br />
"jobId": "uuid",<br />
"adapter": "apollo|rapid|hunter|crawler",<br />
"status": "running|done|failed",<br />
"elapsedMs": 1240,<br />
"message": "Found 7 contacts"<br />
}</td></tr></tbody></table>

## 9.4. Background workers

Mỗi worker được đóng container riêng và scale theo nhu cầu. Concurrency mặc định:

| Worker    | Queue                 | Concurrency mặc định                | Retry policy                                 |
| --- | --- | --- | --- |
| worker-search | company.search            | 10 job đồng thời                        | exp backoff, max 3 lần, sau đó DLQ               |
| worker-ai     | ai.serialize / ai.compose | 20 job đồng thời                        | exp backoff, max 3 lần (failover provider lần 2) |
| worker-email  | email.send                | 30 mail đồng thời, throttle 60/h/sender | linear backoff, max 5 lần                        |
| worker-bounce | imap.idle                 | 1 instance per mailbox                  | auto reconnect 30s nếu mất kết nối               |
| bot-telegram  | tg.outbound / tg.inbound  | 5 job đồng thời                         | exp backoff, max 3 lần                           |

## 9.5. Job state machine — SearchJob

<table><tbody><tr class="odd"><td>QUEUED ─► RUNNING_SEARCH ─► RUNNING_AI ─► REPORT_READY ─► (composer ran) ─► DRAFTS_READY<br />
│<br />
├─► PARTIAL (một số adapter fail nhưng vẫn đủ data)<br />
└─► FAILED (≥ 3 retry)</td></tr></tbody></table>

## 9.6. Job state machine — Draft

<table><tbody><tr class="odd"><td>PENDING_REVIEW ─► (Telegram approve) ─► APPROVED ─► SENT ─► (DSN bounce?) ─► BOUNCED<br />
│ │<br />
│ └► DELIVERED (no bounce within 48h)<br />
├─► EDITED → PENDING_REVIEW<br />
└─► REJECTED</td></tr></tbody></table>

## 9.7. Error handling và DLQ

-   Mỗi job có max retry và backoff riêng (xem 9.4).

-   Job hết retry vào DLQ tương ứng (search.dlq, ai.dlq, email.dlq).

-   Cron 5 phút quét DLQ, gửi summary Telegram cho Head Solution.

-   Mỗi error có errorCode (string ổn định), message (i18n), context (JSON).

# 10. AI Models và Dual-Provider Strategy

## 10.1. Tổng quan

Hệ thống dùng đồng thời Google Gemini và OpenAI cho 3 nhiệm vụ AI khác nhau, với chiến lược primary/fallback có thể đảo theo cấu hình. Tầng AI Gateway nội bộ ẩn provider khỏi caller, log token và áp policy giới hạn (rate, max tokens, content filter).

## 10.2. Ba nhiệm vụ AI

| Nhiệm vụ   | Mô tả                                                     | Primary    | Fallback     | Output format                                     |
| --- | --- | --- | --- | --- |
| serialize      | Chuyển raw data hỗn loạn thành JSON theo schema CompanyReport | Gemini 1.5 Pro | GPT-4o-mini      | JSON (strict schema)                                  |
| scenario_pick | Chọn 1 trong N Industry Scenario phù hợp ngành + role         | GPT-4o-mini    | Gemini 1.5 Flash | JSON {scenario_id, confidence, reasons[]}          |
| compose        | Soạn email cá nhân hóa từ scenario + key person + company     | GPT-4o         | Gemini 1.5 Pro   | JSON {subject, body_html, body_text, variables[]} |

Cấu hình provider được lưu trong bảng ai_config và có thể đổi qua /settings/api-keys. Trong PROD, primary cho compose là GPT-4o vì độ tự nhiên ngôn ngữ tốt hơn cho tiếng Việt formal; primary cho serialize là Gemini 1.5 Pro vì rẻ hơn ở chế độ JSON-mode.

## 10.3. AI Gateway — interface chuẩn

<table><tbody><tr class="odd"><td>interface AiGateway {<br />
serialize(input: { rawDump: string; schema: JSONSchema7 }): Promise&lt;{<br />
json: any;<br />
provider: 'gemini' | 'openai';<br />
tokensIn: number;<br />
tokensOut: number;<br />
latencyMs: number;<br />
}&gt;;<br />
<br />
pickScenario(input: {<br />
company: CompanyReport;<br />
person: KeyPerson;<br />
candidateScenarios: Scenario[];<br />
}): Promise&lt;{<br />
scenarioId: string;<br />
confidence: number; // 0..1<br />
reasons: string[];<br />
}&gt;;<br />
<br />
compose(input: {<br />
scenario: Scenario;<br />
company: CompanyReport;<br />
person: KeyPerson;<br />
language: 'vi-VN' | 'en';<br />
tone: 'formal' | 'casual';<br />
referenceTemplate?: Template;<br />
}): Promise&lt;{<br />
subject: string;<br />
bodyHtml: string;<br />
bodyText: string;<br />
variablesUsed: string[];<br />
}&gt;;<br />
}</td></tr></tbody></table>

## 10.4. Prompt design

### 10.4.1. Prompt serialize (system message)

<table><tbody><tr class="odd"><td>Bạn là một data extraction engine. Nhiệm vụ: nhận một blob raw text/HTML<br />
hỗn loạn về một công ty và các key person, và trả về JSON đúng theo schema<br />
"CompanyReport" được cung cấp.<br />
<br />
QUY TẮC TUYỆT ĐỐI:<br />
- Chỉ trả về JSON hợp lệ, không kèm văn bản giải thích.<br />
- Nếu trường không suy luận được, để null. Không được bịa.<br />
- Email phải đúng định dạng RFC 5322. Phone phải đúng E.164 nếu có thể.<br />
- Confidence score (0..1) cho mỗi key person dựa trên độ trùng khớp giữa<br />
các nguồn (Apollo / LinkedIn / Hunter / Crawler).<br />
- Khử trùng lặp key person theo (full_name + company_domain).</td></tr></tbody></table>

### 10.4.2. Prompt pick scenario (system message)

<table><tbody><tr class="odd"><td>Bạn là một sales strategist của VNETWORK (CDN/Cloud Security/AntiDDoS).<br />
Cho thông tin công ty và key person, hãy chọn scenario phù hợp nhất từ<br />
candidateScenarios. Trả về JSON với:<br />
- scenarioId<br />
- confidence (0..1)<br />
- reasons (3 lý do ngắn, mỗi lý do &lt;= 25 từ)<br />
<br />
Tiêu chí ưu tiên:<br />
1) Khớp ngành nghề chính của công ty.<br />
2) Phù hợp role (CEO ưu tiên scenario business outcome; CTO ưu tiên scenario<br />
technical pain; Procurement ưu tiên scenario cost saving).<br />
3) Khớp region (VN ưu tiên scenario tiếng Việt).</td></tr></tbody></table>

### 10.4.3. Prompt compose (system message)

<table><tbody><tr class="odd"><td>Bạn là một Account Executive của VNETWORK. Soạn 1 email outreach lần đầu<br />
gửi cho key person dựa trên scenario, dữ liệu công ty và key person.<br />
<br />
QUY TẮC:<br />
- Tôn trọng tone và language được chỉ định.<br />
- Subject ≤ 80 ký tự, không clickbait, không emoji.<br />
- Body 90–160 từ. Cấu trúc: 1 câu mở chạm pain point, 1 câu giới thiệu<br />
giá trị VNETWORK, 1 đoạn dẫn chứng (case study/số liệu), 1 CTA mềm.<br />
- Không dùng từ "tuyệt vời", "đột phá", "cách mạng", "best-in-class".<br />
- Cá nhân hóa: nhắc tên, công ty, ít nhất 1 chi tiết suy ra từ company<br />
data (ví dụ: tech stack, region, tin tức gần đây).<br />
- Trả về JSON {subject, body_html, body_text, variables_used}.</td></tr></tbody></table>

## 10.5. Failover và observability

-   Mỗi request AI có timeout 30s. Quá timeout → switch provider, retry 1 lần.

-   Schema validation bằng AJV; output sai schema bị retry bằng provider khác kèm prompt feedback.

-   Log mỗi call: provider, model, prompt hash, tokens in/out, cost USD, latency, success/fail.

-   Dashboard Grafana hiện cost ngày/tháng theo provider, tỉ lệ failover, error rate.

## 10.6. Bảo mật prompt và dữ liệu

-   Mọi raw data và prompt KHÔNG chứa email/credential khách hàng VNETWORK; chỉ chứa thông tin công khai về prospect.

-   Bật setting "do not train" của OpenAI và Gemini Enterprise (nếu có) — dữ liệu không dùng để train model.

-   Cấm prompt injection cơ bản: AI Gateway strip các block markdown nguy hiểm trước khi chèn raw dump.

-   Audit log toàn bộ prompt + response 90 ngày, encrypt at rest.

# 11. Cơ chế tìm kiếm thông tin

## 11.1. Tổng thể

Search Layer chia làm 3 tầng: Source Adapter (mỗi nguồn 1 adapter), Aggregator (gộp + khử trùng + chấm điểm), Cache & Rate-limit.

## 11.2. Source Adapter — Apollo

| Mục        | Chi tiết                                                                                                                                                                        |
| --- | --- |
| Endpoint chính | POST /api/v1/mixed_companies/search và POST /api/v1/people/search                                                                                                                  |
| Auth           | Header X-Api-Key                                                                                                                                                                    |
| Input          | { q_organization_name, organization_locations[], organization_num_employees_ranges[] }                                                                                    |
| Output thô     | JSON Apollo organizations[] + people[]                                                                                                                                          |
| Trường ánh xạ  | name, primary_domain, industry, estimated_num_employees, founded_year, raw_address, linkedin_url; people: first_name, last_name, title, email, email_status, mobile_phone |
| Quota          | Theo plan; rate-limit nội bộ 60 req/phút                                                                                                                                            |
| Lỗi xử lý      | 401 → log invalid_api_key; 429 → backoff 60s; 5xx → retry 2 lần                                                                                                                   |

## 11.3. Source Adapter — Rapid LinkedIn

| Mục       | Chi tiết                                                                                                                                         |
| --- | --- |
| Endpoint      | GET /companies/{slug} và GET /companies/{slug}/employees (qua RapidAPI gateway)                                                                      |
| Auth          | X-RapidAPI-Key + X-RapidAPI-Host                                                                                                                     |
| Input         | Tên công ty được normalize (slugify) hoặc LinkedIn URL từ Apollo                                                                                     |
| Output thô    | JSON LinkedIn schema                                                                                                                                 |
| Trường ánh xạ | company.industry, company.specialties, company.about, company.headquarter; employees[].full_name, employees[].title, employees[].profile_url |
| Quota         | Theo plan RapidAPI; cache TTL 24h theo slug                                                                                                          |
| Lỗi xử lý     | 404 → bỏ qua adapter; 429 → backoff theo header                                                                                                      |

## 11.4. Source Adapter — Hunter

| Mục       | Chi tiết                                                                              |
| --- | --- |
| Endpoint      | GET /v2/domain-search và GET /v2/email-finder và GET /v2/email-verifier                   |
| Auth          | Query api_key                                                                            |
| Input         | domain (lấy từ Apollo) + first_name + last_name                                         |
| Output thô    | JSON Hunter (emails[], pattern, sources[])                                            |
| Trường ánh xạ | person.email, person.email_status (deliverable/risky/undeliverable), person.email_score |
| Quota         | Free tier 25/mo → cần plan trả phí cho PROD                                               |
| Lỗi xử lý     | Email score &lt; 50 → đánh dấu risky, không tự gửi                                        |

## 11.5. Source Adapter — Custom Crawler

Đây là bot crawl tự dựng để bù chỗ Apollo/Rapid/Hunter còn thiếu. Crawler tổ chức như sau:

-   Bước 1: nhận domain công ty từ Aggregator.

-   Bước 2: crawl tuần tự các path quan trọng: /, /about, /team, /leadership, /contact, /careers, /press, /news. Hỗ trợ cả /vi/ và /en/ cho site đa ngôn ngữ.

-   Bước 3: dùng Playwright headless cho page có JS render, fallback Cheerio cho page tĩnh.

-   Bước 4: trích xuất bằng heuristic + regex: tên người + chức danh trong block /team/, email pattern trong /contact/, social link trong footer, tin tức trong /news/.

-   Bước 5: nén HTML và lưu MinIO theo path raw/{job_id}/{domain}/{path}.html.gz để audit.

-   User-Agent khai báo "VNETWORK-SalesBot/1.0 (+contact@vnetwork.vn)" và tôn trọng robots.txt; nếu robots.txt cấm thì skip.

-   Throttle: tối đa 4 request đồng thời/domain, delay 2s giữa các request.

## 11.6. Aggregator

Aggregator nhận output JSON normalized từ 4 adapter và thực hiện:

1.  Khử trùng lặp key person theo (lower(full_name) + canonical_domain).

2.  Hợp nhất trường: ưu tiên thứ tự Apollo &gt; LinkedIn &gt; Hunter &gt; Crawler cho từng trường.

3.  Tính confidence score: trọng số mặc định Apollo 0.35, LinkedIn 0.30, Hunter 0.20, Crawler 0.15. Nếu nguồn nào đồng thuận, cộng 0.10.

4.  Validate format email/phone; loại trường rác ("info@", "sales@" mặc định không tính là key person).

5.  Output structured rồi đẩy vào queue ai.serialize.

## 11.7. Cache, rate-limit và quota

-   Cache layer Redis cho từng (adapter, query_hash) với TTL 24h cho Apollo/RapidAPI, 7 ngày cho Crawler.

-   Rate-limit theo provider, key bucket sliding window: ví dụ Apollo 60 req/phút, Hunter 15 req/phút.

-   Khi sắp đụng quota daily (&gt;= 80%) → cron alert Telegram cho Head Solution.

-   Mỗi quota usage đẩy metric Prometheus để Grafana hiện.

# 12. Hệ thống Email

## 12.0. Chế độ an toàn Phase 1 — KHÔNG gửi mail ra ngoài

Theo quyết định của CEO và Head Solution ngày 07/05/2026, trong toàn bộ Phase 1 (kể cả production demo), hệ thống KHÔNG gửi email tới bất kỳ địa chỉ ngoài VNETWORK. Mọi email dù được Telegram approve cho recipient nào (vd. trana@acme.vn) đều được chặn ở tầng SMTP Sender và redirect tới một địa chỉ catch-all duy nhất: tandtnt18@gmail.com.

-   Cờ kiểm soát: outbound_redirect_target = "tandtnt18@gmail.com" (lưu trong bảng settings, chỉ Head Solution có quyền sửa).

-   Cờ phụ: enable_external_send = false trong P1 — khi true thì hệ thống mới gửi tới recipient gốc; mặc định false xuyên suốt P1.

-   Tầng chặn: SMTP Sender Service làm interceptor — nhận draft đã approved, đọc cờ enable_external_send. Nếu false → ghi đè trường To = outbound_redirect_target trước khi handoff cho Nodemailer.

-   Recipient gốc (intended_recipient) vẫn được lưu nguyên trong email_history để audit và để sau này khi P1.5 bật cờ thì tái diễn được.

-   Subject line được prefix [P1-DEMO → trana@acme.vn] để tandtnt18@gmail.com biết "đáng lẽ" mail này gửi cho ai.

-   Trong body HTML/text, hệ thống chèn 1 banner header màu vàng: "Đây là email Phase 1 demo. Recipient gốc: &lt;intended_recipient&gt;. Email này được redirect tự động về tandtnt18@gmail.com."

-   Header email outbound chuẩn: To: tandtnt18@gmail.com; X-VN-Intended-Recipient: trana@acme.vn; X-VN-Phase: P1; X-VN-Draft-Id: DR-2026-0517.

-   Nodemailer config trong P1 KHÔNG có quyền gửi tới domain ngoài cho dù code lỗi: ràng buộc cứng ở allowlist domain chỉ chứa gmail.com (cho hộp test) và vnetwork.vn. Mọi domain khác bị reject ở pre-send hook và ghi log security_violation.

-   Khi Phase 1.5/Phase 2 bắt đầu: thay đổi yêu cầu phê duyệt ký bằng văn bản từ CEO; mở allowlist domain qua MR riêng vào repo có 2 reviewer.

Mục tiêu của chế độ này: cho phép demo full luồng end-to-end với dữ liệu thật mà không có rủi ro spam khách hàng thật, không có rủi ro tổn hại reputation domain, không có rủi ro pháp lý (Nghị định 13/2023 về dữ liệu cá nhân) khi luồng AI/bot vẫn chưa được kiểm thử đủ.

## 12.1. SMTP Sender

-   Kết nối SMTP TLS đến relay (Postmark/SendGrid) hoặc internal MTA.

-   Mỗi sender (vd. an@vnetwork.vn, ceo@vnetwork.vn) có rate-limit riêng: tối đa 60 mail/giờ, 300 mail/ngày.

-   Bắt buộc DKIM, SPF align, DMARC. Header List-Unsubscribe luôn có cho dù là cold outreach.

-   Header X-VN-Draft-Id chứa draft.id để truy ngược khi DSN về.

-   Body đa phần (multipart/alternative): HTML + plain text fallback.

## 12.2. Template engine

-   Render bằng Mustache (đơn giản, ổn) với set biến chuẩn: {{first_name}}, {{last_name}}, {{title}}, {{company}}, {{industry}}, {{tech_stack_hint}}, {{news_hint}}, {{sender_name}}, {{calendar_link}}, {{signature}}.

-   Mỗi template có version. Khi sửa template, version tăng và template cũ vẫn dùng được cho draft cũ.

-   Khi compose, hệ thống render preview, kiểm tra biến thiếu (placeholder không thay được) → block draft đi review nếu có biến thiếu.

## 12.3. IMAP Bounce Listener

-   Hộp mail bounce dùng tài khoản riêng (vd. bounce@vnetwork.vn), kết nối IMAP IDLE 24/7.

-   Khi có mail mới: parse header Auto-Submitted, content-type multipart/report; lấy field Status, Diagnostic-Code, Final-Recipient.

-   Lookup ngược draft.id từ header X-VN-Draft-Id hoặc Original-Recipient.

-   Phân loại: hard_bounce / soft_bounce / spam_block / quota_full / temp_unavailable.

-   Cập nhật trạng thái: hard_bounce → email status = INVALID, prospect đẩy vào suppression list 30 ngày; soft_bounce → đếm, hard_bounce sau 3 lần.

-   Nếu DSN không thể parse, log raw vào dlq.bounce và alert Telegram cho Head Solution.

## 12.4. Suppression list

-   Bảng email_suppression chứa email đã bounce hoặc đã unsubscribe.

-   Trước khi gửi, worker email kiểm tra suppression list; nếu hit → block + log.

-   UI Settings → Suppression cho phép Admin xem/xuất CSV.

# 13. Telegram Bot và Review Workflow

## 13.1. Kiến trúc

-   Bot "VNETWORK Sales Bot" được tạo qua BotFather. Token lưu Vault.

-   Chế độ webhook (an toàn hơn polling): Telegram POST về https://{domain}/webhooks/telegram?secret={SECRET}.

-   Chỉ chấp nhận user thuộc whitelist (tg_user_id của Sales/CEO/HOS).

-   Bot Service xử lý 2 chiều: outbound (gửi draft / alert) và inbound (nhận click button, text edit).

## 13.2. Inline keyboard cho draft

<table><tbody><tr class="odd"><td>📩 Draft mới — Acme Corp (Fintech)<br />
Người nhận: Trần Văn A (CTO)<br />
Subject: VNETWORK CDN cho Acme — đề xuất tối ưu chi phí băng thông<br />
<br />
Mở đầu: Chào anh A, để ý Acme vừa launch app v2 trên 3 region…<br />
[ View full ] [ ✅ Approve &amp; Send ] [ ✏️ Edit ] [ ❌ Reject ] [ 🕒 Snooze 1h ]</td></tr></tbody></table>

## 13.3. Hành vi từng nút

| Nút        | Hành vi backend                                                                                                                                         |
| --- | --- |
| View full      | Mở Mini App / link web app trong Telegram, hiển thị full body và các thông tin context                                                                      |
| Approve & Send | Đánh dấu draft.status = APPROVED, push event kèm approver vào queue email.send. Nếu draft chưa bị edit → set approved_as_is = true (cờ Template Learning) |
| Edit           | Mở web app trang chỉnh sửa; sau khi save, draft trở về PENDING_REVIEW, gửi lại tin nhắn Telegram mới                                                       |
| Reject         | Hỏi lý do qua reply text → lưu draft.status = REJECTED + reason; cập nhật prospect skipped_count                                                           |
| Snooze 1h      | Schedule gửi lại tin nhắn nhắc sau 1h                                                                                                                       |

## 13.4. Bounce alert

<table><tbody><tr class="odd"><td>⚠️ BOUNCE<br />
Người nhận: trana@acme.vn (Trần Văn A — CTO)<br />
Công ty: Acme Corp · Ngành: Fintech<br />
Lý do: 550 5.1.1 The email account that you tried to reach does not exist<br />
Draft: #DR-2026-0517 (đã gửi 11:42, 07/05/2026)<br />
Hành động: Prospect đã bị set INVALID_EMAIL trong 30 ngày.</td></tr></tbody></table>

## 13.5. Audit và bảo mật bot

-   Mọi message vào/ra log đầy đủ vào draft_review_log.

-   Nếu user click không thuộc whitelist → trả lời "Bạn không có quyền" và log security_violation.

-   Bot không nhận lệnh tự nhiên ngôn ngữ trong P1 (chỉ phản hồi callback button + text edit). Tránh prompt injection qua Telegram.

# 14. Template Learning Engine

## 14.1. Mục đích

Sau mỗi lần Sales/CEO duyệt một draft mà không sửa gì, đó là tín hiệu mạnh rằng AI đã soạn rất phù hợp cho tổ hợp (industry, role_level, tone, language). Engine ghi nhận tín hiệu này, biến nó thành Template chính thức để giảm chi phí AI và tăng nhất quán giọng văn.

## 14.2. Cơ chế promote candidate → template

1.  Khi draft được Approve & Send và approved_as_is = true, hệ thống lưu nội dung gốc vào bảng template_candidate với key = (industry, role_level, tone, language).

2.  Mỗi candidate là 1 dòng riêng, kèm draft_id, embedding (pgvector) của body.

3.  Cron mỗi 15 phút quét candidate: nhóm theo key, nếu có ≥ 3 candidate trong 30 ngày gần nhất AND độ tương tự semantic ≥ 0.85 → promote thành Template chính thức.

4.  Template chính thức được Sales Admin review (notify Telegram). Admin có thể chỉnh, khoá hoặc deprecate.

## 14.3. Cơ chế dùng template ở compose

-   Khi AI Composer nhận yêu cầu compose, đầu tiên truy vấn Template Library theo key (industry, role_level, tone, language).

-   Nếu có template active → AI chỉ thay biến cá nhân hóa, không sinh từ đầu. Dùng provider rẻ hơn (Gemini 1.5 Flash).

-   Nếu không có → fallback sinh full bằng GPT-4o (như Chương 10).

-   Trường compose_mode trong draft = 'from_template' | 'from_scratch' để debug/monitor.

## 14.4. Đánh giá template

-   Mỗi template có metrics: send_count, approved_as_is_count, edit_count, reply_count, bounce_count.

-   Template có edit_rate &gt; 50% → tự động cảnh báo Sales Admin xem lại.

-   Template có reply_rate &gt; average + 1σ → đánh dấu "top performer" và ưu tiên dùng.

## 14.5. Anti-pattern phải tránh

-   Không learn từ draft REJECTED (đó là tín hiệu xấu).

-   Không learn từ draft đã gửi nhưng bị bounce (không phản ánh chất lượng nội dung).

-   Không learn nếu user bấm Approve nhưng đã edit dù chỉ 1 ký tự (approved_as_is = false).

-   Không tự động dùng template chưa được Sales Admin approve.

# 15. Đặc tả Frontend

## 15.1. Tech stack

-   Framework: Next.js 14 (App Router) + TypeScript 5 + React 18 (server components mặc định, client components khi cần state/effect).

-   Lý do chọn Next.js: SSR/streaming cho dashboard nặng dữ liệu, file-based routing chuẩn, server actions cho form đơn giản, dễ deploy lên Vercel hoặc tự host bằng Node, cùng team có thể dùng Server Components để gọi DB/API mà không phải tự dựng BFF cho FE.

-   UI: Tailwind CSS + shadcn/ui (Radix primitives) — đồng bộ với hệ design VNETWORK.

-   State: Zustand cho local UI state, TanStack Query (React Query) cho server state, server components cho data fetching ban đầu.

-   Routing: Next.js App Router (app/) với layout lồng nhau và route group; code splitting và lazy load tự động.

-   Form: React Hook Form + Zod resolver; chia sẻ schema Zod giữa FE và BE.

-   Charts: Recharts (cho dashboard) — render client side.

-   Realtime: WebSocket native + socket.io-client cho log job; SSE qua Route Handler khi cần fallback.

-   Telegram Mini App: tách thành route /tma/\* trong cùng app Next.js, tận dụng layout tối tự động và validate initData phía server.

-   i18n: next-intl (chuẩn cho Next.js App Router), mặc định tiếng Việt, hỗ trợ tiếng Anh.

-   Auth: NextAuth (Auth.js) v5 với provider Google OAuth nội bộ; session lưu JWT cookie HTTP-only.

-   Tooling: npm workspaces + Turbo (monorepo), ESLint + Prettier, Playwright cho e2e.

-   Cấu trúc thư mục: app/(dashboard)/\* cho FE chính, app/api/\* cho route handler nhẹ (proxy + auth), app/tma/\* cho Telegram Mini App, components/, lib/, schemas/.

## 15.2. Layout chung

*Wireframe: Layout chung — Sidebar + Top bar + Main*

<table><tbody><tr class="odd"><td>┌──────────────────────────────────────────────────────────────────────────┐<br />
│ [VNETWORK] AI Sales Agent 🔔 3 ⚙️ 👤 An (Sales) v ▼ │<br />
├──────────┬───────────────────────────────────────────────────────────────┤<br />
│ │ Breadcrumb: Dashboard / New Search │<br />
│ ▣ Dashbd │ ┌─────────────────────────────────────────────────────────┐ │<br />
│ + New │ │ │ │<br />
│ 🔎 Search│ │ MAIN CONTENT AREA │ │<br />
│ 🏢 Compa.│ │ │ │<br />
│ ✉️ Drafts│ │ │ │<br />
│ 📚 Tmpl │ │ │ │<br />
│ 📊 Histo.│ │ │ │<br />
│ ⚠️ Bounce│ │ │ │<br />
│ │ │ │ │<br />
│ ──── │ │ │ │<br />
│ ⚙️ Settin│ │ │ │<br />
│ 👥 Users │ │ │ │<br />
│ 🔐 Audit │ └─────────────────────────────────────────────────────────┘ │<br />
└──────────┴───────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.3. Bảng các màn hình

| Mã màn hình | Tên              | Role thấy | Mục đích                                                     |
| --- | --- | --- | --- |
| SC-01           | Login                | Public        | Đăng nhập Google OAuth nội bộ                                    |
| SC-02           | Dashboard            | All           | Số liệu tổng quan: jobs, drafts pending, sent today, bounce rate |
| SC-03           | New Search           | Sales+        | Bước 1 — nhập tên công ty + region                               |
| SC-04           | Search Job Detail    | Sales+        | Theo dõi tiến trình 4 adapter + AI serialize realtime            |
| SC-05           | Company List         | Sales+        | Danh sách công ty đã enrich, filter ngành/region/owner           |
| SC-06           | Company Report       | Sales+        | Bản báo cáo có cấu trúc về 1 công ty + key persons               |
| SC-07           | Draft Inbox          | Sales+        | Danh sách draft theo trạng thái                                  |
| SC-08           | Draft Editor         | Sales+        | Chi tiết + chỉnh sửa draft trước approve                         |
| SC-09           | Template Library     | All / Admin   | Thư viện template chính thức + candidate                         |
| SC-10           | Industry Scenario    | Admin / CEO   | Quản lý kịch bản bán hàng theo ngành                             |
| SC-11           | Email History        | Sales+        | Lịch sử email đã gửi + trạng thái                                |
| SC-12           | Bounce Center        | Sales+        | Danh sách bounce, lý do, suppression                             |
| SC-13           | Settings — SMTP/IMAP | Admin         | Cấu hình mail                                                    |
| SC-14           | Settings — Telegram  | Admin         | Cấu hình bot, whitelist user                                     |
| SC-15           | Settings — API Keys  | Admin         | Quản lý key Apollo/Rapid/Hunter/Gemini/OpenAI                    |
| SC-16           | Users & Roles        | Admin         | Quản lý user nội bộ                                              |
| SC-17           | Audit Log            | Admin         | Audit log toàn hệ thống                                          |

## 15.4. SC-01 — Login

*Wireframe: SC-01 Login*

<table><tbody><tr class="odd"><td>┌──────────────────────────────────────────────┐<br />
│ │<br />
│ [VNETWORK Logo] │<br />
│ AI Sales Agent — P1 │<br />
│ │<br />
│ ┌──────────────────────────┐ │<br />
│ │ G Sign in with Google │ │<br />
│ └──────────────────────────┘ │<br />
│ │<br />
│ Chỉ tài khoản @vnetwork.vn được phép. │<br />
└──────────────────────────────────────────────┘</td></tr></tbody></table>

-   Chặn email không thuộc domain @vnetwork.vn.

-   Sau OAuth, BE cấp JWT (access 15 phút) + refresh token 30 ngày.

-   Nếu user lần đầu login: tạo bản ghi Users với role mặc định = Sales (cần Admin approve để dùng).

## 15.5. SC-02 — Dashboard

*Wireframe: SC-02 Dashboard*

<table><tbody><tr class="odd"><td>┌────────────────────────────────────────────────────────────────────────┐<br />
│ Tổng quan tuần này │<br />
├──────────────┬──────────────┬──────────────┬──────────────────────────┤<br />
│ Jobs hôm nay │ Drafts pending│ Sent today │ Bounce rate (7 ngày) │<br />
│ 12 │ 37 │ 94 │ 4.3% (mục tiêu &lt; 8%) │<br />
└──────────────┴──────────────┴──────────────┴──────────────────────────┘<br />
┌────────────────────────────────────────────────┬───────────────────────┐<br />
│ Biểu đồ Sent vs Reply (14 ngày) │ Top template hit rate │<br />
│ [chart line] │ 1. Fintech-CTO 82% │<br />
│ │ 2. Ecom-CMO 71% │<br />
│ │ 3. Gov-CIO 63% │<br />
└────────────────────────────────────────────────┴───────────────────────┘<br />
┌────────────────────────────────────────────────────────────────────────┐<br />
│ Hoạt động gần đây (drafts của tôi pending review trên Telegram) │<br />
│ • Acme Corp / Trần Văn A / CTO — chờ 12 phút │<br />
│ • BetaSoft / Lê Thị B / CEO — chờ 4 phút │<br />
│ • GammaPay / Phạm Văn C / VP Eng — chờ 1h (snooze tới 14:30) │<br />
└────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.6. SC-03 — New Search (Bước 1)

*Wireframe: SC-03 New Search*

<table><tbody><tr class="odd"><td>┌────────────────────────────────────────────────────────────────────────┐<br />
│ Tìm công ty mục tiêu │<br />
├────────────────────────────────────────────────────────────────────────┤<br />
│ Tên công ty * [ Acme Corporation ] │<br />
│ Region (tùy chọn) [ Vietnam ▼ ] │<br />
│ Ngành (tùy chọn) [ Fintech ▼ ] │<br />
│ Tag chiến dịch [ Q2-2026-VNFintech ] │<br />
│ │<br />
│ ☑ Tự động sinh draft email sau khi serialize xong │<br />
│ ☐ Gửi tôi Telegram khi report sẵn sàng │<br />
│ │<br />
│ [ Hủy ] [ Bắt đầu tìm 🚀 ] │<br />
└────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

-   Tên công ty: validate độ dài 2-128, không cho ký tự đặc biệt nguy hiểm.

-   Region: dropdown các giá trị enum (Vietnam, SEA, APAC, EU, US, Global).

-   Bấm "Bắt đầu tìm" → POST /searches → redirect sang SC-04 với jobId.

## 15.7. SC-04 — Search Job Detail (realtime)

*Wireframe: SC-04 Search Job Detail*

<table><tbody><tr class="odd"><td>┌────────────────────────────────────────────────────────────────────────┐<br />
│ Job #J-2026-0501 · Acme Corporation · region=VN · trạng thái RUNNING │<br />
├────────────────────────────────────────────────────────────────────────┤<br />
│ ⏱ Tiến trình adapter (song song) │<br />
│ ▸ Apollo ███████████████░░ 87% (24 contacts) │<br />
│ ▸ Rapid LinkedIn ██████████████████ 100% (DONE — 18 employees) │<br />
│ ▸ Hunter ████████░░░░░░░░░ 45% (verifying 12 emails) │<br />
│ ▸ Custom Crawler █████░░░░░░░░░░░ 30% (3 / 10 pages) │<br />
├────────────────────────────────────────────────────────────────────────┤<br />
│ Aggregator: chờ Apollo &amp; Hunter hoàn tất │<br />
│ AI Serialize: chưa bắt đầu │<br />
│ AI Compose: chưa bắt đầu │<br />
├────────────────────────────────────────────────────────────────────────┤<br />
│ Log realtime │<br />
│ 11:42:01 job.queued │<br />
│ 11:42:03 apollo.start q="Acme Corporation" loc=VN │<br />
│ 11:42:09 rapid.done 18 employees in 5.8s │<br />
│ ... │<br />
└────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

-   Realtime qua WebSocket; nếu đứt kết nối, fallback poll /searches/:id mỗi 5s.

-   Khi REPORT_READY → nút "Xem báo cáo" hiện.

-   Khi DRAFTS_READY → nút "Xem draft" hiện và toast notification.

## 15.8. SC-05 — Company List

*Wireframe: SC-05 Company List*

<table><tbody><tr class="odd"><td>┌───────────────────────────────────────────────────────────────────────────┐<br />
│ Công ty đã enrich · Bộ lọc: Ngành ▼ Region ▼ Owner ▼ Status ▼ │<br />
├───┬─────────────────┬───────────┬───────┬──────────┬─────────┬───────────┤<br />
│ ☐ │ Tên công ty │ Domain │ Region│ Ngành │ #Persons│ Trạng thái│<br />
├───┼─────────────────┼───────────┼───────┼──────────┼─────────┼───────────┤<br />
│ ☐ │ Acme Corp │ acme.vn │ VN │ Fintech │ 12 │ Drafts(8) │<br />
│ ☐ │ BetaSoft │ beta.io │ SEA │ Ecom │ 7 │ Sent(5) │<br />
│ ☐ │ GammaPay │ gpay.com │ VN │ Fintech │ 9 │ Bounce(1) │<br />
│ ... │<br />
├───────────────────────────────────────────────────────────────────────────┤<br />
│ [↻ Refresh] [⤓ Export CSV] [▶ Bulk generate drafts] │<br />
└───────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.9. SC-06 — Company Report (Bước 5)

*Wireframe: SC-06 Company Report*

<table><tbody><tr class="odd"><td>┌─────────────────────────────────────────────────────────────────────────┐<br />
│ Acme Corporation · acme.vn · Fintech · HQ Hà Nội │<br />
│ Tags: [Fintech][VN][Q2-2026] [⤓ PDF] [⤓ XLSX] [📩 Drafts]│<br />
├─────────────────────────────────────────────────────────────────────────┤<br />
│ ◤ Tổng quan công ty │<br />
│ Founded: 2014 · Size: 200-500 · Revenue: $10-50M · LinkedIn: /acme │<br />
│ About: Nền tảng thanh toán cho SME tại VN, hiện active 3 region… │<br />
│ Tin gần đây: │<br />
│ • Acme công bố vòng Series B 30M USD (vneconomy, 12/04/2026) │<br />
│ • Acme launch app v2 multi-currency (techinasia, 02/05/2026) │<br />
├─────────────────────────────────────────────────────────────────────────┤<br />
│ ◤ Key Persons (12) │<br />
│ ┌──┬───────────────┬───────────┬──────────────┬───────┬──────────┬────┐│<br />
│ │ │ Họ tên │ Chức danh │ Email │ Phone │ Conf. │ ▷ ││<br />
│ ├──┼───────────────┼───────────┼──────────────┼───────┼──────────┼────┤│<br />
│ │👤│ Trần Văn A │ CTO │ trana@…✅ │ +84… │ 0.92 │ … ││<br />
│ │👤│ Lê Thị B │ CMO │ leb@…✅ │ — │ 0.81 │ … ││<br />
│ │👤│ Phạm Văn C │ Head Eng │ phamc@…⚠️ │ — │ 0.55 │ … ││<br />
│ └──┴───────────────┴───────────┴──────────────┴───────┴──────────┴────┘│<br />
└─────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

-   Mỗi key person bấm "…" mở side panel với toàn bộ dữ liệu raw + nguồn.

-   Nút "📩 Drafts" gọi POST /companies/:id/drafts → tạo draft cho từng key person có email verified hoặc risky-with-confirm.

## 15.10. SC-07 — Draft Inbox

*Wireframe: SC-07 Draft Inbox*

<table><tbody><tr class="odd"><td>┌───────────────────────────────────────────────────────────────────────────┐<br />
│ Draft cần xử lý · Lọc: Status [Pending ▼] Owner [Tôi ▼] Industry ▼ │<br />
├──────┬──────────────┬───────────────────┬──────────────┬──────────┬──────┤<br />
│ ☐ │ Người nhận │ Công ty │ Subject │ Source │ ▷ │<br />
├──────┼──────────────┼───────────────────┼──────────────┼──────────┼──────┤<br />
│ ☐ ⏳ │ Trần Văn A │ Acme Corp (Fint.) │ VNETWORK CDN…│ template │ Mở │<br />
│ ☐ ⏳ │ Lê Thị B │ BetaSoft (Ecom) │ Tối ưu pic… │ scratch │ Mở │<br />
│ ... │<br />
├──────────────────────────────────────────────────────────────────────────┤<br />
│ [✅ Approve đã chọn] [✏️ Edit lần lượt] [❌ Reject đã chọn] │<br />
└──────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.11. SC-08 — Draft Editor

*Wireframe: SC-08 Draft Editor*

<table><tbody><tr class="odd"><td>┌─────────────────────────────────────────────────────────────────────────┐<br />
│ Draft #DR-2026-0517 · Trần Văn A (CTO) · Acme Corp · Fintech · vi-VN │<br />
├─────────────────────────────────────────────────────────────────────────┤<br />
│ Scenario chọn: "Fintech-CTO-CDN-Cost" (conf 0.86, lý do hiện ở panel) │<br />
├─────────────────────────────────────────────────────────────────────────┤<br />
│ Subject [VNETWORK CDN cho Acme — đề xuất tối ưu chi phí băng thông ]│<br />
│ ─────────────────────────────────────────────────────────────────────── │<br />
│ Body (rich editor) │<br />
│ ┌──────────────────────────────────────────────────────────────────┐ │<br />
│ │ Chào anh A, │ │<br />
│ │ Để ý Acme vừa launch app v2 trên 3 region, thường tải băng thông…│ │<br />
│ │ ... │ │<br />
│ └──────────────────────────────────────────────────────────────────┘ │<br />
│ Variables: {{first_name}} {{company}} {{news_hint}} {{tech_stack_hint}} │<br />
│ │<br />
│ [👁 Preview] [↺ Re-generate from scratch] [💾 Save] │<br />
│ [✅ Approve &amp; Send] [❌ Reject…] │<br />
└─────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

-   Editor dùng TipTap (rich-text), giữ semantic HTML, sanitize trước khi lưu.

-   Hiển thị diff khi user edit so với bản gốc của AI (giúp user tự kiểm).

-   Approve trên web app cũng đẩy event giống Telegram approve.

## 15.12. SC-09 — Template Library

*Wireframe: SC-09 Template Library*

<table><tbody><tr class="odd"><td>┌────────────────────────────────────────────────────────────────────────┐<br />
│ Templates · Tab: [Active] [Candidates] [Deprecated] │<br />
├────────────┬─────────┬─────────┬──────────┬──────────┬──────────┬─────┤<br />
│ Tên │ Industry│ Role │ Tone/Lang│ Hit rate │ Reply r. │ ▷ │<br />
├────────────┼─────────┼─────────┼──────────┼──────────┼──────────┼─────┤<br />
│ Fint-CTO-1 │ Fintech │ CTO │ formal/vi│ 82% │ 6.2% │ Mở │<br />
│ Ecom-CMO-1 │ Ecom │ CMO │ formal/vi│ 71% │ 4.8% │ Mở │<br />
│ Gov-CIO-1 │ Gov │ CIO │ formal/vi│ 63% │ 3.1% │ Mở │<br />
│ ... │<br />
├────────────────────────────────────────────────────────────────────────┤<br />
│ Candidates (chờ Admin promote) │<br />
│ • Logistics-COO (3 candidate, sim 0.91) [Promote] [Discard] │<br />
└────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.13. SC-10 — Industry Scenario

*Wireframe: SC-10 Industry Scenario*

<table><tbody><tr class="odd"><td>┌─────────────────────────────────────────────────────────────────────────┐<br />
│ Scenario: "Fintech-CTO-CDN-Cost" [Save] [Duplicate] [Delete]│<br />
├─────────────────────────────────────────────────────────────────────────┤<br />
│ Industry [Fintech ▼] Role level [CTO ▼] Region focus [VN ▼] │<br />
│ Pain point chính: │<br />
│ [Băng thông và rủi ro DDoS app fintech khi user mobile growth nhanh ] │<br />
│ Value proposition: │<br />
│ [VNETWORK CDN giảm 30-50% cost băng thông qua edge cache + AntiDDoS] │<br />
│ Case study tham chiếu: │<br />
│ [SmartPay 2025: 42% bandwidth saving sau 3 tháng] │<br />
│ CTA mềm: │<br />
│ [Chào anh A, em xin 15p tuần sau ạ?] │<br />
└─────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.14. SC-11 — Email History

*Wireframe: SC-11 Email History*

<table><tbody><tr class="odd"><td>┌────────────────────────────────────────────────────────────────────────┐<br />
│ Email History · Lọc: ngày, sender, recipient domain, status │<br />
├──────────┬──────────────┬───────────────┬─────────┬──────────┬─────────┤<br />
│ Sent at │ Recipient │ Subject │ Status │ Bounce? │ Detail │<br />
├──────────┼──────────────┼───────────────┼─────────┼──────────┼─────────┤<br />
│ 07/05 11:42 │ trana@acme.vn │ VNETWORK CDN…│ DELIVERED│ — │ Mở │<br />
│ 07/05 11:43 │ leb@beta.io │ Tối ưu pic… │ BOUNCED │ hard │ Mở │<br />
│ ... │<br />
└────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.15. SC-12 — Bounce Center

*Wireframe: SC-12 Bounce Center*

<table><tbody><tr class="odd"><td>┌─────────────────────────────────────────────────────────────────────────┐<br />
│ Bounce Center │<br />
├──────────┬──────────────┬─────────────────┬──────────┬─────────┬───────┤<br />
│ Recv at │ Recipient │ Reason │ Type │ Suppress│ Action│<br />
├──────────┼──────────────┼─────────────────┼──────────┼─────────┼───────┤<br />
│ 11:43 │ leb@beta.io │ 550 mailbox not │ hard │ ✅ 30d │ View │<br />
│ 11:55 │ phamc@gpay │ 552 over quota │ soft (3) │ ❌ │ View │<br />
│ ... │<br />
├─────────────────────────────────────────────────────────────────────────┤<br />
│ Suppression list · [⤓ Export] [➕ Add manual] │<br />
└─────────────────────────────────────────────────────────────────────────┘</td></tr></tbody></table>

## 15.16. SC-13 đến SC-17 — Settings, Users, Audit

Các màn hình còn lại tuân theo chuẩn form đơn giản. Yêu cầu chính:

-   SC-13 SMTP/IMAP: form input host/port/auth + test button (gửi mail tự gửi cho mình hoặc connect IMAP thử). Hiển thị status xanh/đỏ.

-   SC-14 Telegram: dán bot token, nhập domain webhook, danh sách user whitelist (tg_user_id + tên hiển thị + role).

-   SC-15 API Keys: bảng provider (Apollo/Rapid/Hunter/Gemini/OpenAI), giá trị mask, nút Update + Test connection. Hiển thị usage gần nhất.

-   SC-16 Users & Roles: bảng user (email, role, status, last login). Action enable/disable, đổi role, reset session.

-   SC-17 Audit Log: filter user/action/time. Export CSV. Mỗi dòng: timestamp, actor, action, target, before/after JSON, ip, user_agent.

## 15.17. Yêu cầu chung Frontend

-   Responsive từ 1280px trở lên (desktop-first). Mobile chỉ hỗ trợ Telegram Mini App ở SC-08 view.

-   Accessibility: tuân WCAG 2.1 AA tối thiểu (contrast, focus visible, aria-label cho icon button).

-   Mọi action có loading state, optimistic UI cho approve/reject.

-   Error toast hiển thị errorCode để dễ debug, kèm "Sao chép trace ID".

-   Telegram Mini App reuse SC-08 với layout 1 cột, dùng theme tối tự động theo Telegram.

# 16. Telegram Mini App

Để Sales/CEO duyệt nhanh ngay trên di động, hệ thống mở Telegram Mini App (Webview) khi bấm "View full".

-   URL: https://{domain}/tma/draft/{id}?initData={signed_init}

-   Auth: validate initData theo HMAC SHA256 với bot token (Telegram chuẩn).

-   Layout 1 cột: header (recipient + scenario) → body draft → footer 3 nút Approve/Edit/Reject.

-   Edit mở textarea full-screen, save → quay lại trạng thái review.

-   Nếu kết nối yếu, hỗ trợ offline cache draft 24h.

# 17. Data Model

## 17.1. Sơ đồ ER (logical)

<table><tbody><tr class="odd"><td>users ─&lt; search_jobs ─&lt; companies ─&lt; key_persons ─&lt; drafts ─&lt; draft_review_logs<br />
│ │<br />
│ └─&lt; email_history ─&lt; bounces<br />
│<br />
└─&lt; raw_dumps (object storage path)<br />
<br />
scenarios ─&lt; draft_compositions<br />
templates ─&lt; template_candidates<br />
template_metrics<br />
ai_calls (audit)<br />
audit_logs<br />
settings (kv)<br />
suppression_emails</td></tr></tbody></table>

## 17.2. Bảng chính (lược)

| Bảng             | Trường chính                                                                                                                                                                                                          | Mô tả                                                                                                                                                                                                                           |
| --- | --- | --- |
| users                | id, email, full_name, role, status, last_login_at                                                                                                                                                                      | User nội bộ                                                                                                                                                                                                                         |
| search_jobs         | id, owner_user_id, company_input, region, industry_hint, status, created_at, finished_at, error_code                                                                                                               | Một lần tìm kiếm                                                                                                                                                                                                                    |
| companies            | id, search_job_id, name, primary_domain, industry, sub_industry, region, headcount_range, revenue_range, founded_year, linkedin_url, about, recent_news_json, confidence                                        | Bản ghi công ty đã enrich                                                                                                                                                                                                           |
| key_persons         | id, company_id, full_name, title, role_level, email, email_status, email_score, mobile, linkedin_url, confidence, sources_json                                                                                     | Key person                                                                                                                                                                                                                          |
| raw_dumps           | id, search_job_id, source, object_storage_path, content_type, byte_size                                                                                                                                             | Raw HTML/JSON từ adapter                                                                                                                                                                                                            |
| scenarios            | id, name, industry, role_level, region, pain_point, value_prop, case_study, cta, language, tone, status                                                                                                               | Industry scenario                                                                                                                                                                                                                   |
| templates            | id, name, industry, role_level, language, tone, body_html, version, status, created_from_draft_id, embedding(vector)                                                                                                 | Template chính thức                                                                                                                                                                                                                 |
| template_candidates | id, draft_id, industry, role_level, language, tone, body_html, embedding, created_at                                                                                                                                  | Candidate chờ promote                                                                                                                                                                                                               |
| template_metrics    | template_id, send_count, approved_as_is_count, edit_count, reply_count, bounce_count, updated_at                                                                                                                 | Metric template                                                                                                                                                                                                                     |
| drafts               | id, company_id, key_person_id, owner_user_id, scenario_id, template_id, compose_mode, subject, body_html, body_text, status, approved_as_is, edit_count, created_at, approved_at, sent_at, reject_reason | Nháp email                                                                                                                                                                                                                          |
| draft_review_logs  | id, draft_id, actor_user_id, channel(web|telegram), action, before_json, after_json, created_at                                                                                                                    | Audit review draft                                                                                                                                                                                                                  |
| email_history       | id, draft_id, sender, intended_recipient, actual_recipient, redirected, subject, body_html_snapshot, message_id, status, sent_at, delivered_at                                                                    | Lịch sử gửi (P1: intended_recipient = recipient gốc theo prospect; actual_recipient = nơi mail thật sự đi tới — trong P1 luôn = tandtnt18@gmail.com khi enable_external_send = false; redirected = true khi 2 trường khác nhau) |
| bounces              | id, email_history_id, type(hard|soft|spam|quota), reason_code, raw_dsn_path, received_at                                                                                                                         | Bounce log                                                                                                                                                                                                                          |
| suppression_emails  | email, reason, expires_at, source                                                                                                                                                                                        | Email bị chặn                                                                                                                                                                                                                       |
| ai_calls            | id, task(serialize|pick|compose), provider, model, prompt_hash, tokens_in, tokens_out, cost_usd, latency_ms, success, created_at                                                                                  | Audit AI                                                                                                                                                                                                                            |
| settings             | key, value_json, updated_by, updated_at                                                                                                                                                                                | Cấu hình hệ thống                                                                                                                                                                                                                   |
| audit_logs          | id, actor_user_id, action, target_type, target_id, before_json, after_json, ip, ua, created_at                                                                                                                     | Audit toàn cục                                                                                                                                                                                                                      |

## 17.3. Index quan trọng

-   companies(primary_domain), key_persons(email), key_persons(company_id, role_level).

-   drafts(status, owner_user_id, created_at desc), drafts(key_person_id).

-   email_history(message_id), email_history(recipient, sent_at desc).

-   templates HNSW index trên cột embedding (pgvector) cho semantic match.

-   audit_logs(created_at desc, actor_user_id).

# 18. Yêu cầu phi chức năng

## 18.1. Hiệu năng

-   API GET trung bình &lt; 250ms P95.

-   Search job end-to-end (4 adapter + serialize + compose 5 person) ≤ 5 phút P95.

-   WebSocket push log job: latency từ event → client &lt; 1s.

-   Telegram approve → email gửi đi: &lt; 10s P95.

## 18.2. Khả năng chịu tải

-   ≥ 50 search job song song, ≥ 200 draft pending review.

-   ≥ 2.000 email gửi/ngày trong P1, vẫn còn dư khi P2/P3 thêm kênh.

## 18.3. Bảo mật

-   Xác thực Google OAuth nội bộ + JWT, refresh token rotation.

-   RBAC bắt buộc cho mọi endpoint (xem 19.6).

-   Mọi traffic HTTPS TLS 1.2+; HSTS bật.

-   Secrets lưu Vault, không hard-code; rotate API key mỗi 90 ngày.

-   Audit log không thể xóa qua UI; chỉ rotate sau 1 năm vào cold storage.

-   PII (email key person) encrypt at rest column-level cho cột email khi không phục vụ truy vấn.

-   Tuân Nghị định 13/2023/NĐ-CP về dữ liệu cá nhân: cho phép xóa theo yêu cầu, nhật ký truy cập.

## 18.4. Độ tin cậy

-   Uptime ≥ 99.5% trong giờ làm việc.

-   Mỗi worker có healthcheck; orchestrator restart tự động.

-   Backup PostgreSQL daily; PITR 7 ngày; restore drill quarterly.

-   DLQ phải có rule alert Telegram khi length &gt; 10.

## 18.5. Quan sát (Observability)

-   Log structured (Pino) với traceId xuyên suốt request.

-   Metrics Prometheus: queue length, AI cost, bounce rate, send throughput.

-   Tracing OpenTelemetry; xem trên Grafana Tempo.

## 18.6. Dễ vận hành

-   Một lệnh make up dựng full stack local.

-   Migration DB version-controlled bằng node-pg-migrate (file SQL/JS thuần trong libs/migrations/); mỗi PR có schema diff review; rollback bằng lệnh migrate down.

-   Feature flag để bật/tắt từng adapter, từng provider AI.

# 19. Business Rules and Acceptance Criteria (BRAC)

Mỗi rule dưới đây là điều kiện bắt buộc để hệ thống được nghiệm thu Phase 1. BRAC dùng làm checklist UAT chung giữa team Dev, CEO và Head Solution.

## 19.1. BR — Input và Search

| Mã | Quy tắc                                                                               | Acceptance Criteria                                                                                          |
| --- | --- | --- |
| BR-01  | Input bắt buộc tên công ty (2-128 ký tự); region và industry tùy chọn.                    | Tạo job thiếu tên → 400 BadRequest; tạo job có tên hợp lệ → tạo SearchJob status QUEUED.                         |
| BR-02  | 4 adapter chạy song song; nếu ≥ 1 adapter trả ≥ 1 key person hợp lệ thì job vẫn tiếp tục. | Trong môi trường test, force fail Apollo và Hunter, job vẫn tới REPORT_READY nếu Rapid hoặc Crawler trả person. |
| BR-03  | Mỗi adapter có timeout 30s; quá → adapter trả error nhưng không block adapter khác.       | Mock adapter chậm 60s → adapter đó marked failed, các adapter khác vẫn done.                                     |
| BR-04  | Không gửi truy vấn trùng trong 24h cho cùng (company, region) — phải dùng cache.          | Tạo job 2 lần liên tiếp cùng input → lần 2 hit cache, đo latency &lt; 1s, không gọi provider.                    |
| BR-05  | Email công cộng (info@, sales@, contact@…) không tính là key person.                      | Trong report, không xuất hiện person với email kiểu generic.                                                     |

## 19.2. BR — AI và Compose

| Mã | Quy tắc                                                         | Acceptance Criteria                                                                                  |
| --- | --- | --- |
| BR-06  | Output serialize phải pass JSON schema CompanyReport.               | Force AI trả JSON sai schema → retry; sau 3 lần → job FAILED với error_code AI_SCHEMA_INVALID.        |
| BR-07  | Không bịa email; nếu không suy luận được, để null.                  | Trong test, đưa raw không có email → output null, không có chuỗi giả mạo.                                |
| BR-08  | Compose dùng template chính thức nếu có, ngược lại sinh từ scratch. | Tạo prospect ngành Fintech, role CTO khi đã có template Active → draft.compose_mode = 'from_template'. |
| BR-09  | Subject ≤ 80 ký tự, body 90-160 từ; không chứa từ cấm.              | Validator chạy sau compose; vi phạm → reject draft và regenerate 1 lần.                                  |
| BR-10  | AI Gateway log mọi request: provider, tokens, cost.                 | Bảng ai_calls có record mới sau mỗi serialize/compose.                                                  |

## 19.3. BR — Telegram Review

| Mã | Quy tắc                                                                                                               | Acceptance Criteria                                                                                             |
| --- | --- | --- |
| BR-11  | Hệ thống KHÔNG được tự gửi email khi chưa có Approve.                                                                     | Tạo draft mới → trạng thái PENDING_REVIEW; không có record nào trong email_history cho draft này tới khi Approve. |
| BR-12  | Chỉ user trong whitelist Telegram mới có quyền Approve.                                                                   | User ngoài whitelist click Approve → bot trả lỗi và log security_violation.                                        |
| BR-13  | Approve & Send mà không edit → đánh dấu approved_as_is = true.                                                          | Edit dù 1 ký tự → approved_as_is = false; ghi vào draft_review_logs.                                            |
| BR-14  | Edit phải đi qua trang web (không edit trực tiếp Telegram chat).                                                          | Bấm Edit → bot gửi link Mini App; không cho gõ thẳng nội dung mới vào chat.                                         |
| BR-15  | Reject phải có lý do (text), lưu vào reject_reason.                                                                      | Reject không lý do → bot hỏi lại.                                                                                   |
| BR-16  | Snooze 1h chỉ áp dụng được tối đa 3 lần/draft, sau đó draft auto chuyển PENDING_OWNER_ESCALATION và ping Head Solution. | Snooze lần 4 → bị từ chối, alert HOS.                                                                               |

## 19.4. BR — Email và Bounce

| Mã | Quy tắc                                                                                                                               | Acceptance Criteria                                                                                                                      |
| --- | --- | --- |
| BR-17  | Mỗi sender ≤ 60 mail/giờ và ≤ 300 mail/ngày.                                                                                              | Bắn 100 mail trong 1 giờ → throttle, mail vượt được delay đến giờ tiếp theo.                                                                 |
| BR-18  | Trước khi gửi, kiểm tra suppression list theo recipient.                                                                                  | Recipient trong suppression → block, ghi log block_reason = 'SUPPRESSED'.                                                                   |
| BR-19  | Mỗi mail gửi đi phải có header X-VN-Draft-Id, X-VN-Intended-Recipient, X-VN-Phase và List-Unsubscribe.                                    | Inspect mail outbound bằng test SMTP → đầy đủ 4 header trên.                                                                                 |
| BR-20  | Bounce hard → đánh dấu prospect.email_status = INVALID; suppression 30 ngày.                                                             | Trigger DSN 550 → trạng thái cập nhật, prospect không nhận mail mới trong 30 ngày.                                                           |
| BR-21  | Bounce hard → bot Telegram alert HOS trong &lt; 5 phút từ DSN.                                                                            | Mock DSN ở 11:00 → tin nhắn alert đến 11:05 muộn nhất.                                                                                       |
| BR-21A | Toàn bộ Phase 1: enable_external_send = false; mọi email đã approve được redirect tới outbound_redirect_target = tandtnt18@gmail.com. | Approve 5 draft với recipient @acme.vn / @beta.io / @gpay.com → cả 5 mail rơi vào tandtnt18@gmail.com; KHÔNG có mail nào tới các domain gốc. |
| BR-21B | Email outbound trong P1 phải có banner 'P1 demo' đầu body và prefix subject [P1-DEMO → original-recipient].                             | Inspect mail trong tandtnt18@gmail.com: subject có prefix; body có banner màu vàng.                                                          |
| BR-21C | SMTP Sender từ chối mọi recipient không thuộc allowlist domain (gmail.com, vnetwork.vn) trong P1, kể cả khi code chỗ khác lỗi.            | Force draft.recipient = test@bad.com với enable_external_send = false → reject + log security_violation; mail KHÔNG được gửi.             |
| BR-21D | Bảng email_history vẫn lưu trường intended_recipient (gốc) và actual_recipient (sau redirect).                                         | Query DB: cả 2 trường đều có giá trị; intended ≠ actual khi cờ off.                                                                          |

## 19.5. BR — Template Learning

| Mã | Quy tắc                                                                     | Acceptance Criteria                                                           |
| --- | --- | --- |
| BR-22  | Chỉ candidate đến từ draft approved_as_is mới được lưu.                       | Draft edit rồi approve → không có record candidate.                               |
| BR-23  | Promote thành template khi có ≥ 3 candidate cùng key trong 30 ngày, sim ≥ 0.85. | Tạo 3 draft fintech-CTO approved_as_is → cron promote, Sales Admin nhận notify. |
| BR-24  | Template không tự active — phải Sales Admin xác nhận.                           | Promote → status PENDING_ADMIN_REVIEW; Active sau khi Admin click.              |
| BR-25  | Template có edit_rate &gt; 50% trong 30 ngày → cảnh báo Admin.                 | Trong test, force edit_rate vượt ngưỡng → notify hiện ở dashboard Admin.         |

## 19.6. BR — RBAC

| Mã | Quy tắc                                              | Acceptance Criteria                                          |
| --- | --- | --- |
| BR-26  | Sales chỉ thấy job/draft của mình trừ khi HOS gán quyền. | User Sales gọi GET /searches?owner=other → 403 hoặc filter rỗng. |
| BR-27  | CEO có quyền view + approve mọi draft.                   | User CEO truy cập draft của Sales bất kỳ → 200.                  |
| BR-28  | Chỉ Admin được sửa template/scenario/api key.            | User Sales gọi PATCH /templates/:id → 403.                       |
| BR-29  | Audit log phải ghi mọi thay đổi quyền và config.         | Admin update API key → record audit_logs với before/after mask. |

## 19.7. BR — Compliance

| Mã | Quy tắc                                                                      | Acceptance Criteria                                                            |
| --- | --- | --- |
| BR-30  | Tôn trọng robots.txt khi crawl.                                                  | Test với site có disallow → crawler skip, log respect_robots = true.              |
| BR-31  | Email outbound phải có cách unsubscribe (link/footer + List-Unsubscribe header). | Inspect email rendered → footer chứa link unsubscribe; header có List-Unsubscribe. |
| BR-32  | Người nhận trả "unsubscribe" / "bỏ đăng ký" → tự động đưa vào suppression.       | Reply chứa từ khóa → cron parser thêm vào suppression.                             |
| BR-33  | Lưu trữ tối đa 24 tháng cho dữ liệu prospect; xoá theo yêu cầu.                  | API DELETE /companies/:id chạy hard delete + xoá raw dump trong 7 ngày.            |

# 20. Roadmap Phase 2 (LinkedIn) và Phase 3 (Zalo)

## 20.1. Phase 2 — LinkedIn outreach

-   Tái sử dụng nguyên Search Layer + AI Layer + Telegram Review của P1.

-   Thêm "LinkedIn Sender" chuyên gửi connection request + DM/InMail.

-   Account warmup: Sales Admin kết nối LinkedIn cá nhân qua OAuth (LinkedIn Sales Navigator API hoặc giải pháp 3rd-party đã được pháp lý duyệt).

-   Throttle nghiêm ngặt: ≤ 20 request connect/ngày/account, ≤ 80 message/ngày/account.

-   Bounce tương đương = "InMail credit refunded" hoặc "Profile no longer exists" → Telegram alert.

-   Template Learning chia theo channel = LinkedIn (template ngắn hơn 50-90 từ).

## 20.2. Phase 3 — Zalo outreach

-   Tích hợp Zalo OA + Zalo Notification Service (ZNS).

-   Yêu cầu khách hàng có quan tâm OA hoặc đã có template ZNS được Zalo duyệt.

-   Áp dụng cho phân khúc khách hàng Việt Nam, ưu tiên SME và shop online.

-   Re-use Composer nhưng giới hạn template Zalo theo format ZNS (≤ 500 ký tự, biến đặt sẵn).

-   Bounce = ZNS callback fail → Telegram alert.

## 20.3. Sự độc lập của lõi P1

Toàn bộ thiết kế tầng Search/AI/Telegram/Template Learning đều được trừu tượng theo channel. Khi chuyển sang P2/P3, chỉ thêm ChannelSender mới, không sửa core. Bảng drafts có cột channel (default 'email') để mở rộng.

# 21. Rủi ro và biện pháp giảm thiểu

| Rủi ro                                  | Mức      | Biện pháp                                                                                   |
| --- | --- | --- |
| Apollo / Rapid quota cạn giữa peak          | Cao          | Cache 24h theo (company, region); cảnh báo 80% quota; có nhà cung cấp dự phòng (ZoomInfo/Lusha) |
| Domain gửi mail bị blacklist                | Cao          | Throttle nghiêm; warmup; theo dõi reputation Postmark; rotate sub-domain (sales1, sales2)       |
| AI provider down hoặc tăng giá đột ngột     | Trung        | Dual-provider sẵn; failover tự động; monitor cost daily                                         |
| Sai dữ liệu key person → gửi nhầm tên/title | Cao          | Quy tắc confidence &lt; 0.6 thì draft bị block tự gửi, phải edit thủ công                       |
| Telegram bot bị spam tin nhắn approve giả   | Trung        | Whitelist tg_user_id + verify HMAC initData cho Mini App                                      |
| Người dùng nội bộ approve nhầm hàng loạt    | Trung        | Cấm bulk approve &gt; 10 không có 2FA; lưu audit                                                |
| Vi phạm điều khoản LinkedIn khi crawl       | Cao (cho P2) | P1 chỉ qua Apollo + RapidAPI hợp pháp; P2 dùng API LinkedIn được phép                           |
| Lộ thông tin liên hệ key person             | Trung        | Encrypt at rest cho cột email; ACL nghiêm ngặt; audit truy cập                                  |

# 22. Phụ lục

## 22.1. JSON Schema CompanyReport (tóm lược)

<table><tbody><tr class="odd"><td>{<br />
"$schema": "https://json-schema.org/draft-07/schema#",<br />
"type": "object",<br />
"required": ["company", "key_persons"],<br />
"properties": {<br />
"company": {<br />
"type": "object",<br />
"required": ["name", "primary_domain", "industry"],<br />
"properties": {<br />
"name": { "type": "string" },<br />
"primary_domain": { "type": "string" },<br />
"industry": { "type": "string" },<br />
"sub_industry": { "type": ["string", "null"] },<br />
"region": { "type": "string" },<br />
"headcount_range": { "type": ["string", "null"] },<br />
"revenue_range": { "type": ["string", "null"] },<br />
"founded_year": { "type": ["integer", "null"] },<br />
"linkedin_url": { "type": ["string", "null"] },<br />
"about": { "type": ["string", "null"] },<br />
"recent_news": {<br />
"type": "array",<br />
"items": {<br />
"type": "object",<br />
"required": ["title", "url", "published_at"],<br />
"properties": {<br />
"title": { "type": "string" },<br />
"url": { "type": "string" },<br />
"published_at": { "type": "string", "format": "date" }<br />
}<br />
}<br />
}<br />
}<br />
},<br />
"key_persons": {<br />
"type": "array",<br />
"items": {<br />
"type": "object",<br />
"required": ["full_name", "title"],<br />
"properties": {<br />
"full_name": { "type": "string" },<br />
"title": { "type": "string" },<br />
"role_level": { "enum": ["C-LEVEL", "VP", "DIRECTOR", "MANAGER", "OTHER"] },<br />
"email": { "type": ["string", "null"], "format": "email" },<br />
"email_status": { "enum": ["verified", "risky", "unknown", null] },<br />
"email_score": { "type": ["number", "null"] },<br />
"mobile": { "type": ["string", "null"] },<br />
"linkedin_url": { "type": ["string", "null"] },<br />
"confidence": { "type": "number", "minimum": 0, "maximum": 1 },<br />
"sources": {<br />
"type": "array",<br />
"items": { "enum": ["apollo", "rapid", "hunter", "crawler"] }<br />
}<br />
}<br />
}<br />
}<br />
}<br />
}</td></tr></tbody></table>

## 22.2. Mẫu prompt compose (tiếng Việt formal cho CTO Fintech)

<table><tbody><tr class="odd"><td>SYSTEM:<br />
Bạn là Account Executive của VNETWORK. Soạn 1 email outreach lần đầu<br />
gửi cho key person dựa trên scenario và dữ liệu cá nhân hóa.<br />
<br />
USER:<br />
Scenario:<br />
Pain: Băng thông và DDoS app fintech khi mobile growth nhanh<br />
Value: VNETWORK CDN giảm 30-50% cost băng thông, kèm AntiDDoS<br />
Case: SmartPay 2025 — 42% bandwidth saving<br />
CTA: Xin 15 phút tuần sau<br />
<br />
Recipient:<br />
full_name: "Trần Văn A"<br />
title: "Chief Technology Officer"<br />
company: "Acme Corporation"<br />
industry: "Fintech"<br />
recent_news_hint: "Acme vừa launch app v2 multi-region"<br />
tech_stack_hint: "Next.js + AWS CloudFront"<br />
<br />
Yêu cầu:<br />
- Tiếng Việt formal<br />
- Subject ≤ 80 ký tự<br />
- 90–160 từ<br />
- Cá nhân hóa rõ<br />
- JSON {subject, body_html, body_text, variables_used}</td></tr></tbody></table>

## 22.3. Sample SMTP headers

<table><tbody><tr class="odd"><td>From: An Nguyễn &lt;an@vnetwork.vn&gt;<br />
To: Trần Văn A &lt;trana@acme.vn&gt;<br />
Subject: VNETWORK CDN cho Acme — đề xuất tối ưu chi phí băng thông<br />
Reply-To: an@vnetwork.vn<br />
Message-ID: &lt;DR-2026-0517@mail.vnetwork.vn&gt;<br />
X-VN-Draft-Id: DR-2026-0517<br />
List-Unsubscribe: &lt;mailto:unsubscribe@vnetwork.vn?subject=unsub-DR-2026-0517&gt;,<br />
&lt;https://sales.vnetwork.vn/u/DR-2026-0517&gt;<br />
List-Unsubscribe-Post: List-Unsubscribe=One-Click<br />
DKIM-Signature: v=1; a=rsa-sha256; d=vnetwork.vn; ...</td></tr></tbody></table>

## 22.4. Telegram payload mẫu (sendMessage với inline keyboard)

<table><tbody><tr class="odd"><td>POST https://api.telegram.org/bot&lt;token&gt;/sendMessage<br />
{<br />
"chat_id": 123456789,<br />
"parse_mode": "Markdown",<br />
"text": "📩 *Draft mới — Acme Corp (Fintech)*\n*Người nhận:* Trần Văn A (CTO)\n*Subject:* VNETWORK CDN cho Acme — đề xuất tối ưu chi phí băng thông\n\nMở đầu: Chào anh A, để ý Acme vừa launch app v2 trên 3 region…",<br />
"reply_markup": {<br />
"inline_keyboard": [[<br />
{ "text": "View full", "web_app": { "url": "https://sales.vnetwork.vn/tma/draft/DR-2026-0517" } },<br />
{ "text": "✅ Approve &amp; Send", "callback_data": "approve:DR-2026-0517" }<br />
],[<br />
{ "text": "✏️ Edit", "web_app": { "url": "https://sales.vnetwork.vn/tma/edit/DR-2026-0517" } },<br />
{ "text": "❌ Reject", "callback_data": "reject:DR-2026-0517" },<br />
{ "text": "🕒 Snooze 1h", "callback_data": "snooze:DR-2026-0517:1h" }<br />
]]<br />
}<br />
}</td></tr></tbody></table>

## 22.5. Definition of Done — Phase 1

-   Tất cả BR-01…BR-33 pass UAT có ký nhận của CEO và Head Solution.

-   Hoạt động end-to-end demo: nhập "Acme Corporation" → có report → có draft → CEO/Sales approve trên Telegram → mail đến hộp thư test → ghi history → simulate bounce → alert Telegram.

-   Documentation: README cho dev, runbook ops (rotate key, recover DLQ), playbook cho Sales Admin.

-   Monitoring dashboard Grafana có đủ KPI-01..KPI-08.

-   Backup PostgreSQL daily + restore drill thành công 1 lần trên STG.

*— Hết tài liệu —*