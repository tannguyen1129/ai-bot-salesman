'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type PagedResult<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

type SearchJob = {
  id: string;
  keyword: string;
  industry: string | null;
  region: string | null;
  source: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  started_at: string | null;
  completed_at: string | null;
  total_prospects: number;
  error_message: string | null;
  created_at: string;
};

type Prospect = {
  id: string;
  search_job_id: string;
  company: string;
  domain: string | null;
  person_name: string;
  position: string | null;
  email: string | null;
  source: string;
  status: 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived';
  created_at: string;
};

type Draft = {
  id: string;
  prospect_id: string | null;
  company_id: string | null;
  subject: string;
  body_text: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  compose_mode: string;
  edit_count: number;
  reject_reason: string | null;
  created_at: string;
  approved_at: string | null;
  sent_at: string | null;
};

type EmailSafeMode = {
  enableExternalSend: boolean;
  outboundRedirectTarget: string;
  smtpAllowlistDomains: string[];
};

type SafeModePreview = {
  intendedRecipient: string;
  actualRecipient: string;
  redirected: boolean;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  headers: Record<string, string>;
};

type ProspectCompanyReport = {
  id: string;
  prospect_id: string;
  search_job_id: string | null;
  company_name: string;
  report_markdown: string;
  report_json: Record<string, unknown>;
  provider: 'openai' | 'fallback';
  source_count: number;
  confidence_score: string | null;
  generated_at: string;
  updated_at: string;
};

