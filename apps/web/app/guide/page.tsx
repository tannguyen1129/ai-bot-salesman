export default function GuidePage() {
  return (
    <main className="page">
      <div className="container">
        <section className="hero compactHero">
          <div>
            <p className="eyebrow">Playbook</p>
            <h1>Hướng dẫn vận hành chuẩn P1</h1>
            <p>Checklist và chuẩn tác nghiệp để toàn team chạy đúng workflow product trong môi trường nội bộ.</p>
          </div>
        </section>

        <section className="guideGrid">
          <article className="panel">
            <h3>1. Chuẩn bị hệ thống</h3>
            <ul>
              <li>Khởi động PostgreSQL, Redis, API và Worker trước khi mở frontend.</li>
              <li>Kiểm tra `GET /health` trả `status: ok`.</li>
              <li>Xác nhận đầy đủ biến môi trường cho Apollo, Rapid, Hunter, OpenAI.</li>
            </ul>
          </article>

          <article className="panel">
            <h3>2. Chạy luồng chính</h3>
            <ul>
              <li>Vào Workspace, nhập tên công ty và tạo search job.</li>
              <li>Chọn job hoàn tất để lọc prospect có chất lượng tốt.</li>
              <li>Generate report AI rồi lưu DB để dùng cho bước outreach.</li>
            </ul>
          </article>

          <article className="panel">
            <h3>3. Xử lý lỗi vận hành</h3>
            <ul>
              <li>Theo dõi job status theo chu kỳ `queued → running → completed/failed`.</li>
              <li>Nếu `failed`, dùng thao tác retry ở Operations Console.</li>
              <li>Kiểm tra `error_message` và audit log trước khi chạy lại hàng loạt.</li>
            </ul>
          </article>

          <article className="panel">
            <h3>4. Chuẩn chất lượng dữ liệu</h3>
            <ul>
              <li>Ưu tiên prospect có email hợp lệ và vai trò đúng ICP.</li>
              <li>Không dùng dữ liệu mock trong môi trường staging/production.</li>
              <li>Mọi outbound email P1 phải đi qua Safe Mode.</li>
            </ul>
          </article>
        </section>

        <section className="panel apiMap">
          <h3>Nhóm API chính đang dùng</h3>
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
                  <td>Tạo và theo dõi luồng discovery</td>
                </tr>
                <tr>
                  <td>Prospects</td>
                  <td>`GET /p1/prospects`, `PATCH /p1/prospects/:id/status`</td>
                  <td>Duyệt prospect và cập nhật trạng thái funnel</td>
                </tr>
                <tr>
                  <td>Report</td>
                  <td>`POST /p1/prospects/:id/report`, `GET /p1/prospects/:id/report`</td>
                  <td>Generate, save và load company report AI</td>
                </tr>
                <tr>
                  <td>Draft Review</td>
                  <td>`POST /p1/prospects/:id/generate-draft`, `POST /p1/drafts/:id/review`</td>
                  <td>Sinh nháp và review trước gửi</td>
                </tr>
                <tr>
                  <td>Safe Mode</td>
                  <td>`GET /p1/email-safe-mode`, `POST /p1/email-safe-mode/preview`</td>
                  <td>Xác thực redirect và header audit trước outbound</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
