'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

type PagedResult<T> = { items: T[]; total: number; limit: number; offset: number };

type HealthCheck = {
  status: string;
  service: string;
};

type SearchJob = {
  id: string;
  keyword: string;
  industry: string | null;
  region: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_prospects: number;
  error_message?: string | null;
  created_at: string;
};

type Prospect = {
  id: string;
  company: string;
  person_name: string;
  position: string | null;
  email: string | null;
  status: 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived';
  source: string;
  created_at: string;
};

type Draft = {
  id: string;
  prospect_id: string | null;
  subject: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  compose_mode: string;
  edit_count: number;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

type ProspectCompanyReport = {
  id: string;
  company_name: string;
  provider: 'openai' | 'gemini' | 'fallback';
  source_count: number;
  confidence_score: string | null;
  generated_at: string;
  person_name: string | null;
  person_email: string | null;
};

type EmailHistory = {
  id: string;
  sender: string;
  intended_recipient: string;
  actual_recipient: string;
  redirected: boolean;
  subject: string;
  status: 'sent' | 'failed' | 'bounced' | 'delivered';
  sent_at: string | null;
  created_at: string;
};

type SafeModeConfig = {
  enableExternalSend: boolean;
  outboundRedirectTarget: string;
  smtpAllowlistDomains: string[];
};

type DashboardData = {
  health: HealthCheck | null;
  jobs: PagedResult<SearchJob>;
  prospects: PagedResult<Prospect>;
  drafts: PagedResult<Draft>;
  reports: PagedResult<ProspectCompanyReport>;
  emailHistory: PagedResult<EmailHistory>;
  safeMode: SafeModeConfig | null;
};

type AttentionTone = 'critical' | 'warning' | 'neutral' | 'good';

type AttentionItem = {
  title: string;
  description: string;
  metric: string;
  href: string;
  tone: AttentionTone;
};

const envApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function createEmptyResult<T>(limit = 0): PagedResult<T> {
  return { items: [], total: 0, limit, offset: 0 };
}

function createEmptyDashboardData(): DashboardData {
  return {
    health: null,
    jobs: createEmptyResult<SearchJob>(24),
    prospects: createEmptyResult<Prospect>(100),
    drafts: createEmptyResult<Draft>(100),
    reports: createEmptyResult<ProspectCompanyReport>(12),
    emailHistory: createEmptyResult<EmailHistory>(50),
    safeMode: null
  };
}

function resolveApiBase(): string {
  if (typeof window === 'undefined') return envApiBase || 'http://localhost:4000';
  const host = window.location.hostname;
  const protocol = window.location.protocol || 'http:';
  if (envApiBase.trim()) return envApiBase;
  const browsingLocally = host === 'localhost' || host === '127.0.0.1';
  return browsingLocally ? `${protocol}//${host}:4000` : `${protocol}//${host}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelative(value: string | null): string {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function mapJobStatusLabel(status: SearchJob['status']): string {
  if (status === 'queued') return 'Đang chờ';
  if (status === 'running') return 'Đang chạy';
  if (status === 'completed') return 'Hoàn tất';
  return 'Lỗi';
}

function mapProspectStatusLabel(status: Prospect['status']): string {
  if (status === 'new') return 'Mới';
  if (status === 'qualified') return 'Đạt ICP';
  if (status === 'contacted') return 'Đã liên hệ';
  if (status === 'meeting') return 'Có lịch hẹn';
  if (status === 'disqualified') return 'Loại';
  return 'Lưu trữ';
}

function mapDraftStatusLabel(status: Draft['status']): string {
  if (status === 'pending_review') return 'Chờ duyệt';
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'rejected') return 'Từ chối';
  return 'Đã gửi';
}

async function readJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function collectDashboardData(baseUrl: string): Promise<{ data: DashboardData; errors: string[] }> {
  const nextData = createEmptyDashboardData();
  const requestMap = [
    { key: 'health', label: 'Health', run: () => readJson<HealthCheck>(baseUrl, '/health') },
    { key: 'jobs', label: 'Search Jobs', run: () => readJson<PagedResult<SearchJob>>(baseUrl, '/p1/search-jobs?limit=24&offset=0') },
    { key: 'prospects', label: 'Prospects', run: () => readJson<PagedResult<Prospect>>(baseUrl, '/p1/prospects?limit=100&offset=0') },
    { key: 'drafts', label: 'Drafts', run: () => readJson<PagedResult<Draft>>(baseUrl, '/p1/drafts?limit=100&offset=0') },
    { key: 'reports', label: 'Reports', run: () => readJson<PagedResult<ProspectCompanyReport>>(baseUrl, '/p1/reports?limit=12&offset=0') },
    { key: 'emailHistory', label: 'Email History', run: () => readJson<PagedResult<EmailHistory>>(baseUrl, '/p1/email-history?limit=50&offset=0') },
    { key: 'safeMode', label: 'Safe Mode', run: () => readJson<SafeModeConfig>(baseUrl, '/p1/email-safe-mode') }
  ] as const;

  const settled = await Promise.allSettled(requestMap.map((item) => item.run()));
  const nextErrors: string[] = [];

  settled.forEach((result, index) => {
    const request = requestMap[index];
    if (result.status === 'fulfilled') {
      (nextData as Record<string, unknown>)[request.key] = result.value;
      return;
    }
    nextErrors.push(`${request.label}: ${result.reason instanceof Error ? result.reason.message : 'Không thể tải dữ liệu'}`);
  });

  return { data: nextData, errors: nextErrors };
}

export default function HomePage() {
  const apiBaseRef = useRef(resolveApiBase());
  const [data, setData] = useState<DashboardData>(createEmptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    setLoading(true);
    const snapshot = await collectDashboardData(apiBaseRef.current);
    setData(snapshot.data);
    setErrors(snapshot.errors);
    setLastUpdatedAt(new Date().toISOString());
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      setLoading(true);
      const snapshot = await collectDashboardData(apiBaseRef.current);

      if (cancelled) return;
      setData(snapshot.data);
      setErrors(snapshot.errors);
      setLastUpdatedAt(new Date().toISOString());
      setLoading(false);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const runningJobs = data.jobs.items.filter((item) => item.status === 'running').length;
  const failedJobs = data.jobs.items.filter((item) => item.status === 'failed').length;
  const completedJobs = data.jobs.items.filter((item) => item.status === 'completed').length;
  const pendingDrafts = data.drafts.items.filter((item) => item.status === 'pending_review').length;
  const approvedDrafts = data.drafts.items.filter((item) => item.status === 'approved').length;
  const sentDrafts = data.drafts.items.filter((item) => item.status === 'sent').length;
  const deliveredEmails = data.emailHistory.items.filter((item) => item.status === 'delivered').length;
  const bouncedEmails = data.emailHistory.items.filter((item) => item.status === 'bounced').length;
  const redirectedEmails = data.emailHistory.items.filter((item) => item.redirected).length;

  const activeProspectStatuses: Prospect['status'][] = ['new', 'qualified', 'contacted', 'meeting'];
  const prospectStatusOrder: Prospect['status'][] = ['new', 'qualified', 'contacted', 'meeting', 'disqualified', 'archived'];
  const activeProspects = data.prospects.items.filter((item) => activeProspectStatuses.includes(item.status)).length;

  const prospectBuckets = prospectStatusOrder.map((status) => {
    const count = data.prospects.items.filter((item) => item.status === status).length;
    const share = data.prospects.items.length > 0 ? (count / data.prospects.items.length) * 100 : 0;
    return { status, label: mapProspectStatusLabel(status), count, share };
  });

  const attentionItems: AttentionItem[] = [];
  if (failedJobs > 0) {
    attentionItems.push({
      title: 'Search job đang fail',
      description: 'Discovery pipeline có job lỗi. Vào Operations để xem lý do và retry.',
      metric: `${failedJobs} job`,
      href: '/console',
      tone: 'critical'
    });
  }
  if (pendingDrafts > 0) {
    attentionItems.push({
      title: 'Draft email chờ duyệt',
      description: 'CEO/reviewer cần approve hoặc chỉnh sửa qua Telegram trước khi gửi.',
      metric: `${pendingDrafts} draft`,
      href: '/console',
      tone: 'warning'
    });
  }
  if (bouncedEmails > 0) {
    attentionItems.push({
      title: 'Email bị bounce',
      description: 'Có email gửi đi đã bị từ chối. Cần xem lại địa chỉ hoặc Safe Mode allowlist.',
      metric: `${bouncedEmails} bounce`,
      href: '/console',
      tone: 'warning'
    });
  }
  if (runningJobs > 0) {
    attentionItems.push({
      title: 'Discovery đang chạy',
      description: 'Prospecting pipeline đang chạy nền, mở Workspace để theo dõi prospect mới đổ về.',
      metric: `${runningJobs} job`,
      href: '/workspace',
      tone: 'neutral'
    });
  }
  if (attentionItems.length === 0) {
    attentionItems.push({
      title: 'Queue đang sạch',
      description: 'Chưa có blocker rõ ràng. Có thể mở Workspace để tạo vòng discovery mới.',
      metric: 'No blocker',
      href: '/workspace',
      tone: 'good'
    });
  }

  const activityFeed = useMemo(() => {
    type Event = { id: string; kind: 'job' | 'draft' | 'email'; title: string; sub: string; status: string; statusClass: string; at: string };
    const events: Event[] = [];

    data.jobs.items.slice(0, 6).forEach((job) => {
      events.push({
        id: `job-${job.id}`,
        kind: 'job',
        title: job.keyword,
        sub: `${job.region ?? 'Global'} · ${job.industry ?? 'N/A'} · ${job.total_prospects} prospect`,
        status: mapJobStatusLabel(job.status),
        statusClass: `status-${job.status}`,
        at: job.created_at
      });
    });

    data.drafts.items.slice(0, 6).forEach((draft) => {
      events.push({
        id: `draft-${draft.id}`,
        kind: 'draft',
        title: draft.subject || 'Untitled draft',
        sub: `${draft.compose_mode} · edit ${draft.edit_count}`,
        status: mapDraftStatusLabel(draft.status),
        statusClass: `status-${draft.status}`,
        at: draft.created_at
      });
    });

    data.emailHistory.items.slice(0, 4).forEach((email) => {
      events.push({
        id: `email-${email.id}`,
        kind: 'email',
        title: email.subject || '(no subject)',
        sub: `${email.redirected ? 'redirected → ' : ''}${email.actual_recipient}`,
        status: email.status,
        statusClass: `status-${email.status}`,
        at: email.sent_at ?? email.created_at
      });
    });

    return events
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 10);
  }, [data]);

  const safeModeTone: AttentionTone = !data.safeMode
    ? 'neutral'
    : data.safeMode.enableExternalSend
    ? 'warning'
    : 'good';

  return (
    <main className="page ovPage">
      <div className="ovShell">
        {/* HERO */}
        <section className="ovHero">
          <div className="ovHeroMain">
            <div className="ovHeroLine">
              <span className={`livePill ${loading ? 'is-loading' : data.health?.status === 'ok' ? 'is-live' : 'is-risk'}`}>
                {loading ? 'Đang đồng bộ' : data.health?.status === 'ok' ? 'System live' : 'API chưa thông'}
              </span>
              <span className="ovHeroMeta">
                {lastUpdatedAt ? `Cập nhật ${formatDateTime(lastUpdatedAt)}` : 'Chưa có snapshot'}
              </span>
            </div>
            <h1>Tổng quan vận hành</h1>
            <p className="ovHeroLead">
              Snapshot pipeline, draft queue và Safe Mode của team Sales. Bấm vào module bên dưới để vào sâu.
            </p>
            <div className="ovHeroActions">
              <Link className="ctaBtn" href="/workspace">Mở Workspace</Link>
              <Link className="ghostBtn" href="/console">Operations</Link>
              <button type="button" className="ghostBtn" onClick={() => void loadDashboard()} disabled={loading}>
                {loading ? 'Đang tải…' : 'Làm mới'}
              </button>
            </div>
          </div>

          <div className="ovKpiStrip">
            <KpiCard label="Pipeline active" value={activeProspects} hint={`${data.prospects.total} total prospect`} href="/workspace" accent="brand" />
            <KpiCard label="Draft chờ duyệt" value={pendingDrafts} hint={`${approvedDrafts} approved · ${sentDrafts} sent`} href="/console" accent={pendingDrafts > 0 ? 'warning' : 'muted'} />
            <KpiCard label="Reports đã tạo" value={data.reports.total} hint={`${completedJobs} job hoàn tất`} href="/report-workflow" accent="muted" />
            <KpiCard label="Delivery guard" value={redirectedEmails} hint={`${deliveredEmails} delivered · ${bouncedEmails} bounce`} href="/console" accent={bouncedEmails > 0 ? 'critical' : 'muted'} />
          </div>
        </section>

        {errors.length > 0 ? (
          <div className="alert ovAlert">
            <strong>Một số mục không tải được.</strong>
            <ul>
              {errors.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}

        {/* ATTENTION LIST */}
        <section className="ovBlock">
          <header className="ovBlockHead">
            <div>
              <p className="eyebrow">Ưu tiên</p>
              <h2>Việc cần xử lý hôm nay</h2>
            </div>
            <Link className="ovBlockLink" href="/console">Mở Operations →</Link>
          </header>
          <div className="ovAttentionList">
            {attentionItems.slice(0, 4).map((item) => (
              <Link key={`${item.title}-${item.metric}`} href={item.href} className={`ovAttentionRow tone-${item.tone}`}>
                <span className="ovAttentionDot" />
                <div className="ovAttentionBody">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <span className="ovAttentionMetric">{item.metric}</span>
                <span className="ovAttentionArrow">→</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FUNNEL + ACTIVITY */}
        <section className="ovGrid">
          <article className="ovBlock">
            <header className="ovBlockHead">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h2>Prospect funnel</h2>
              </div>
              <Link className="ovBlockLink" href="/workspace">Workspace →</Link>
            </header>
            <div className="ovFunnel">
              {prospectBuckets.map((bucket) => (
                <div key={bucket.status} className="ovFunnelRow">
                  <div className="ovFunnelLabel">
                    <span>{bucket.label}</span>
                    <strong>{bucket.count}</strong>
                  </div>
                  <div className="ovFunnelTrack">
                    <div
                      className={`ovFunnelFill status-${bucket.status}`}
                      style={{ width: `${Math.max(bucket.share, bucket.count > 0 ? 6 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
              {data.prospects.items.length === 0 ? (
                <p className="ovEmpty">Chưa có prospect nào trong snapshot.</p>
              ) : null}
            </div>
          </article>

          <article className="ovBlock">
            <header className="ovBlockHead">
              <div>
                <p className="eyebrow">Hoạt động</p>
                <h2>Sự kiện gần nhất</h2>
              </div>
              <Link className="ovBlockLink" href="/console">Tất cả →</Link>
            </header>
            <div className="ovActivity">
              {activityFeed.length === 0 ? (
                <p className="ovEmpty">Chưa có sự kiện nào.</p>
              ) : (
                activityFeed.map((event) => (
                  <div key={event.id} className="ovActivityRow">
                    <span className={`ovActivityKind kind-${event.kind}`}>
                      {event.kind === 'job' ? 'Job' : event.kind === 'draft' ? 'Draft' : 'Email'}
                    </span>
                    <div className="ovActivityBody">
                      <strong>{event.title}</strong>
                      <span>{event.sub}</span>
                    </div>
                    <span className={`statusBadge ${event.statusClass}`}>{event.status}</span>
                    <span className="ovActivityWhen">{formatRelative(event.at)}</span>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        {/* MODULE DECK */}
        <section className="ovBlock">
          <header className="ovBlockHead">
            <div>
              <p className="eyebrow">Modules</p>
              <h2>Đi tới khu vực làm việc</h2>
            </div>
          </header>
          <div className="ovModuleDeck">
            <Link href="/workspace" className="ovModuleCard">
              <span className="ovModuleLabel">Workspace</span>
              <strong>Tìm công ty, chọn prospect, tạo report</strong>
              <p>{data.jobs.total} đợt · {activeProspects} prospect active</p>
            </Link>
            <Link href="/report-workflow" className="ovModuleCard">
              <span className="ovModuleLabel">Report Studio</span>
              <strong>Đọc report đã lưu và rà output AI</strong>
              <p>{data.reports.total} report · mới nhất: {data.reports.items[0]?.company_name ?? '—'}</p>
            </Link>
            <Link href="/console" className="ovModuleCard">
              <span className="ovModuleLabel">Operations</span>
              <strong>Duyệt draft, retry queue, giám sát</strong>
              <p>{pendingDrafts + failedJobs} mục cần xử lý</p>
            </Link>
            <Link href="/guide" className="ovModuleCard">
              <span className="ovModuleLabel">Playbook</span>
              <strong>SOP nội bộ và rollout checklist</strong>
              <p>Dùng khi onboarding hoặc chuẩn hoá thao tác</p>
            </Link>
            <Link href="/system-check" className="ovModuleCard">
              <span className="ovModuleLabel">System Check</span>
              <strong>Health API và môi trường</strong>
              <p>{data.health?.status === 'ok' ? 'API healthy' : 'Cần kiểm tra'}</p>
            </Link>
          </div>
        </section>

        {/* SAFE MODE FOOTER STRIP */}
        <section className={`ovSafeStrip tone-${safeModeTone}`}>
          <div className="ovSafeStripMain">
            <span className="ovSafeBadge">Safe Mode</span>
            <strong>
              {!data.safeMode
                ? 'Chưa đọc được config Safe Mode'
                : data.safeMode.enableExternalSend
                ? 'External send đang BẬT — email gửi trực tiếp ra ngoài'
                : `Redirect đang bật — mọi outbound chuyển về ${data.safeMode.outboundRedirectTarget}`}
            </strong>
            <span className="ovSafeMeta">
              Allowlist: {data.safeMode?.smtpAllowlistDomains.length ?? 0} domain
            </span>
          </div>
          <Link href="/system-check" className="ovSafeStripLink">Mở System Check →</Link>
        </section>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  hint,
  href,
  accent
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  accent: 'brand' | 'warning' | 'critical' | 'muted';
}) {
  return (
    <Link href={href} className={`ovKpiCard accent-${accent}`}>
      <span className="ovKpiLabel">{label}</span>
      <strong className="ovKpiValue">{value}</strong>
      <span className="ovKpiHint">{hint}</span>
    </Link>
  );
}