class ApiError extends Error {
  constructor(
    readonly kind: 'HTTP' | 'NETWORK' | 'TIMEOUT' | 'UNKNOWN',
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

const envApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const jobPageSizes = [5, 10, 20];
const prospectPageSizes = [10, 20, 50];
const draftPageSizes = [5, 10, 20];

function resolveApiBase(): string {
  if (typeof window === 'undefined') {
    return envApiBase || 'http://localhost:4000';
  }

  const host = window.location.hostname;
  const protocol = window.location.protocol || 'http:';

  if (envApiBase.trim().length > 0) {
    const pointsToLocalhost = /localhost|127\.0\.0\.1/.test(envApiBase);
    const browsingLocally = host === 'localhost' || host === '127.0.0.1';
    if (!pointsToLocalhost || browsingLocally) {
      return envApiBase;
    }
  }

  return `${protocol}//${host}:4000`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('vi-VN');
}

function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('TIMEOUT', 'Yeu cau timeout, vui long thu lai.');
  }

  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    return new ApiError('NETWORK', 'Khong ket noi duoc API backend.');
  }

  if (error instanceof Error) {
    return new ApiError('UNKNOWN', error.message);
  }

  return new ApiError('UNKNOWN', 'Loi khong xac dinh.');
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  let timeoutId: number | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new ApiError('TIMEOUT', 'Yeu cau timeout, vui long thu lai.'));
    }, timeoutMs);
  });

  try {
    return (await Promise.race([fetch(input, init), timeoutPromise])) as Response;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function jobStatusLabel(status: SearchJob['status']): string {
  if (status === 'queued') return 'Queued';
  if (status === 'running') return 'Running';
  if (status === 'completed') return 'Completed';
  return 'Failed';
}

function draftStatusLabel(status: Draft['status']): string {
  if (status === 'pending_review') return 'Pending Review';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return 'Sent';
}

export default function WorkspacePage() {
  const [apiBase, setApiBase] = useState(resolveApiBase);
  const [detectingApiBase, setDetectingApiBase] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const [jobPage, setJobPage] = useState(1);
  const [jobLimit, setJobLimit] = useState(5);
  const [jobStatusFilter, setJobStatusFilter] = useState<'all' | 'queued' | 'running' | 'completed' | 'failed'>('all');
  const [jobQuery, setJobQuery] = useState('');

  const [prospectPage, setProspectPage] = useState(1);
  const [prospectLimit, setProspectLimit] = useState(10);
  const [prospectStatusFilter, setProspectStatusFilter] = useState<
    'all' | 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived'
  >('all');
  const [prospectQuery, setProspectQuery] = useState('');

  const [draftPage, setDraftPage] = useState(1);
  const [draftLimit, setDraftLimit] = useState(5);
  const [draftStatusFilter, setDraftStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected' | 'sent'>(
    'all'
  );

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);

  const [jobsData, setJobsData] = useState<PagedResult<SearchJob>>({ items: [], total: 0, limit: jobLimit, offset: 0 });
  const [prospectsData, setProspectsData] = useState<PagedResult<Prospect>>({
    items: [],
    total: 0,
    limit: prospectLimit,
    offset: 0
  });
  const [draftsData, setDraftsData] = useState<PagedResult<Draft>>({ items: [], total: 0, limit: draftLimit, offset: 0 });

  const [safeMode, setSafeMode] = useState<EmailSafeMode | null>(null);
  const [safeModePreview, setSafeModePreview] = useState<SafeModePreview | null>(null);
  const [companyReport, setCompanyReport] = useState<ProspectCompanyReport | null>(null);
  const [companyReportLoading, setCompanyReportLoading] = useState(false);

  const [searchForm, setSearchForm] = useState({
    companyName: '',
    region: '',
    industry: ''
  });

  const [editDraftForm, setEditDraftForm] = useState({
    subject: '',
    bodyText: ''
  });

  const [safePreviewForm, setSafePreviewForm] = useState({
    intendedRecipient: '',
    subject: 'Demo outreach - VNETWORK',
    bodyText: 'Xin chao Anh/Chi, em xin phep gui de xuat hop tac ngan gon.'
  });

  const fetchJson = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetchWithTimeout(
        `${apiBase}${path}`,
        {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {})
          }
        },
        15000
      );

      if (!response.ok) {
        const text = await response.text();
        throw new ApiError('HTTP', text || `HTTP ${response.status}`, response.status);
      }

      return response.json() as Promise<T>;
    },
    [apiBase]
  );

  const selectedJob = useMemo(() => jobsData.items.find((item) => item.id === selectedJobId) ?? null, [jobsData.items, selectedJobId]);
  const selectedDraft = useMemo(() => draftsData.items.find((item) => item.id === selectedDraftId) ?? null, [draftsData.items, selectedDraftId]);
  const selectedProspect = useMemo(
    () => prospectsData.items.find((item) => item.id === selectedProspectId) ?? null,
    [prospectsData.items, selectedProspectId]
  );

  const summary = useMemo(() => {
    const runningJobs = jobsData.items.filter((item) => item.status === 'running').length;
    const queuedJobs = jobsData.items.filter((item) => item.status === 'queued').length;
    const pendingDrafts = draftsData.items.filter((item) => item.status === 'pending_review').length;
    const sentDrafts = draftsData.items.filter((item) => item.status === 'sent').length;

    return {
      totalJobs: jobsData.total,
      runningJobs,
      queuedJobs,
      totalProspects: prospectsData.total,
      pendingDrafts,
      sentDrafts
    };
  }, [jobsData, prospectsData, draftsData]);

  const loadJobs = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', String(jobLimit));
    params.set('offset', String((jobPage - 1) * jobLimit));
    if (jobStatusFilter !== 'all') params.set('status', jobStatusFilter);
    if (jobQuery.trim()) params.set('q', jobQuery.trim());

    const result = await fetchJson<PagedResult<SearchJob>>(`/p1/search-jobs?${params.toString()}`);
    setJobsData(result);

    if (!result.items.length) {
      setSelectedJobId(null);
      return;
    }

    if (!selectedJobId || !result.items.some((item) => item.id === selectedJobId)) {
      setSelectedJobId(result.items[0].id);
    }
  }, [fetchJson, jobLimit, jobPage, jobQuery, jobStatusFilter, selectedJobId]);

  const loadProspects = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', String(prospectLimit));
    params.set('offset', String((prospectPage - 1) * prospectLimit));
    if (selectedJobId) params.set('searchJobId', selectedJobId);
    if (prospectStatusFilter !== 'all') params.set('status', prospectStatusFilter);
    if (prospectQuery.trim()) params.set('q', prospectQuery.trim());

    const result = await fetchJson<PagedResult<Prospect>>(`/p1/prospects?${params.toString()}`);
    setProspectsData(result);

    if (!result.items.length) {
      setSelectedProspectId(null);
      setCompanyReport(null);
      return;
    }

    if (!selectedProspectId || !result.items.some((item) => item.id === selectedProspectId)) {
      setSelectedProspectId(result.items[0].id);
    }
  }, [fetchJson, prospectLimit, prospectPage, prospectQuery, prospectStatusFilter, selectedJobId, selectedProspectId]);

  const loadDrafts = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', String(draftLimit));
    params.set('offset', String((draftPage - 1) * draftLimit));
    if (draftStatusFilter !== 'all') params.set('status', draftStatusFilter);

    const result = await fetchJson<PagedResult<Draft>>(`/p1/drafts?${params.toString()}`);
    setDraftsData(result);

    if (!result.items.length) {
      setSelectedDraftId(null);
      return;
    }

    if (!selectedDraftId || !result.items.some((item) => item.id === selectedDraftId)) {
      const picked = result.items[0];
      setSelectedDraftId(picked.id);
      setEditDraftForm({ subject: picked.subject, bodyText: picked.body_text });
    }
  }, [fetchJson, draftLimit, draftPage, draftStatusFilter, selectedDraftId]);

  const loadSafeMode = useCallback(async () => {
    const result = await fetchJson<EmailSafeMode>('/p1/email-safe-mode');
    setSafeMode(result);
  }, [fetchJson]);

  const loadAll = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      setErrorText(null);

      try {
        await Promise.all([loadJobs(), loadProspects(), loadDrafts(), loadSafeMode()]);
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        setErrorText(normalizeError(error).message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [loadDrafts, loadJobs, loadProspects, loadSafeMode]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      setDetectingApiBase(false);
      return;
    }

    let cancelled = false;
    const candidates = Array.from(new Set([apiBase, resolveApiBase(), 'http://localhost:4000']));

    async function detect(): Promise<void> {
      for (const candidate of candidates) {
        try {
          const res = await fetchWithTimeout(`${candidate.replace(/\/$/, '')}/health`, { method: 'GET' }, 6000);
          if (!res.ok) continue;
          if (cancelled) return;
          setApiBase(candidate);
          setDetectingApiBase(false);
          return;
        } catch {
          continue;
        }
      }
      if (!cancelled) setDetectingApiBase(false);
    }

    void detect();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    if (detectingApiBase) return;
    void loadAll();
  }, [detectingApiBase, loadAll]);

  useEffect(() => {
    if (!autoRefresh || detectingApiBase) return;

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void loadAll(true);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, detectingApiBase, loadAll]);

  useEffect(() => {
    if (!selectedDraft) return;
    setEditDraftForm({ subject: selectedDraft.subject, bodyText: selectedDraft.body_text });
  }, [selectedDraft]);

  async function handleCreateSearchJob(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorText(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ jobId: string }>('/p1/search-jobs', {
        method: 'POST',
        body: JSON.stringify({
          companyName: searchForm.companyName,
          keyword: searchForm.companyName,
          region: searchForm.region.trim() || undefined,
          industry: searchForm.industry.trim() || undefined,
          source: 'manual'
        })
      });

      setSearchForm((prev) => ({ ...prev, companyName: '' }));
      setSelectedJobId(result.jobId);
      setJobPage(1);
      setProspectPage(1);
      await loadAll();
      setNotice(`Da tao search job ${result.jobId.slice(0, 8)}...`);
    } catch (error) {
      setErrorText(normalizeError(error).message);
    }
  }

  async function handleRetryJob(id: string): Promise<void> {
    setErrorText(null);
    setNotice(null);
    try {
      await fetchJson(`/p1/search-jobs/${id}/retry`, { method: 'POST' });
      await loadAll();
      setNotice(`Da retry search job ${id.slice(0, 8)}...`);
    } catch (error) {
      setErrorText(normalizeError(error).message);
    }
  }

  async function handleUpdateProspectStatus(
    id: string,
    status: 'new' | 'qualified' | 'contacted' | 'meeting' | 'disqualified' | 'archived'
  ): Promise<void> {
    setErrorText(null);
    setNotice(null);

    try {
      await fetchJson(`/p1/prospects/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, actor: 'sales-operator' })
      });
      await loadProspects();
      setNotice(`Da cap nhat prospect -> ${status}`);
    } catch (error) {
      setErrorText(normalizeError(error).message);
    }
  }

  async function handleGenerateDraft(prospectId: string): Promise<void> {
    setErrorText(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ draftId: string }>(`/p1/prospects/${prospectId}/generate-draft`, {
        method: 'POST'
      });
      await loadDrafts();
      setSelectedDraftId(result.draftId);
      setNotice(`Da tao draft ${result.draftId.slice(0, 8)}...`);
    } catch (error) {
      setErrorText(normalizeError(error).message);
    }
  }

  async function handleLoadCompanyReport(prospectId: string): Promise<void> {
    setCompanyReportLoading(true);
    setErrorText(null);

    try {
      const result = await fetchJson<ProspectCompanyReport>(`/p1/prospects/${prospectId}/report`);
      setCompanyReport(result);
      setSelectedProspectId(prospectId);
      setNotice('Da tai AI report hien co.');
    } catch (error) {
      setCompanyReport(null);
      setErrorText(normalizeError(error).message);
    } finally {
      setCompanyReportLoading(false);
    }
  }

  async function handleGenerateCompanyReport(prospectId: string): Promise<void> {
    setCompanyReportLoading(true);
    setErrorText(null);
    setNotice(null);

    try {
      const result = await fetchJson<ProspectCompanyReport>(`/p1/prospects/${prospectId}/report`, {
        method: 'POST'
      });
      setCompanyReport(result);
      setSelectedProspectId(prospectId);
      setNotice(`Da tao AI report (${result.provider}) cho prospect ${prospectId.slice(0, 8)}...`);
    } catch (error) {
      setCompanyReport(null);
      setErrorText(normalizeError(error).message);
    } finally {
      setCompanyReportLoading(false);
    }
  }

  async function handleReviewDraft(action: 'approve' | 'reject' | 'edit'): Promise<void> {
    if (!selectedDraft) return;
    setErrorText(null);
    setNotice(null);

    try {
      const payload: Record<string, unknown> = {
        action,
        reviewer: 'web-demo'
      };

      if (action === 'edit') {
        payload.subject = editDraftForm.subject;
        payload.bodyText = editDraftForm.bodyText;
      }

      if (action === 'reject') {
        payload.rejectReason = 'rejected_from_web_demo';
      }

      await fetchJson(`/p1/drafts/${selectedDraft.id}/review`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      await loadDrafts();
      setNotice(`Da ${action} draft ${selectedDraft.id.slice(0, 8)}...`);
    } catch (error) {
      setErrorText(normalizeError(error).message);
    }
  }

  async function handleSafeModePreview(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorText(null);
    setNotice(null);

    try {
      const result = await fetchJson<SafeModePreview>('/p1/email-safe-mode/preview', {
        method: 'POST',
        body: JSON.stringify({
          intendedRecipient: safePreviewForm.intendedRecipient,
          subject: safePreviewForm.subject,
          bodyText: safePreviewForm.bodyText,
          draftId: selectedDraft?.id ?? 'WEB-PREVIEW'
        })
      });
      setSafeModePreview(result);
      setNotice('Da tao safe-mode preview.');
    } catch (error) {
      setErrorText(normalizeError(error).message);
    }
  }

  const jobTotalPages = totalPages(jobsData.total, jobLimit);
  const prospectTotalPages = totalPages(prospectsData.total, prospectLimit);
  const draftTotalPages = totalPages(draftsData.total, draftLimit);

  return (
    <main className="page">
      <div className="container workspaceContainer">
        <header className="hero" id="tong-quan">
          <div>
            <p className="eyebrow">SC-02 / SC-03 / SC-04 / SC-07 / SC-08</p>
            <h1>AI Sales Agent - Demo Workspace</h1>
            <p>
              Dashboard demo ngay mai: nhap company, chay discovery that, sinh draft bang AI, duyet qua web/telegram,
              va gui theo Safe Mode ve inbox test.
            </p>
          </div>

          <label className="apiBox">
            <span>API Base URL</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
            <small>{detectingApiBase ? 'Dang tu do API...' : `Dang dung: ${apiBase}`}</small>
          </label>
        </header>

        {errorText ? <div className="alert">{errorText}</div> : null}
        {notice ? <div className="successAlert">{notice}</div> : null}

        <section className="cards workspaceKpis">
          <article className="card">
            <h2>Jobs Today</h2>
            <strong>{summary.totalJobs}</strong>
          </article>
          <article className="card">
            <h2>Running</h2>
            <strong>{summary.runningJobs}</strong>
          </article>
          <article className="card">
            <h2>Draft Pending</h2>
            <strong>{summary.pendingDrafts}</strong>
          </article>
          <article className="card">
            <h2>Sent</h2>
            <strong>{summary.sentDrafts}</strong>
          </article>
        </section>

        <section className="statusRow">
          <label className="switchRow">
            <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
            <span>Auto refresh 5s</span>
          </label>
          <p>
            Last update: {formatDate(lastUpdatedAt)} | Prospects: {summary.totalProspects}
          </p>
        </section>

        <section className="workspaceMainGrid" id="jobs-section">
          <article className="panel workspaceColumnLeft">
            <h3>SC-03 New Search</h3>
            <form onSubmit={handleCreateSearchJob} className="workspaceFormGrid">
              <input
                placeholder="Ten cong ty *"
                value={searchForm.companyName}
                onChange={(event) => setSearchForm((prev) => ({ ...prev, companyName: event.target.value }))}
                required
              />
              <input
                placeholder="Region (tuy chon)"
                value={searchForm.region}
                onChange={(event) => setSearchForm((prev) => ({ ...prev, region: event.target.value }))}
              />
              <input
                placeholder="Industry (tuy chon)"
                value={searchForm.industry}
                onChange={(event) => setSearchForm((prev) => ({ ...prev, industry: event.target.value }))}
              />
              <button type="submit">Bat dau tim</button>
            </form>

            <div className="detailBox">
              <h4>Safe Mode Email</h4>
              <p>
                {safeMode
                  ? `External send: ${String(safeMode.enableExternalSend)} | Redirect: ${safeMode.outboundRedirectTarget}`
                  : 'Dang tai safe mode config...' }
              </p>
              <p>
                Allowlist: {safeMode?.smtpAllowlistDomains?.join(', ') || '-'}
              </p>
            </div>
          </article>

          <article className="panel">
            <div className="panelHead">
              <h3>SC-04 Search Jobs</h3>
              <button onClick={() => void loadAll()} disabled={loading}>{loading ? 'Dang tai...' : 'Lam moi'}</button>
            </div>

            <div className="toolbar">
              <input
                placeholder="Tim theo company"
                value={jobQuery}
                onChange={(event) => {
                  setJobPage(1);
                  setJobQuery(event.target.value);
                }}
              />
              <select
                value={jobStatusFilter}
                onChange={(event) => {
                  setJobPage(1);
                  setJobStatusFilter(event.target.value as typeof jobStatusFilter);
                }}
              >
                <option value="all">All status</option>
                <option value="queued">Queued</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={String(jobLimit)}
                onChange={(event) => {
                  setJobLimit(Number(event.target.value));
                  setJobPage(1);
                }}
              >
                {jobPageSizes.map((size) => (
                  <option key={size} value={size}>{size}/page</option>
                ))}
              </select>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Company Query</th>
                    <th>Region</th>
                    <th>Industry</th>
                    <th>Status</th>
                    <th>Prospects</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsData.items.length === 0 ? (
                    <tr><td colSpan={6}>Chua co job.</td></tr>
                  ) : (
                    jobsData.items.map((job) => (
                      <tr
                        key={job.id}
                        className={selectedJobId === job.id ? 'selected' : ''}
                        onClick={() => {
                          setSelectedJobId(job.id);
                          setProspectPage(1);
                        }}
                      >
                        <td>{job.keyword}</td>
                        <td>{job.region ?? '-'}</td>
                        <td>{job.industry ?? '-'}</td>
                        <td><span className={`statusBadge status-${job.status}`}>{jobStatusLabel(job.status)}</span></td>
                        <td>{job.total_prospects}</td>
                        <td>{formatDate(job.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pager">
              <button disabled={jobPage <= 1} onClick={() => setJobPage((prev) => prev - 1)}>Prev</button>
              <span>Page {jobPage}/{jobTotalPages} ({jobsData.total})</span>
              <button disabled={jobPage >= jobTotalPages} onClick={() => setJobPage((prev) => prev + 1)}>Next</button>
            </div>

            {selectedJob ? (
              <div className="detailBox">
                <h4>Selected Job</h4>
                <p><strong>ID:</strong> {selectedJob.id}</p>
                <p><strong>Status:</strong> {jobStatusLabel(selectedJob.status)}</p>
                <p><strong>Timeline:</strong> {formatDate(selectedJob.started_at)} {'->'} {formatDate(selectedJob.completed_at)}</p>
                {selectedJob.error_message ? <p><strong>Error:</strong> {selectedJob.error_message}</p> : null}
                {selectedJob.status === 'failed' ? (
                  <div className="jobActions"><button onClick={() => void handleRetryJob(selectedJob.id)}>Retry</button></div>
                ) : null}
              </div>
            ) : null}
          </article>
        </section>

        <section className="panel" id="prospects-section" style={{ marginTop: '0.9rem' }}>
          <h3>SC-05 Prospect Pipeline {selectedJobId ? `(job ${selectedJobId.slice(0, 8)}...)` : ''}</h3>

          <div className="toolbar toolbarWide">
            <input
              placeholder="Tim company/person/email"
              value={prospectQuery}
              onChange={(event) => {
                setProspectPage(1);
                setProspectQuery(event.target.value);
              }}
            />
            <select
              value={prospectStatusFilter}
              onChange={(event) => {
                setProspectPage(1);
                setProspectStatusFilter(event.target.value as typeof prospectStatusFilter);
              }}
            >
              <option value="all">All status</option>
              <option value="new">new</option>
              <option value="qualified">qualified</option>
              <option value="contacted">contacted</option>
              <option value="meeting">meeting</option>
              <option value="disqualified">disqualified</option>
              <option value="archived">archived</option>
            </select>
            <select
              value={String(prospectLimit)}
              onChange={(event) => {
                setProspectLimit(Number(event.target.value));
                setProspectPage(1);
              }}
            >
              {prospectPageSizes.map((size) => (
                <option key={size} value={size}>{size}/page</option>
              ))}
            </select>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Person</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {prospectsData.items.length === 0 ? (
                  <tr><td colSpan={7}>Chua co prospect.</td></tr>
                ) : (
                  prospectsData.items.map((prospect) => (
                    <tr
                      key={prospect.id}
                      className={selectedProspectId === prospect.id ? 'selected' : ''}
                      onClick={() => setSelectedProspectId(prospect.id)}
                    >
                      <td>{prospect.company}</td>
                      <td>{prospect.person_name}</td>
                      <td>{prospect.email ?? '-'}</td>
                      <td>{prospect.status}</td>
                      <td>{prospect.source}</td>
                      <td>{formatDate(prospect.created_at)}</td>
                      <td>
                        <div className="inlineActions">
                          <select
                            value={prospect.status}
                            onChange={(event) =>
                              void handleUpdateProspectStatus(
                                prospect.id,
                                event.target.value as
                                  | 'new'
                                  | 'qualified'
                                  | 'contacted'
                                  | 'meeting'
                                  | 'disqualified'
                                  | 'archived'
                              )
                            }
                          >
                            <option value="new">new</option>
                            <option value="qualified">qualified</option>
                            <option value="contacted">contacted</option>
                            <option value="meeting">meeting</option>
                            <option value="disqualified">disqualified</option>
                            <option value="archived">archived</option>
                          </select>
                          <button className="smallBtn" onClick={() => void handleGenerateDraft(prospect.id)}>Generate Draft</button>
                          <button className="smallBtn" onClick={() => void handleLoadCompanyReport(prospect.id)}>Load Report</button>
                          <button className="smallBtn" onClick={() => void handleGenerateCompanyReport(prospect.id)}>AI Report</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button disabled={prospectPage <= 1} onClick={() => setProspectPage((prev) => prev - 1)}>Prev</button>
            <span>Page {prospectPage}/{prospectTotalPages} ({prospectsData.total})</span>
            <button disabled={prospectPage >= prospectTotalPages} onClick={() => setProspectPage((prev) => prev + 1)}>Next</button>
          </div>
        </section>

        <section className="panel companyReportPanel" style={{ marginTop: '0.9rem' }}>
          <div className="panelHead">
            <h3>AI Company Report</h3>
            {selectedProspect ? (
              <div className="inlineActions">
                <button className="smallBtn" onClick={() => void handleLoadCompanyReport(selectedProspect.id)} disabled={companyReportLoading}>
                  {companyReportLoading ? 'Loading...' : 'Load'}
                </button>
                <button className="smallBtn" onClick={() => void handleGenerateCompanyReport(selectedProspect.id)} disabled={companyReportLoading}>
                  {companyReportLoading ? 'Generating...' : 'Generate/Refresh'}
                </button>
              </div>
            ) : null}
          </div>

          {selectedProspect ? (
            <p className="notice" style={{ marginTop: '0.4rem' }}>
              Prospect: <strong>{selectedProspect.company}</strong> - {selectedProspect.person_name} ({selectedProspect.email ?? 'no-email'})
            </p>
          ) : (
            <p className="notice">Chon 1 prospect de xem hoac tao bao cao AI.</p>
          )}

          {companyReport ? (
            <div>
              <div className="reportMeta">
                <span>Provider: {companyReport.provider}</span>
                <span>Generated: {formatDate(companyReport.generated_at)}</span>
                <span>Sources: {companyReport.source_count}</span>
                <span>Score: {companyReport.confidence_score ?? 'N/A'}</span>
              </div>
              <pre className="payloadBox reportMarkdown">{companyReport.report_markdown}</pre>
            </div>
          ) : (
            <p className="notice">Chua co report. Bam Generate/Refresh de AI tong hop bao cao cong ty.</p>
          )}
        </section>

        <section className="workspaceBottomGrid" style={{ marginTop: '0.9rem' }}>
          <article className="panel">
            <div className="panelHead">
              <h3>SC-07 Draft Inbox</h3>
              <span className="eyebrow" style={{ margin: 0 }}>Review Queue</span>
            </div>

            <div className="toolbar">
              <input disabled value="Email channel" />
              <select
                value={draftStatusFilter}
                onChange={(event) => {
                  setDraftPage(1);
                  setDraftStatusFilter(event.target.value as typeof draftStatusFilter);
                }}
              >
                <option value="all">All drafts</option>
                <option value="pending_review">pending_review</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
                <option value="sent">sent</option>
              </select>
              <select
                value={String(draftLimit)}
                onChange={(event) => {
                  setDraftLimit(Number(event.target.value));
                  setDraftPage(1);
                }}
              >
                {draftPageSizes.map((size) => (
                  <option key={size} value={size}>{size}/page</option>
                ))}
              </select>
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Draft</th>
                    <th>Status</th>
                    <th>Mode</th>
                    <th>Edits</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {draftsData.items.length === 0 ? (
                    <tr><td colSpan={5}>Chua co draft.</td></tr>
                  ) : (
                    draftsData.items.map((draft) => (
                      <tr key={draft.id} className={selectedDraftId === draft.id ? 'selected' : ''} onClick={() => setSelectedDraftId(draft.id)}>
                        <td>{draft.id.slice(0, 8)}...</td>
                        <td>{draftStatusLabel(draft.status)}</td>
                        <td>{draft.compose_mode}</td>
                        <td>{draft.edit_count}</td>
                        <td>{formatDate(draft.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pager">
              <button disabled={draftPage <= 1} onClick={() => setDraftPage((prev) => prev - 1)}>Prev</button>
              <span>Page {draftPage}/{draftTotalPages} ({draftsData.total})</span>
              <button disabled={draftPage >= draftTotalPages} onClick={() => setDraftPage((prev) => prev + 1)}>Next</button>
            </div>
          </article>

          <article className="panel">
            <h3>SC-08 Draft Editor / Review</h3>
            {selectedDraft ? (
              <div className="draftEditor">
                <label>
                  Subject
                  <input
                    value={editDraftForm.subject}
                    onChange={(event) => setEditDraftForm((prev) => ({ ...prev, subject: event.target.value }))}
                  />
                </label>

                <label>
                  Body Text
                  <textarea
                    value={editDraftForm.bodyText}
                    onChange={(event) => setEditDraftForm((prev) => ({ ...prev, bodyText: event.target.value }))}
                  />
                </label>

                <div className="inlineActions">
                  <button onClick={() => void handleReviewDraft('edit')}>Save Edit</button>
                  <button onClick={() => void handleReviewDraft('approve')}>Approve</button>
                  <button className="dangerBtn" onClick={() => void handleReviewDraft('reject')}>Reject</button>
                </div>

                <div className="detailBox">
                  <p><strong>Status:</strong> {draftStatusLabel(selectedDraft.status)}</p>
                  <p><strong>Approved At:</strong> {formatDate(selectedDraft.approved_at)}</p>
                  <p><strong>Sent At:</strong> {formatDate(selectedDraft.sent_at)}</p>
                  {selectedDraft.reject_reason ? <p><strong>Reject Reason:</strong> {selectedDraft.reject_reason}</p> : null}
                </div>
              </div>
            ) : (
              <p>Chon mot draft de review.</p>
            )}
          </article>
        </section>

        <section className="panel" style={{ marginTop: '0.9rem' }}>
          <h3>Email Safe Mode Preview</h3>
          <form className="safePreviewForm" onSubmit={handleSafeModePreview}>
            <input
              placeholder="Intended recipient"
              value={safePreviewForm.intendedRecipient}
              onChange={(event) => setSafePreviewForm((prev) => ({ ...prev, intendedRecipient: event.target.value }))}
              required
            />
            <input
              placeholder="Subject"
              value={safePreviewForm.subject}
              onChange={(event) => setSafePreviewForm((prev) => ({ ...prev, subject: event.target.value }))}
              required
            />
            <textarea
              placeholder="Body text"
              value={safePreviewForm.bodyText}
              onChange={(event) => setSafePreviewForm((prev) => ({ ...prev, bodyText: event.target.value }))}
            />
            <button type="submit">Preview Redirect</button>
          </form>

          {safeModePreview ? (
            <pre className="payloadBox">{JSON.stringify(safeModePreview, null, 2)}</pre>
          ) : (
            <p className="notice">Nhap recipient va subject de xem subject/banner/header sau redirect.</p>
          )}
        </section>
      </div>
    </main>
  );
}
