'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

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

type EmailHistory = {
  id: string;
  draft_id: string;
  sender: string;
  intended_recipient: string;
  actual_recipient: string;
  redirected: boolean;
  subject: string;
  status: 'sent' | 'failed' | 'bounced' | 'delivered';
  sent_at: string | null;
  created_at: string;
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
  const [apiBase, setApiBase] = useState(resolveApiBase);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [searchForm, setSearchForm] = useState({ companyName: '', region: '', industry: '' });
  const [jobs, setJobs] = useState<PagedResult<SearchJob>>({ items: [], total: 0, limit: 10, offset: 0 });
  const [prospects, setProspects] = useState<PagedResult<Prospect>>({ items: [], total: 0, limit: 20, offset: 0 });
  const [rawSnapshots, setRawSnapshots] = useState<PagedResult<RawSnapshot>>({ items: [], total: 0, limit: 20, offset: 0 });
  const [drafts, setDrafts] = useState<PagedResult<Draft>>({ items: [], total: 0, limit: 20, offset: 0 });
  const [emailHistory, setEmailHistory] = useState<PagedResult<EmailHistory>>({ items: [], total: 0, limit: 20, offset: 0 });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [selectedRawSnapshotId, setSelectedRawSnapshotId] = useState<string | null>(null);
  const [reportModelKind, setReportModelKind] = useState<ReportModelKind>('balanced');

  const [report, setReport] = useState<ProspectCompanyReport | null>(null);
  const [rawFilters, setRawFilters] = useState({ source: '', entityType: '', q: '' });

  const fetchJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiBase}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    [apiBase]
  );

  const selectedProspect = useMemo(() => prospects.items.find((item) => item.id === selectedProspectId) ?? null, [prospects.items, selectedProspectId]);
  const selectedRawSnapshot = useMemo(() => rawSnapshots.items.find((item) => item.id === selectedRawSnapshotId) ?? null, [rawSnapshots.items, selectedRawSnapshotId]);

  const loadJobs = useCallback(async () => {
    const result = await fetchJson<PagedResult<SearchJob>>('/p1/search-jobs?limit=10&offset=0');
    setJobs(result);
    if (!selectedJobId && result.items.length) setSelectedJobId(result.items[0].id);
  }, [fetchJson, selectedJobId]);

  const loadProspects = useCallback(async () => {
    if (!selectedJobId) {
      setProspects({ items: [], total: 0, limit: 20, offset: 0 });
      return;
    }
    const result = await fetchJson<PagedResult<Prospect>>(`/p1/prospects?searchJobId=${encodeURIComponent(selectedJobId)}&limit=20&offset=0`);
    setProspects(result);
    if (!selectedProspectId && result.items.length) setSelectedProspectId(result.items[0].id);
  }, [fetchJson, selectedJobId, selectedProspectId]);

  const loadRawSnapshots = useCallback(async () => {
    if (!selectedJobId) {
      setRawSnapshots({ items: [], total: 0, limit: 20, offset: 0 });
      setSelectedRawSnapshotId(null);
      return;
    }

    const params = new URLSearchParams();
    params.set('limit', '20');
    params.set('offset', '0');
    if (rawFilters.source.trim()) params.set('source', rawFilters.source.trim());
    if (rawFilters.entityType.trim()) params.set('entityType', rawFilters.entityType.trim());
    if (rawFilters.q.trim()) params.set('q', rawFilters.q.trim());

    const result = await fetchJson<PagedResult<RawSnapshot>>(`/p1/search-jobs/${encodeURIComponent(selectedJobId)}/raw-snapshots?${params.toString()}`);
    setRawSnapshots(result);
    if (!selectedRawSnapshotId && result.items.length) setSelectedRawSnapshotId(result.items[0].id);
  }, [fetchJson, rawFilters.entityType, rawFilters.q, rawFilters.source, selectedJobId, selectedRawSnapshotId]);

  const loadDrafts = useCallback(async () => {
    const result = await fetchJson<PagedResult<Draft>>('/p1/drafts?limit=20&offset=0');
    setDrafts(result);
  }, [fetchJson]);

  const loadEmailHistory = useCallback(async () => {
    const result = await fetchJson<PagedResult<EmailHistory>>('/p1/email-history?limit=20&offset=0');
    setEmailHistory(result);
  }, [fetchJson]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      await loadJobs();
      await loadProspects();
      await loadRawSnapshots();
      await loadDrafts();
      await loadEmailHistory();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [loadDrafts, loadEmailHistory, loadJobs, loadProspects, loadRawSnapshots]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void loadProspects();
    void loadRawSnapshots();
  }, [loadProspects, loadRawSnapshots]);

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
      setSelectedJobId(created.jobId);
      await refreshAll();
      setNotice(`Đã tạo job ${created.jobId.slice(0, 8)}...`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được search job');
    }
  }

  async function handleGenerateAndSaveReport(): Promise<void> {
    if (!selectedProspectId) return;
    setLoading(true);
    setErrorText(null);
    setNotice(null);

    try {
      const saved = await fetchJson<ProspectCompanyReport>(`/p1/prospects/${selectedProspectId}/report`, {
        method: 'POST',
        body: JSON.stringify({ modelKind: reportModelKind })
      });
      setReport(saved);
      setNotice(`Đã xuất report (${saved.provider}, mode=${reportModelKind}) lúc ${formatDate(saved.generated_at)}.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được report');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDraft(): Promise<void> {
    if (!selectedProspectId) return;
    setLoading(true);
    setErrorText(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ draftId: string }>(`/p1/prospects/${selectedProspectId}/generate-draft`, { method: 'POST' });
      await loadDrafts();
      setNotice(`Đã tạo draft ${result.draftId.slice(0, 8)} và gửi card review qua Telegram.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được draft');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadLatex(): Promise<void> {
    if (!selectedProspectId) return;
    try {
      const response = await fetch(`${apiBase}/p1/prospects/${selectedProspectId}/report/latex`);
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
      const response = await fetch(`${apiBase}/p1/prospects/${selectedProspectId}/report/pdf`);
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

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <div>
            <p className="eyebrow">VNETWORK Sales Platform</p>
            <h1>Full Flow: Discovery → Report → Telegram Review → Send</h1>
            <p>Bản draft được duyệt và chỉnh sửa qua Telegram Bot theo nghiệp vụ CEO/Sales. Web chỉ theo dõi trạng thái.</p>
          </div>
          <label className="apiBox">
            <span>API Base URL</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
          </label>
        </section>

        {errorText ? <div className="alert">{errorText}</div> : null}
        {notice ? <div className="successAlert">{notice}</div> : null}

        <section className="workspaceMainGrid">
          <article className="panel workspaceColumnLeft">
            <h3>Tạo Search Job</h3>
            <form onSubmit={handleCreateSearch} className="workspaceFormGrid">
              <input placeholder="Tên công ty *" value={searchForm.companyName} onChange={(event) => setSearchForm((prev) => ({ ...prev, companyName: event.target.value }))} required />
              <input placeholder="Region" value={searchForm.region} onChange={(event) => setSearchForm((prev) => ({ ...prev, region: event.target.value }))} />
              <input placeholder="Industry" value={searchForm.industry} onChange={(event) => setSearchForm((prev) => ({ ...prev, industry: event.target.value }))} />
              <button type="submit">Bắt đầu tìm</button>
              <button type="button" className="ghostAction" onClick={() => void refreshAll()} disabled={loading}>{loading ? 'Đang tải...' : 'Làm mới dữ liệu'}</button>
            </form>
          </article>

          <article className="panel">
            <div className="panelHead"><h3>Search Jobs</h3><span>{jobs.total} jobs</span></div>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Company</th><th>Status</th><th>Prospects</th><th>Created</th></tr></thead>
                <tbody>
                  {!jobs.items.length ? <tr><td colSpan={4}>Chưa có job.</td></tr> : jobs.items.map((job) => (
                    <tr key={job.id} className={selectedJobId === job.id ? 'selected' : ''} onClick={() => setSelectedJobId(job.id)}>
                      <td>{job.keyword}</td>
                      <td><span className={`statusBadge status-${job.status}`}>{job.status}</span></td>
                      <td>{job.total_prospects}</td>
                      <td>{formatDate(job.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="panel" style={{ marginTop: '0.9rem' }}>
          <div className="panelHead"><h3>Raw Crawl Data</h3><span>{rawSnapshots.total} bản ghi</span></div>
          <div className="toolbar">
            <input placeholder="source" value={rawFilters.source} onChange={(event) => setRawFilters((prev) => ({ ...prev, source: event.target.value }))} />
            <input placeholder="entity type" value={rawFilters.entityType} onChange={(event) => setRawFilters((prev) => ({ ...prev, entityType: event.target.value }))} />
            <button onClick={() => void loadRawSnapshots()} disabled={!selectedJobId || loading}>Lọc dữ liệu</button>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Source</th><th>Entity Type</th><th>Entity Id</th><th>Created</th></tr></thead>
              <tbody>
                {!rawSnapshots.items.length ? <tr><td colSpan={4}>Chưa có raw snapshot.</td></tr> : rawSnapshots.items.map((item) => (
                  <tr key={item.id} className={selectedRawSnapshotId === item.id ? 'selected' : ''} onClick={() => setSelectedRawSnapshotId(item.id)}>
                    <td>{item.source}</td><td>{item.entity_type}</td><td>{item.entity_id ?? '-'}</td><td>{formatDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedRawSnapshot ? <pre className="payloadBox" style={{ marginTop: '0.8rem' }}>{JSON.stringify(selectedRawSnapshot.raw_json, null, 2)}</pre> : null}
        </section>

        <section className="panel" style={{ marginTop: '0.9rem' }}>
          <div className="panelHead"><h3>Prospects</h3><span>{prospects.total} prospects</span></div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Company</th><th>Person</th><th>Email</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>
                {!prospects.items.length ? <tr><td colSpan={5}>Chưa có prospect.</td></tr> : prospects.items.map((prospect) => (
                  <tr key={prospect.id} className={selectedProspectId === prospect.id ? 'selected' : ''} onClick={() => setSelectedProspectId(prospect.id)}>
                    <td>{prospect.company}</td><td>{prospect.person_name}</td><td>{prospect.email ?? '-'}</td><td>{prospect.status}</td><td>{prospect.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inlineActions" style={{ marginTop: '0.8rem' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <span>Model mode:</span>
              <select value={reportModelKind} onChange={(event) => setReportModelKind(event.target.value as ReportModelKind)} disabled={loading}>
                <option value="fast">fast</option>
                <option value="balanced">balanced (mặc định)</option>
                <option value="reasoning">reasoning</option>
              </select>
            </label>
            <button onClick={() => void handleGenerateAndSaveReport()} disabled={!selectedProspectId || loading}>Xuất report AI (toàn bộ key persons)</button>
            <button onClick={() => void handleGenerateDraft()} disabled={!selectedProspectId || loading}>Tạo draft và gửi Telegram review</button>
          </div>
          {selectedProspect ? (
            <p className="notice" style={{ marginTop: '0.7rem' }}>
              Prospect đã chọn: <strong>{selectedProspect.company}</strong> - {selectedProspect.person_name}
              <br />
              <small>Lưu ý: lựa chọn này chỉ là điểm kích hoạt API. Report công ty sẽ tổng hợp tất cả key persons của công ty trong search job hiện tại.</small>
            </p>
          ) : null}
        </section>

        <section className="workspaceBottomGrid" style={{ marginTop: '0.9rem' }}>
          <article className="panel">
            <h3>AI Company Report</h3>
            {report ? (
              <>
                <div className="reportMeta">
                  <span>Provider: {report.provider}</span>
                  <span>Sources: {report.source_count}</span>
                  <span>Score: {report.confidence_score ?? 'N/A'}</span>
                  <button className="ghostAction" onClick={() => void handleDownloadLatex()} type="button">Tải .tex</button>
                  <button className="ghostAction" onClick={() => void handleDownloadPdf()} type="button">Tải PDF (server)</button>
                  <button className="ghostAction" onClick={handleExportReportPdf} type="button">Xuất PDF</button>
                </div>
                {(() => {
                  const json = readObj(report.report_json);
                  if (!json) {
                    return <pre className="payloadBox reportMarkdown">{report.report_markdown}</pre>;
                  }

                  const overview = readObj(json.company_overview) ?? {};
                  const keyPerson = readObj(json.key_person) ?? {};
                  const allKeyPersonsRaw = Array.isArray(json.all_key_persons) ? json.all_key_persons : [];
                  const allKeyPersons = allKeyPersonsRaw
                    .map((item) => readObj(item))
                    .filter((item): item is Record<string, unknown> => item !== null);
                  const buyingSignals = readStrArray(json.buying_signals);
                  const risks = readStrArray(json.risks);
                  const nextSteps = readStrArray(json.recommended_next_steps);
                  const dataQuality = readStrArray(json.data_quality_notes);

                  return (
                    <div className="reportCard">
                      <h4>Tóm tắt điều hành</h4>
                      <p>{readStr(json.executive_summary)}</p>

                      <h4>Company Overview</h4>
                      <div className="reportGrid">
                        <div><strong>Domain:</strong> {readStr(overview.domain)}</div>
                        <div><strong>Industry:</strong> {readStr(overview.industry)}</div>
                        <div><strong>Region:</strong> {readStr(overview.region)}</div>
                      </div>
                      <p><strong>Summary:</strong> {readStr(overview.summary)}</p>

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
                          <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th><th>Confidence</th><th>Source</th></tr></thead>
                          <tbody>
                            {!allKeyPersons.length ? (
                              <tr><td colSpan={6}>N/A</td></tr>
                            ) : allKeyPersons.map((item, idx) => (
                              <tr key={`${readStr(item.name)}-${idx}`}>
                                <td>{readStr(item.name)}</td>
                                <td>{readStr(item.title)}</td>
                                <td>{readStr(item.email)}</td>
                                <td>{readStr(item.phone)}</td>
                                <td>{typeof item.confidence_0_1 === 'number' ? Number(item.confidence_0_1).toFixed(2) : 'N/A'}</td>
                                <td>{readStr(item.source)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <h4>Buying Signals</h4>
                      <ul>{buyingSignals.length ? buyingSignals.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>

                      <h4>Risks</h4>
                      <ul>{risks.length ? risks.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>

                      <h4>Recommended Next Steps</h4>
                      <ul>{nextSteps.length ? nextSteps.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>

                      <h4>Data Quality Notes</h4>
                      <ul>{dataQuality.length ? dataQuality.map((it) => <li key={it}>{it}</li>) : <li>N/A</li>}</ul>
                    </div>
                  );
                })()}
              </>
            ) : <p className="notice">Chưa có report.</p>}
          </article>

          <article className="panel">
            <h3>Telegram Review Queue (không hiển thị nội dung draft)</h3>
            <div className="tableWrap">
              <table>
                <thead><tr><th>Draft</th><th>Status</th><th>Mode</th><th>Edits</th><th>Created</th><th>Approved</th><th>Sent</th></tr></thead>
                <tbody>
                  {!drafts.items.length ? <tr><td colSpan={7}>Chưa có draft.</td></tr> : drafts.items.map((draft) => (
                    <tr key={draft.id}>
                      <td>{draft.id.slice(0, 8)}...</td>
                      <td>{draft.status}</td>
                      <td>{draft.compose_mode}</td>
                      <td>{draft.edit_count}</td>
                      <td>{formatDate(draft.created_at)}</td>
                      <td>{formatDate(draft.approved_at)}</td>
                      <td>{formatDate(draft.sent_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="notice" style={{ marginTop: '0.7rem' }}>
              Chỉnh sửa/approve/reject thực hiện trong Telegram Bot theo đúng quy trình CEO và Sales Team.
            </p>
          </article>
        </section>

        <section className="panel" style={{ marginTop: '0.9rem' }}>
          <div className="panelHead"><h3>Email History (Safe Mode)</h3><span>{emailHistory.total} bản ghi</span></div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Status</th><th>Intended</th><th>Actual</th><th>Redirected</th><th>Subject</th><th>Sent</th></tr></thead>
              <tbody>
                {!emailHistory.items.length ? <tr><td colSpan={6}>Chưa có email history.</td></tr> : emailHistory.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.status}</td>
                    <td>{row.intended_recipient}</td>
                    <td>{row.actual_recipient}</td>
                    <td>{row.redirected ? 'yes' : 'no'}</td>
                    <td>{row.subject}</td>
                    <td>{formatDate(row.sent_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
