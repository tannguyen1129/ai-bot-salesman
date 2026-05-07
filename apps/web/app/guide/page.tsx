export default function GuidePage() {
  return (
    <main className="page">
      <div className="container">
        <section className="hero compactHero">
          <div>
            <h1>Playbook Vận Hành P1</h1>
            <p>Hướng dẫn ngắn gọn để chạy đúng flow P1 Approved mà không bị nhiễu nghiệp vụ cũ.</p>
          </div>
        </section>

        <section className="guideGrid">
          <article className="panel">
            <h3>1. Chuẩn bị môi trường</h3>
            <ul>
              <li>Khởi động PostgreSQL, Redis, API, Worker.</li>
              <li>Kiểm tra endpoint `/health` trả `status: ok`.</li>
              <li>Xác nhận `.env` có đầy đủ biến cho RapidAPI/Hunter/Google Sheets.</li>
            </ul>
          </article>

          <article className="panel">
            <h3>2. Tạo Search Job</h3>
            <ul>
              <li>Vào Workspace, nhập tên công ty (bắt buộc), region và industry (tùy chọn).</li>
              <li>Gửi `POST /p1/search-jobs` để tạo job trạng thái `queued`.</li>
              <li>Worker tự xử lý theo chuỗi company profile -&gt; key person bất đồng bộ.</li>
            </ul>
          </article>

          <article className="panel">
            <h3>3. Theo dõi và xử lý lỗi</h3>
            <ul>
              <li>
                Theo dõi trạng thái <code>queued -&gt; running -&gt; completed/failed</code>.
              </li>
              <li>
                Nếu <code>failed</code>, dùng <code>POST /p1/search-jobs/:id/retry</code>.
              </li>
              <li>
                Kiểm tra <code>error_message</code> và audit log để xác định nguyên nhân.
              </li>
            </ul>
          </article>

          <article className="panel">
            <h3>4. Duyệt Prospect</h3>
            <ul>
              <li>Lọc prospects theo job, trạng thái hoặc từ khóa.</li>
              <li>Cập nhật trạng thái qua `PATCH /p1/prospects/:id/status`.</li>
              <li>Ưu tiên prospect có email hợp lệ trước khi vào sprint email.</li>
            </ul>
          </article>
        </section>

        <section className="panel apiMap">
          <h3>API P1 Đang Vận Hành</h3>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Nhóm</th>
                  <th>Endpoint</th>
                  <th>Mục đích</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Search Jobs</td>
                  <td>`POST /p1/search-jobs`, `GET /p1/search-jobs`</td>
                  <td>Tạo job và xem danh sách jobs</td>
                </tr>
                <tr>
                  <td>Job Detail</td>
                  <td>`GET /p1/search-jobs/:id`, `POST /p1/search-jobs/:id/retry`</td>
                  <td>Xem chi tiết và retry khi job fail</td>
                </tr>
                <tr>
                  <td>Prospects</td>
                  <td>`GET /p1/prospects`, `PATCH /p1/prospects/:id/status`</td>
                  <td>Duyệt danh sách prospect và cập nhật trạng thái vận hành</td>
                </tr>
                <tr>
                  <td>Draft Review</td>
                  <td>`POST /p1/prospects/:id/generate-draft`, `GET /p1/drafts`, `POST /p1/drafts/:id/review`</td>
                  <td>Sinh nháp, duyệt thủ công (approve/reject/edit), đẩy queue gửi safe mode</td>
                </tr>
                <tr>
                  <td>Safe Mode</td>
                  <td>`GET /p1/email-safe-mode`, `POST /p1/email-safe-mode/preview`</td>
                  <td>Kiểm tra cấu hình redirect P1 và preview subject/body/header trước khi gửi</td>
                </tr>
                <tr>
                  <td>Health</td>
                  <td>`GET /health`</td>
                  <td>Kiểm tra nhanh tình trạng API</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="quickPanel">
          <h3>Định hướng đúng tài liệu P1</h3>
          <ul>
            <li>PostgreSQL là nguồn dữ liệu chính.</li>
            <li>Google Sheets chỉ là lớp đồng bộ vận hành.</li>
            <li>Không dùng dữ liệu mock ở production.</li>
            <li>Không gửi email trong P1 nếu prospect thiếu email hợp lệ.</li>
            <li>P1 bật Safe Mode: mặc định redirect toàn bộ email về inbox demo và gắn header audit.</li>
          </ul>
        </section>

        <section className="landingActions">
          <a className="ctaBtn" href="/workspace">
            Vào Workspace P1
          </a>
          <a className="ghostBtn" href="/system-check">
            Kiểm tra kết nối API
          </a>
        </section>
      </div>
    </main>
  );
}
