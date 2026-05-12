'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PagedResult<T> = { items: T[]; total: number; limit: number; offset: number };

type SearchJob = {
  id: string;
  keyword: string;
  industry: string | null;
  region: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_prospects: number;
  error_message: string | null;
  created_at: string;
};

type Prospect = {
  id: string;
  company: string;
  person_name: string;
  position: string | null;
  email: string | null;
  status: string;
  source: string;
  created_at: string;
};

type Draft = {
  id: string;
  prospect_id: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  compose_mode: string;
  edit_count: number;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

type ProspectCompanyReport = {
  id: string;
  prospect_id: string;
  company_name: string;
  report_markdown: string;
  report_json?: Record<string, unknown>;
  provider: 'openai' | 'gemini' | 'fallback';
  source_count: number;
  confidence_score: string | null;
  generated_at: string;
};

type ReportModelKind = 'fast' | 'balanced' | 'reasoning';

type RawSnapshot = {
  id: string;
  job_id: string | null;
  source: string;
  entity_type: string;
  entity_id: string | null;
  raw_json: unknown;
  content_hash: string | null;
  created_at: string;
};

const envApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function resolveApiBase(): string {
  if (typeof window === 'undefined') return envApiBase || 'http://localhost:4000';
  const host = window.location.hostname;
  const protocol = window.location.protocol || 'http:';
  if (envApiBase.trim()) return envApiBase;
  const browsingLocally = host === 'localhost' || host === '127.0.0.1';
  return browsingLocally ? `${protocol}//${host}:4000` : `${protocol}//${host}`;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('vi-VN');
}

function formatRelative(value: string | null): string {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

function readObj(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readStr(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : 'N/A';
}

function readStrArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

export default function WorkspacePage() {
  const apiBaseRef = useRef(resolveApiBase());
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [searchForm, setSearchForm] = useState({ companyName: '', region: '', industry: '' });
  const [jobs, setJobs] = useState<PagedResult<SearchJob>>({ items: [], total: 0, limit: 50, offset: 0 });
  const [prospects, setProspects] = useState<PagedResult<Prospect>>({ items: [], total: 0, limit: 50, offset: 0 });
  const [rawSnapshots, setRawSnapshots] = useState<PagedResult<RawSnapshot>>({ items: [], total: 0, limit: 20, offset: 0 });
  const [draftsTotal, setDraftsTotal] = useState({ total: 0, pending: 0 });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [reportModelKind, setReportModelKind] = useState<ReportModelKind>('balanced');
  const [report, setReport] = useState<ProspectCompanyReport | null>(null);

  const [jobFilter, setJobFilter] = useState('');
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [selectedRawSnapshotId, setSelectedRawSnapshotId] = useState<string | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [draftGenerating, setDraftGenerating] = useState(false);
  const reportCardRef = useRef<HTMLDivElement | null>(null);

  const fetchJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiBaseRef.current}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    []
  );

  const selectedJob = useMemo(() => jobs.items.find((item) => item.id === selectedJobId) ?? null, [jobs.items, selectedJobId]);
  const selectedProspect = useMemo(() => prospects.items.find((item) => item.id === selectedProspectId) ?? null, [prospects.items, selectedProspectId]);
  const selectedRawSnapshot = useMemo(() => rawSnapshots.items.find((item) => item.id === selectedRawSnapshotId) ?? null, [rawSnapshots.items, selectedRawSnapshotId]);

  const filteredJobs = useMemo(() => {
    const q = jobFilter.trim().toLowerCase();
    if (!q) return jobs.items;
    return jobs.items.filter((job) =>
      job.keyword.toLowerCase().includes(q) ||
      (job.industry ?? '').toLowerCase().includes(q) ||
      (job.region ?? '').toLowerCase().includes(q)
    );
  }, [jobs.items, jobFilter]);

  const loadJobs = useCallback(async () => {
    const result = await fetchJson<PagedResult<SearchJob>>('/p1/search-jobs?limit=50&offset=0');
    setJobs(result);
    return result;
  }, [fetchJson]);

  const loadProspects = useCallback(
    async (jobId: string) => {
      const result = await fetchJson<PagedResult<Prospect>>(`/p1/prospects?searchJobId=${encodeURIComponent(jobId)}&limit=50&offset=0`);
      setProspects(result);
      return result;
    },
    [fetchJson]
  );

  const loadRawSnapshots = useCallback(
    async (jobId: string) => {
      const result = await fetchJson<PagedResult<RawSnapshot>>(`/p1/search-jobs/${encodeURIComponent(jobId)}/raw-snapshots?limit=20&offset=0`);
      setRawSnapshots(result);
      return result;
    },
    [fetchJson]
  );

  const loadDraftsSummary = useCallback(async () => {
    const result = await fetchJson<PagedResult<Draft>>('/p1/drafts?limit=50&offset=0');
    const pending = result.items.filter((d) => d.status === 'pending_review').length;
    setDraftsTotal({ total: result.total, pending });
  }, [fetchJson]);

  useEffect(() => {
    setLoading(true);
    setErrorText(null);
    Promise.all([loadJobs(), loadDraftsSummary()])
      .then(([jobsResult]) => {
        if (jobsResult.items.length && !selectedJobId) {
          setSelectedJobId(jobsResult.items[0].id);
        }
      })
      .catch((error) => setErrorText(error instanceof Error ? error.message : 'Không thể tải dữ liệu'))
      .finally(() => setLoading(false));
  }, [loadJobs, loadDraftsSummary, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setProspects({ items: [], total: 0, limit: 50, offset: 0 });
      setRawSnapshots({ items: [], total: 0, limit: 20, offset: 0 });
      setSelectedProspectId(null);
      setReport(null);
      return;
    }

    setLoading(true);
    setErrorText(null);
    loadProspects(selectedJobId)
      .then((result) => {
        if (result.items.length) setSelectedProspectId((prev) => prev ?? result.items[0].id);
        else setSelectedProspectId(null);
      })
      .catch((error) => setErrorText(error instanceof Error ? error.message : 'Không tải được prospect'))
      .finally(() => setLoading(false));
  }, [selectedJobId, loadProspects]);

  useEffect(() => {
    if (!selectedProspectId) {
      setReport(null);
      return;
    }

    let cancelled = false;
    setReport(null);
    setReportLoading(true);

    fetch(`${apiBaseRef.current}/p1/prospects/${selectedProspectId}/report`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 404) {
          setReport(null);
          return;
        }
        if (!response.ok) {
          throw new Error((await response.text()) || `HTTP ${response.status}`);
        }
        const data = (await response.json()) as ProspectCompanyReport;
        if (!cancelled) setReport(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorText(error instanceof Error ? error.message : 'Không tải được báo cáo đã lưu');
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProspectId]);

  useEffect(() => {
    if (!showRawData || !selectedJobId) return;
    void loadRawSnapshots(selectedJobId).catch((error) =>
      setErrorText(error instanceof Error ? error.message : 'Không tải được raw data')
    );
  }, [showRawData, selectedJobId, loadRawSnapshots]);

  async function handleCreateSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorText(null);
    setNotice(null);

    try {
      const created = await fetchJson<{ jobId: string }>('/p1/search-jobs', {
        method: 'POST',
        body: JSON.stringify({
          companyName: searchForm.companyName,
          keyword: searchForm.companyName,
          region: searchForm.region.trim() || undefined,
          industry: searchForm.industry.trim() || undefined,
          source: 'manual'
        })
      });

      setSearchForm({ companyName: '', region: '', industry: '' });
      setShowCreateDrawer(false);
      const refreshed = await loadJobs();
      const fresh = refreshed.items.find((item) => item.id === created.jobId);
      if (fresh) setSelectedJobId(fresh.id);
      setNotice(`Đã tạo đợt "${fresh?.keyword ?? created.jobId.slice(0, 8)}". Đang chạy nguồn dữ liệu…`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được search job');
    }
  }

  async function handleGenerateAndSaveReport(): Promise<void> {
    if (!selectedProspectId) return;
    setReportGenerating(true);
    setReport(null);
    setErrorText(null);
    setNotice(null);

    requestAnimationFrame(() => {
      reportCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    try {
      const saved = await fetchJson<ProspectCompanyReport>(`/p1/prospects/${selectedProspectId}/report`, {
        method: 'POST',
        body: JSON.stringify({ modelKind: reportModelKind })
      });
      setReport(saved);
      setNotice(`Đã xuất report (${saved.provider}, mode=${reportModelKind}).`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được report');
    } finally {
      setReportGenerating(false);
    }
  }

  async function handleGenerateDraft(): Promise<void> {
    if (!selectedProspectId) return;
    setDraftGenerating(true);
    setErrorText(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ draftId: string }>(`/p1/prospects/${selectedProspectId}/generate-draft`, { method: 'POST' });
      await loadDraftsSummary();
      setNotice(`Đã tạo draft ${result.draftId.slice(0, 8)} và gửi card review qua Telegram.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được draft');
    } finally {
      setDraftGenerating(false);
    }
  }

  async function handleDownloadLatex(): Promise<void> {
    if (!selectedProspectId) return;
    try {
      const response = await fetch(`${apiBaseRef.current}/p1/prospects/${selectedProspectId}/report/latex`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { filename: string; content: string };
      const blob = new Blob([payload.content], { type: 'application/x-tex;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.filename || 'company-report.tex';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tải được file LaTeX');
    }
  }

  async function handleDownloadPdf(): Promise<void> {
    if (!selectedProspectId) return;
    try {
      const response = await fetch(`${apiBaseRef.current}/p1/prospects/${selectedProspectId}/report/pdf`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { filename: string; contentBase64: string };
      const binary = atob(payload.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.filename || 'company-report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tải được file PDF');
    }
  }

  function handleExportReportPdf(): void {
    if (!report) return;

    const reportText = report.report_markdown ?? '';
    const content = reportText
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('\n', '<br/>');

    const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
    if (!popup) {
      setErrorText('Trình duyệt đã chặn popup. Hãy cho phép popup để xuất PDF.');
      return;
    }

    const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>AI Company Report - ${report.company_name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #122238; }
    h1 { margin: 0 0 8px; font-size: 26px; }
    .meta { margin: 0 0 16px; color: #4a5f80; font-size: 13px; }
    .card { border: 1px solid #dbe4f2; border-radius: 10px; padding: 16px; background: #fff; }
    .report { line-height: 1.6; font-size: 14px; white-space: normal; }
    @page { size: A4; margin: 14mm; }
  </style>
</head>
<body>
  <h1>AI Company Report</h1>
  <p class="meta">Company: ${report.company_name} | Provider: ${report.provider} | Generated: ${formatDate(report.generated_at)}</p>
  <div class="card report">${content}</div>
</body>
</html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  const stage: 'no-job' | 'no-prospect' | 'ready' | 'has-report' = !selectedJobId
    ? 'no-job'
    : !selectedProspectId
    ? 'no-prospect'
    : report
    ? 'has-report'
    : 'ready';

  return (
    <main className="page wsPage">
      <div className="wsShell">
        {/* TOPBAR */}
        <header className="wsTopbar">
          <div className="wsCrumb">
            <span className="wsCrumbHead">Workspace</span>
            <span className="wsCrumbSep">/</span>
            <span className={`wsCrumbItem ${selectedJob ? 'active' : ''}`}>
              {selectedJob ? selectedJob.keyword : 'Chưa chọn đợt'}
            </span>
            <span className="wsCrumbSep">/</span>
            <span className={`wsCrumbItem ${selectedProspect ? 'active' : ''}`}>
              {selectedProspect ? selectedProspect.person_name : 'Chưa chọn prospect'}
            </span>
            <span className="wsCrumbSep">/</span>
            <span className={`wsCrumbItem ${report ? 'active' : ''}`}>
              {report ? `Report · ${report.provider}` : 'Chưa có report'}
            </span>
          </div>

          <div className="wsTopActions">
            <a href="/console" className="wsTopPill" title="Xem hàng đợi duyệt draft tại Operations">
              <strong>{draftsTotal.pending}</strong>
              <span>draft chờ duyệt</span>
              <em>↗</em>
            </a>
            <button
              type="button"
              className="wsTopCta"
              onClick={() => setShowCreateDrawer(true)}
            >
              + Đợt mới
            </button>
          </div>
        </header>

        {errorText ? <div className="alert wsAlert">{errorText}</div> : null}
        {notice ? <div className="successAlert wsAlert">{notice}</div> : null}

        {/* TWO-COLUMN BODY */}
        <div className="wsBody">
          {/* SIDEBAR: JOB LIST */}
          <aside className="wsSidebar">
            <div className="wsSidebarHead">
              <strong>Đợt tìm kiếm</strong>
              <span>{jobs.total}</span>
            </div>
            <input
              className="wsSidebarSearch"
              placeholder="Tìm theo tên / ngành / khu vực"
              value={jobFilter}
              onChange={(event) => setJobFilter(event.target.value)}
            />
            <div className="wsJobList">
              {!filteredJobs.length ? (
                <p className="wsEmpty wsEmptySmall">
                  {jobs.total === 0 ? 'Chưa có đợt nào. Bấm "+ Đợt mới" để bắt đầu.' : 'Không khớp bộ lọc.'}
                </p>
              ) : (
                filteredJobs.map((job) => (
                  <button
                    type="button"
                    key={job.id}
                    className={`wsJobRow ${selectedJobId === job.id ? 'selected' : ''}`}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <div className="wsJobRowTop">
                      <span className="wsJobName">{job.keyword}</span>
                      <span className={`statusBadge status-${job.status}`}>{job.status}</span>
                    </div>
                    <div className="wsJobRowMeta">
                      <span>{job.region ?? 'Global'}</span>
                      <span>·</span>
                      <span>{job.industry ?? 'Chưa phân loại'}</span>
                      <span>·</span>
                      <span>{job.total_prospects} prospect</span>
                    </div>
                    <div className="wsJobRowFoot">{formatRelative(job.created_at)}</div>
                  </button>
                ))
              )}
            </div>
          </aside>

          {/* MAIN */}
          <section className="wsMain">
            {stage === 'no-job' ? (
              <div className="wsHero">
                <p className="eyebrow">Bắt đầu một đợt mới</p>
                <h1>Chọn đợt ở bên trái, hoặc tạo đợt mới.</h1>
                <p>Workspace dẫn bạn đi qua 3 bước: chọn prospect → tạo báo cáo công ty → tạo draft email để CEO duyệt qua Telegram.</p>
                <button type="button" className="wsHeroCta" onClick={() => setShowCreateDrawer(true)}>+ Tạo đợt tìm kiếm</button>
              </div>
            ) : (
              <>
                {/* PROSPECTS */}
                <section className="wsCard">
                  <header className="wsCardHead">
                    <div>
                      <p className="eyebrow">1 — Prospects</p>
                      <h2>Chọn người để tiếp cận</h2>
                    </div>
                    <span className="wsCardMeta">{prospects.total} prospect</span>
                  </header>

                  {!prospects.items.length ? (
                    <p className="wsEmpty">
                      {selectedJob?.status === 'running' || selectedJob?.status === 'queued'
                        ? 'Đợt đang chạy. Khi có prospect, danh sách sẽ hiện ở đây.'
                        : 'Chưa có prospect nào trong đợt này.'}
                    </p>
                  ) : (
                    <div className="wsProspectList">
                      {prospects.items.map((prospect) => (
                        <button
                          type="button"
                          key={prospect.id}
                          className={`wsProspectRow ${selectedProspectId === prospect.id ? 'selected' : ''}`}
                          onClick={() => setSelectedProspectId(prospect.id)}
                        >
                          <div className="wsProspectMain">
                            <strong>{prospect.person_name}</strong>
                            <span>{prospect.position ?? 'Chưa có chức danh'}</span>
                          </div>
                          <div className="wsProspectMeta">
                            <span className="wsProspectCo">{prospect.company}</span>
                            <span className="wsProspectMail">{prospect.email ?? '—'}</span>
                          </div>
                          <div className="wsProspectTags">
                            <span className="wsTag">{prospect.status}</span>
                            <span className="wsTag wsTagMuted">{prospect.source}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {/* ACTION CARD: only if a prospect is selected */}
                {selectedProspect ? (
                  <section className={`wsCard wsActionCard ${stage === 'ready' ? 'pulse' : ''}`}>
                    <header className="wsCardHead">
                      <div>
                        <p className="eyebrow">2 — Action</p>
                        <h2>
                          {selectedProspect.person_name}
                          <span className="wsActionSub"> · {selectedProspect.company}</span>
                        </h2>
                      </div>
                      <span className="wsCardMeta">{selectedProspect.email ?? 'Chưa có email'}</span>
                    </header>

                    <div className="wsActionGrid">
                      <label className="wsActionField">
                        <span>Chế độ model</span>
                        <select
                          value={reportModelKind}
                          onChange={(event) => setReportModelKind(event.target.value as ReportModelKind)}
                          disabled={reportGenerating || draftGenerating}
                        >
                          <option value="fast">fast — nhanh, ít chi tiết</option>
                          <option value="balanced">balanced — mặc định</option>
                          <option value="reasoning">reasoning — sâu, lâu hơn</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        className="wsActionPrimary"
                        onClick={() => void handleGenerateAndSaveReport()}
                        disabled={!selectedProspectId || reportGenerating || draftGenerating}
                      >
                        <span>{reportGenerating ? 'Đang tạo báo cáo…' : 'Tạo báo cáo công ty'}</span>
                        <em>{reportGenerating ? '⏳' : '→'}</em>
                      </button>

                      <button
                        type="button"
                        className="wsActionSecondary"
                        onClick={() => void handleGenerateDraft()}
                        disabled={!selectedProspectId || reportGenerating || draftGenerating}
                      >
                        <span>{draftGenerating ? 'Đang tạo draft…' : 'Tạo draft email'}</span>
                        <em>{draftGenerating ? '⏳' : '↗ Telegram'}</em>
                      </button>
                    </div>
                  </section>
                ) : null}

                {/* REPORT */}
                {reportGenerating ? (
                  <section ref={reportCardRef} className="wsCard wsReportLoading">
                    <header className="wsCardHead">
                      <div>
                        <p className="eyebrow">3 — Report</p>
                        <h2>
                          <span className="wsSpinner" /> AI đang tạo báo cáo cho {selectedProspect?.company ?? 'prospect'}…
                        </h2>
                      </div>
                      <span className="wsCardMeta">mode = {reportModelKind}</span>
                    </header>
                    <p className="wsReportLoadingHint">
                      Đang tổng hợp dữ liệu từ raw snapshots, gọi {reportModelKind === 'reasoning' ? 'reasoning model (sâu, có thể 1-2 phút)' : reportModelKind === 'fast' ? 'fast model (~20 giây)' : 'balanced model (~30-60 giây)'} và lưu vào database. Không cần đóng trang.
                    </p>
                    <div className="wsSkeletonBody">
                      <div className="wsSkeletonBlock" style={{ width: '40%', height: '1.1rem' }} />
                      <div className="wsSkeletonBlock" style={{ width: '92%' }} />
                      <div className="wsSkeletonBlock" style={{ width: '88%' }} />
                      <div className="wsSkeletonBlock" style={{ width: '70%' }} />
                      <div className="wsSkeletonBlock" style={{ width: '30%', height: '1.1rem', marginTop: '0.4rem' }} />
                      <div className="wsSkeletonGrid">
                        <div className="wsSkeletonBlock" />
                        <div className="wsSkeletonBlock" />
                        <div className="wsSkeletonBlock" />
                        <div className="wsSkeletonBlock" />
                      </div>
                      <div className="wsSkeletonBlock" style={{ width: '34%', height: '1.1rem', marginTop: '0.4rem' }} />
                      <div className="wsSkeletonBlock" style={{ width: '60%' }} />
                      <div className="wsSkeletonBlock" style={{ width: '52%' }} />
                    </div>
                  </section>
                ) : reportLoading ? (
                  <section ref={reportCardRef} className="wsCard wsReportFetching">
                    <header className="wsCardHead">
                      <div>
                        <p className="eyebrow">3 — Report</p>
                        <h2>
                          <span className="wsSpinner wsSpinnerBlue" /> Đang tải báo cáo đã lưu…
                        </h2>
                      </div>
                    </header>
                    <div className="wsSkeletonBody">
                      <div className="wsSkeletonBlock" style={{ width: '36%', height: '1.1rem' }} />
                      <div className="wsSkeletonBlock" style={{ width: '90%' }} />
                      <div className="wsSkeletonBlock" style={{ width: '74%' }} />
                      <div className="wsSkeletonBlock" style={{ width: '60%' }} />
                    </div>
                  </section>
                ) : report ? (
                  <section ref={reportCardRef} className="wsCard wsReportCard">
                    <header className="wsCardHead">
                      <div>
                        <p className="eyebrow">3 — Report</p>
                        <h2>{report.company_name}</h2>
                      </div>
                      <div className="reportMeta wsReportMeta">
                        <span>{report.provider}</span>
                        <span>{report.source_count} nguồn</span>
                        <span>score {report.confidence_score ?? 'N/A'}</span>
                        <span>{formatRelative(report.generated_at)}</span>
                      </div>
                    </header>

                    <div className="wsReportActions">
                      <button type="button" className="ghostAction smallBtn" onClick={() => void handleDownloadLatex()}>Tải .tex</button>
                      <button type="button" className="ghostAction smallBtn" onClick={() => void handleDownloadPdf()}>Tải PDF (server)</button>
                      <button type="button" className="ghostAction smallBtn" onClick={handleExportReportPdf}>Xuất PDF (in)</button>
                    </div>

                    <ReportBody report={report} />
                  </section>
                ) : selectedProspect ? (
                  <section className="wsCard wsReportPlaceholder">
                    <p className="eyebrow">3 — Report</p>
                    <p className="wsEmpty">Chưa có báo cáo cho prospect này. Bấm "Tạo báo cáo công ty" ở trên.</p>
                  </section>
                ) : null}

                {/* RAW DATA (collapsed) */}
                <section className="wsCollapse">
                  <button
                    type="button"
                    className="wsCollapseHead"
                    onClick={() => setShowRawData((prev) => !prev)}
                  >
                    <span>{showRawData ? '▼' : '▶'}</span>
                    <strong>Dữ liệu nguồn của đợt này</strong>
                    <span className="wsCardMeta">{rawSnapshots.total || '—'} bản ghi</span>
                  </button>
                  {showRawData ? (
                    <div className="wsCollapseBody">
                      {!rawSnapshots.items.length ? (
                        <p className="wsEmpty wsEmptySmall">Chưa có raw snapshot.</p>
                      ) : (
                        <>
                          <div className="tableWrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Source</th>
                                  <th>Entity</th>
                                  <th>ID</th>
                                  <th>Tạo lúc</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rawSnapshots.items.map((item) => (
                                  <tr
                                    key={item.id}
                                    className={selectedRawSnapshotId === item.id ? 'selected' : ''}
                                    onClick={() => setSelectedRawSnapshotId(item.id)}
                                  >
                                    <td>{item.source}</td>
                                    <td>{item.entity_type}</td>
                                    <td>{item.entity_id ?? '-'}</td>
                                    <td>{formatDate(item.created_at)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {selectedRawSnapshot ? (
                            <pre className="payloadBox wsRawPayload">{JSON.stringify(selectedRawSnapshot.raw_json, null, 2)}</pre>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </section>
        </div>
      </div>

      {/* CREATE DRAWER */}
      {showCreateDrawer ? (
        <div className="wsDrawerOverlay" onClick={() => setShowCreateDrawer(false)}>
          <div className="wsDrawer" onClick={(event) => event.stopPropagation()}>
            <header className="wsDrawerHead">
              <div>
                <p className="eyebrow">Đợt tìm kiếm mới</p>
                <h2>Mở một đợt tìm công ty</h2>
              </div>
              <button type="button" className="wsDrawerClose" onClick={() => setShowCreateDrawer(false)}>✕</button>
            </header>
            <form onSubmit={handleCreateSearch} className="wsDrawerForm">
              <label>
                <span>Tên công ty *</span>
                <input
                  placeholder="ví dụ: Vietcombank"
                  value={searchForm.companyName}
                  onChange={(event) => setSearchForm((prev) => ({ ...prev, companyName: event.target.value }))}
                  required
                  autoFocus
                />
              </label>
              <label>
                <span>Khu vực</span>
                <input
                  placeholder="VN, US, APAC…"
                  value={searchForm.region}
                  onChange={(event) => setSearchForm((prev) => ({ ...prev, region: event.target.value }))}
                />
              </label>
              <label>
                <span>Ngành / thị trường</span>
                <input
                  placeholder="Banking, Fintech, eCommerce…"
                  value={searchForm.industry}
                  onChange={(event) => setSearchForm((prev) => ({ ...prev, industry: event.target.value }))}
                />
              </label>
              <div className="wsDrawerFoot">
                <button type="button" className="ghostAction" onClick={() => setShowCreateDrawer(false)}>Huỷ</button>
                <button type="submit">Bắt đầu tìm</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ReportBody({ report }: { report: ProspectCompanyReport }) {
  const json = readObj(report.report_json);
  if (!json) {
    return <pre className="payloadBox reportMarkdown">{report.report_markdown}</pre>;
  }

  const overview = readObj(json.company_overview) ?? {};
  const keyPerson = readObj(json.key_person) ?? {};
  const firmographics = readObj(json.firmographics) ?? {};
  const allKeyPersonsRaw = Array.isArray(json.all_key_persons) ? json.all_key_persons : [];
  const allKeyPersons = allKeyPersonsRaw
    .map((item) => readObj(item))
    .filter((item): item is Record<string, unknown> => item !== null);
  const outreachHooksRaw = Array.isArray(json.outreach_hooks) ? json.outreach_hooks : [];
  const outreachHooks = outreachHooksRaw
    .map((item) => readObj(item))
    .filter((item): item is Record<string, unknown> => item !== null);
  const sourcesRaw = Array.isArray(json.sources) ? json.sources : [];
  const sources = sourcesRaw
    .map((item) => readObj(item))
    .filter((item): item is Record<string, unknown> => item !== null);
  const buyingSignals = readStrArray(json.buying_signals);
  const risks = readStrArray(json.risks);
  const nextSteps = readStrArray(json.recommended_next_steps);
  const dataQuality = readStrArray(json.data_quality_notes);

  return (
    <div className="reportCard wsReportBody">
      <h4>Tóm tắt điều hành</h4>
      <p>{readStr(json.executive_summary)}</p>

      <h4>Company Overview</h4>
      <div className="reportGrid">
        <div><strong>Domain:</strong> {readStr(overview.domain)}</div>
        <div><strong>Industry:</strong> {readStr(overview.industry)}</div>
        <div><strong>Region:</strong> {readStr(overview.region)}</div>
      </div>
      <p><strong>Summary:</strong> {readStr(overview.summary)}</p>

      <h4>Firmographics</h4>
      <div className="reportGrid">
        <div><strong>Nhân sự:</strong> {readStr(firmographics.employee_count_range)}</div>
        <div><strong>Doanh thu:</strong> {readStr(firmographics.revenue_range_usd)}</div>
        <div><strong>Funding stage:</strong> {readStr(firmographics.funding_stage)}</div>
        <div><strong>Thành lập:</strong> {typeof firmographics.founded_year === 'number' ? String(firmographics.founded_year) : 'N/A'}</div>
      </div>

      <h4>Key Person (điểm kích hoạt)</h4>
      <div className="reportGrid">
        <div><strong>Name:</strong> {readStr(keyPerson.name)}</div>
        <div><strong>Title:</strong> {readStr(keyPerson.title)}</div>
        <div><strong>Email:</strong> {readStr(keyPerson.email)}</div>
        <div><strong>Phone:</strong> {readStr(keyPerson.phone)}</div>
      </div>

      <h4>All Key Persons ({allKeyPersons.length})</h4>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Confidence</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {!allKeyPersons.length ? (
              <tr><td colSpan={6}>N/A</td></tr>
            ) : allKeyPersons.map((item, idx) => (
              <tr key={`${readStr(item.name)}-${idx}`}>
                <td>{readStr(item.name)}</td>
                <td>{readStr(item.title)}</td>
                <td>{readStr(item.email)}</td>
                <td>{readStr(item.phone)}</td>
                <td>{typeof item.confidence_0_1 === 'number' ? `${Math.round(Number(item.confidence_0_1) * 100)}%` : 'N/A'}</td>
                <td>{readStr(item.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>Outreach Hooks · cớ tiếp cận ({outreachHooks.length})</h4>
      {!outreachHooks.length ? (
        <p className="wsHookEmpty">Chưa tìm được hook cụ thể từ dữ liệu hiện có. AI khuyến nghị bổ sung snapshot LinkedIn/press release để cải thiện.</p>
      ) : (
        <ul className="wsHookList">
          {outreachHooks.map((row, idx) => {
            const hook = readStr(row.hook);
            const useIn = readStr(row.use_in);
            const evidence = typeof row.evidence_url === 'string' ? row.evidence_url : null;
            return (
              <li key={`${hook}-${idx}`} className="wsHookItem">
                <span className={`wsHookTag wsHookTag-${useIn === 'N/A' ? 'opener' : useIn}`}>{useIn === 'N/A' ? 'opener' : useIn}</span>
                <span className="wsHookText">{hook}</span>
                {evidence ? (
                  <a href={evidence} target="_blank" rel="noreferrer" className="wsHookEvidence">nguồn ↗</a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <h4>Buying Signals</h4>
      <ul>{buyingSignals.length ? buyingSignals.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>

      <h4>Risks</h4>
      <ul>{risks.length ? risks.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>

      <h4>Recommended Next Steps</h4>
      <ul>{nextSteps.length ? nextSteps.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>

      <h4>Nguồn dẫn chứng ({sources.length})</h4>
      {!sources.length ? (
        <p className="wsHookEmpty">Không có URL nguồn nào kèm theo report này.</p>
      ) : (
        <ul className="wsSourceList">
          {sources.map((row, idx) => {
            const url = typeof row.url === 'string' ? row.url : '';
            const title = readStr(row.title);
            const claim = typeof row.claim_supported === 'string' ? row.claim_supported : null;
            return (
              <li key={`${url}-${idx}`}>
                <a href={url} target="_blank" rel="noreferrer">{title !== 'N/A' ? title : url}</a>
                {claim ? <span className="wsSourceClaim"> — dẫn chứng cho: <code>{claim}</code></span> : null}
              </li>
            );
          })}
        </ul>
      )}

      <h4>Data Quality Notes</h4>
      <ul>{dataQuality.length ? dataQuality.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>
    </div>
  );
}
