export default function HomePage() {
  return (
    <main className="page">
      <div className="container">
        <section className="landingHero">
          <p className="eyebrow">Demo Day Ready - 08/05/2026</p>
          <h1>AI Sales Agent P1 - Website Demo Console</h1>
          <p>
            Full flow demo tren web: search company that, sinh prospect, tao draft AI, review approve/reject, va gui
            mail theo Safe Mode redirect.
          </p>
          <div className="landingActions">
            <a className="ctaBtn" href="/workspace">
              Mo Demo Workspace
            </a>
            <a className="ghostBtn" href="/guide">
              Xem Playbook P1
            </a>
          </div>
        </section>

        <section className="cards landingCards">
          <article className="card">
            <h2>SC-03 New Search</h2>
            <p className="cardText">Nhap ten cong ty, region, industry de tao search job trong vai Sales.</p>
            <a href="/workspace#jobs-section">Đi tới khu vực tạo job</a>
          </article>
          <article className="card">
            <h2>SC-04 Job Tracking</h2>
            <p className="cardText">Theo doi queued/running/completed/failed va retry nhanh neu job loi.</p>
            <a href="/workspace#jobs-section">Xem bảng search jobs</a>
          </article>
          <article className="card">
            <h2>SC-07 Draft Inbox</h2>
            <p className="cardText">Tao draft tu prospect, review tren web/telegram roi approve de send safe mode.</p>
            <a href="/workspace#prospects-section">Mở danh sách prospects</a>
          </article>
          <article className="card">
            <h2>Safe Mode Guardrail</h2>
            <p className="cardText">Mail duoc redirect ve inbox test, luu intended/actual recipient de audit.</p>
            <a href="/guide">Đọc checklist triển khai</a>
          </article>
        </section>

        <section className="quickPanel">
          <h3>Checklist nhanh trước khi chạy</h3>
          <ul>
            <li>API + Worker đã chạy: `npm run dev:api` và `npm run dev:worker`.</li>
            <li>PostgreSQL + Redis đã khởi động.</li>
            <li>Cau hinh RAPIDAPI/HUNTER/APOLLO/OPENAI key that.</li>
            <li>Cau hinh TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_REVIEW_CHAT_ID.</li>
            <li>Kiểm tra kết nối API trước khi vận hành trên môi trường mới.</li>
          </ul>
          <a className="ghostBtn" href="/system-check">
            Mở trang kiểm tra kết nối
          </a>
        </section>
      </div>
    </main>
  );
}
