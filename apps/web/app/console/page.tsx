'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type PagedResult<T> = { items: T[]; total: number; limit: number; offset: number };

type SearchJob = {
  id: string;
  keyword: string;
  industry: string | null;
  region: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  total_prospects: number;
  created_at: string;
};

type Prospect = {
  id: string;
  company: string;
  person_name: string;
  email: string | null;
  status: string;
  source: string;
};

type Draft = {
  id: string;
  subject: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'sent';
  compose_mode: string;
  edit_count: number;
  created_at: string;
};

type Template = {
  id: string;
  industry: string;
  subject_template: string;
  body_template: string;
  version: number;
};

type TemplateCandidate = {
  id: string;
  draft_id: string;
  template_key: string;
  promoted: boolean;
  similarity_score: string | null;
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

export default function ConsolePage() {
  const [apiBase, setApiBase] = useState(resolveApiBase);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [jobs, setJobs] = useState<PagedResult<SearchJob>>({ items: [], total: 0, limit: 10, offset: 0 });
  const [drafts, setDrafts] = useState<PagedResult<Draft>>({ items: [], total: 0, limit: 10, offset: 0 });
  const [prospects, setProspects] = useState<PagedResult<Prospect>>({ items: [], total: 0, limit: 10, offset: 0 });
  const [templates, setTemplates] = useState<PagedResult<Template>>({ items: [], total: 0, limit: 10, offset: 0 });
  const [candidates, setCandidates] = useState<PagedResult<TemplateCandidate>>({ items: [], total: 0, limit: 10, offset: 0 });
  const [templateForm, setTemplateForm] = useState({ industry: '', subjectTemplate: '', bodyTemplate: '' });

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = useMemo(() => jobs.items.find((item) => item.id === selectedJobId) ?? null, [jobs.items, selectedJobId]);

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

  const loadJobs = useCallback(async () => {
    const result = await fetchJson<PagedResult<SearchJob>>('/p1/search-jobs?limit=10&offset=0');
    setJobs(result);
    if (!selectedJobId && result.items.length) setSelectedJobId(result.items[0].id);
  }, [fetchJson, selectedJobId]);

  const loadProspects = useCallback(async () => {
    const query = selectedJobId
      ? `/p1/prospects?searchJobId=${encodeURIComponent(selectedJobId)}&limit=10&offset=0`
      : '/p1/prospects?limit=10&offset=0';
    const result = await fetchJson<PagedResult<Prospect>>(query);
    setProspects(result);
  }, [fetchJson, selectedJobId]);

  const loadDrafts = useCallback(async () => {
    const result = await fetchJson<PagedResult<Draft>>('/p1/drafts?limit=10&offset=0');
    setDrafts(result);
  }, [fetchJson]);

  const loadTemplates = useCallback(async () => {
    const result = await fetchJson<PagedResult<Template>>('/p1/templates?limit=10&offset=0');
    setTemplates(result);
  }, [fetchJson]);

  const loadCandidates = useCallback(async () => {
    const result = await fetchJson<PagedResult<TemplateCandidate>>('/p1/template-candidates?limit=10&offset=0');
    setCandidates(result);
  }, [fetchJson]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      await Promise.all([loadJobs(), loadProspects(), loadDrafts(), loadTemplates(), loadCandidates()]);
      setNotice('Đã làm mới dữ liệu operations.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [loadCandidates, loadDrafts, loadJobs, loadProspects, loadTemplates]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void loadProspects();
  }, [loadProspects]);

  async function retrySelectedJob(): Promise<void> {
    if (!selectedJob) return;
    setErrorText(null);
    setNotice(null);

    try {
      await fetchJson(`/p1/search-jobs/${selectedJob.id}/retry`, { method: 'POST' });
      await refresh();
      setNotice(`Đã retry job ${selectedJob.id.slice(0, 8)}...`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Retry thất bại');
    }
  }

  async function createTemplate(): Promise<void> {
    if (!templateForm.industry.trim() || !templateForm.subjectTemplate.trim() || !templateForm.bodyTemplate.trim()) return;
    try {
      await fetchJson('/p1/templates', {
        method: 'POST',
        body: JSON.stringify({
          industry: templateForm.industry.trim(),
          subjectTemplate: templateForm.subjectTemplate.trim(),
          bodyTemplate: templateForm.bodyTemplate.trim(),
          status: 'active'
        })
      });
      setTemplateForm({ industry: '', subjectTemplate: '', bodyTemplate: '' });
      await loadTemplates();
      setNotice('Đã tạo template mới.');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tạo được template');
    }
  }

  async function runPromote(): Promise<void> {
    try {
      const result = await fetchJson<{ promoted: number }>('/p1/template-learning/promote', { method: 'POST' });
      await loadTemplates();
      await loadCandidates();
      setNotice(`Template Learning đã promote ${result.promoted} nhóm.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Promote thất bại');
    }
  }

  const runningJobs = jobs.items.filter((item) => item.status === 'running').length;
  const failedJobs = jobs.items.filter((item) => item.status === 'failed').length;
  const pendingDrafts = drafts.items.filter((item) => item.status === 'pending_review').length;

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <div>
            <p className="eyebrow">Operations Console</p>
            <h1>Giám sát và điều phối pipeline</h1>
            <p>Trang điều hành nhanh cho team vận hành: theo dõi trạng thái jobs, prospects và draft queue.</p>
          </div>
          <label className="apiBox">
            <span>API Base URL</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
          </label>
        </section>

        {errorText ? <div className="alert">{errorText}</div> : null}
        {notice ? <div className="successAlert">{notice}</div> : null}

        <section className="cards">
          <article className="card"><h2>Total Jobs</h2><strong>{jobs.total}</strong></article>
          <article className="card"><h2>Running</h2><strong>{runningJobs}</strong></article>
          <article className="card"><h2>Failed</h2><strong>{failedJobs}</strong></article>
          <article className="card"><h2>Pending Drafts</h2><strong>{pendingDrafts}</strong></article>
        </section>

        <section className="panel">
          <div className="panelHead">
            <h3>Search Jobs</h3>
            <button onClick={() => void refresh()} disabled={loading}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>Company</th><th>Status</th><th>Prospects</th><th>Created</th></tr>
              </thead>
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

          {selectedJob ? (
            <div className="detailBox">
              <p><strong>Selected:</strong> {selectedJob.id}</p>
              <p><strong>Region:</strong> {selectedJob.region ?? '-'}</p>
              <p><strong>Industry:</strong> {selectedJob.industry ?? '-'}</p>
              {selectedJob.status === 'failed' ? (
                <div className="inlineActions" style={{ marginTop: '0.5rem' }}>
                  <button onClick={() => void retrySelectedJob()}>Retry Job</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="workspaceBottomGrid" style={{ marginTop: '0.9rem' }}>
          <article className="panel">
            <h3>Prospects (Top 10)</h3>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr><th>Company</th><th>Person</th><th>Email</th><th>Status</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {!prospects.items.length ? <tr><td colSpan={5}>Chưa có prospect.</td></tr> : prospects.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.company}</td>
                      <td>{item.person_name}</td>
                      <td>{item.email ?? '-'}</td>
                      <td>{item.status}</td>
                      <td>{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <h3>Draft Queue (Top 10)</h3>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr><th>Draft</th><th>Status</th><th>Mode</th><th>Edits</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {!drafts.items.length ? <tr><td colSpan={5}>Chưa có draft.</td></tr> : drafts.items.map((draft) => (
                    <tr key={draft.id}>
                      <td>{draft.subject}</td>
                      <td>{draft.status}</td>
                      <td>{draft.compose_mode}</td>
                      <td>{draft.edit_count}</td>
                      <td>{formatDate(draft.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <section className="panel" style={{ marginTop: '0.9rem' }}>
          <div className="panelHead">
            <h3>Template Library</h3>
            <button onClick={() => void runPromote()}>Run Promote (BR-23)</button>
          </div>
          <div className="workspaceFormGrid" style={{ marginBottom: '0.8rem' }}>
            <input placeholder="industry key" value={templateForm.industry} onChange={(e) => setTemplateForm((p) => ({ ...p, industry: e.target.value }))} />
            <input placeholder="subject template" value={templateForm.subjectTemplate} onChange={(e) => setTemplateForm((p) => ({ ...p, subjectTemplate: e.target.value }))} />
            <input placeholder="body template" value={templateForm.bodyTemplate} onChange={(e) => setTemplateForm((p) => ({ ...p, bodyTemplate: e.target.value }))} />
            <button onClick={() => void createTemplate()}>Add Template</button>
          </div>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Industry</th><th>Version</th><th>Subject</th></tr></thead>
              <tbody>
                {!templates.items.length ? <tr><td colSpan={3}>Chưa có template.</td></tr> : templates.items.map((t) => (
                  <tr key={t.id}><td>{t.industry}</td><td>{t.version}</td><td>{t.subject_template}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style={{ marginTop: '0.8rem' }}>Template Candidates</h3>
          <div className="tableWrap">
            <table>
              <thead><tr><th>Template Key</th><th>Draft</th><th>Promoted</th><th>Similarity</th><th>Created</th></tr></thead>
              <tbody>
                {!candidates.items.length ? <tr><td colSpan={5}>Chưa có candidate.</td></tr> : candidates.items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.template_key}</td>
                    <td>{c.draft_id.slice(0, 8)}...</td>
                    <td>{c.promoted ? 'yes' : 'no'}</td>
                    <td>{c.similarity_score ?? '-'}</td>
                    <td>{formatDate(c.created_at)}</td>
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
