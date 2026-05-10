export default function HomePage() {
  return (
    <main className="page">
      <div className="container">
        <section className="landingHero">
          <p className="eyebrow">Internal Product · P1 Ready</p>
          <h1>AI Sales Agent</h1>
          <p>
            Một frontend thống nhất cho team Sales vận hành full luồng: tìm công ty, chọn prospect phù hợp, tạo report AI,
            và chuyển tiếp sang các module duyệt draft/email theo Safe Mode.
          </p>
          <div className="landingActions">
            <a className="ctaBtn" href="/workspace">
              Mở Workspace Chính
            </a>
            <a className="ghostBtn" href="/report-workflow">
              Mở Report Studio
            </a>
            <a className="ghostBtn" href="/console">
              Mở Operations Console
            </a>
          </div>
        </section>

        <section className="cards">
          <article className="card">
            <h2>Core Workflow</h2>
            <strong>Search → Prospect → Report</strong>
            <p className="cardText">Luồng chính hoàn chỉnh trong một trải nghiệm liền mạch, dùng API thật từ backend P1.</p>
          </article>
          <article className="card">
            <h2>Operations</h2>
            <strong>Realtime Control</strong>
            <p className="cardText">Theo dõi search jobs, prospect pipeline, draft queue và trạng thái thực thi theo thời gian thực.</p>
          </article>
          <article className="card">
            <h2>Product Safety</h2>
            <strong>Safe Mode Default</strong>
            <p className="cardText">Giữ đúng guardrail P1: review thủ công, redirect outbound và lưu vết audit đầy đủ.</p>
          </article>
          <article className="card">
            <h2>Team Onboarding</h2>
            <strong>Playbook + Check</strong>
            <p className="cardText">Có playbook vận hành và trang kiểm tra kết nối để setup nhanh, giảm lỗi khi chạy demo/live.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
