'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type PagedResult<T> = { items: T[]; total: number; limit: number; offset: number };

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

type DraftStatusFilter = 'pending_review' | 'approved' | 'rejected' | 'sent' | 'all';
type ConsoleTab = 'review' | 'jobs' | 'mail' | 'templates';

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

function mapDraftStatusLabel(status: Draft['status']): string {
  if (status === 'pending_review') return 'Chờ duyệt';
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'rejected') return 'Từ chối';
  return 'Đã gửi';
}

export default function ConsolePage() {
  const apiBaseRef = useRef(resolveApiBase());
  const [tab, setTab] = useState<ConsoleTab>('review');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [draftFilter, setDraftFilter] = useState<DraftStatusFilter>('pending_review');
  const [drafts, setDrafts] = useState<PagedResult<Draft>>({ items: [], total: 0, limit: 50, offset: 0 });
  const [draftsAll, setDraftsAll] = useState<PagedResult<Draft>>({ items: [], total: 0, limit: 100, offset: 0 });
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editDirty, setEditDirty] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [jobs, setJobs] = useState<PagedResult<SearchJob>>({ items: [], total: 0, limit: 30, offset: 0 });
  const [emailHistory, setEmailHistory] = useState<PagedResult<EmailHistory>>({ items: [], total: 0, limit: 30, offset: 0 });
  const [emailFilter, setEmailFilter] = useState<'all' | 'sent' | 'failed' | 'bounced' | 'delivered'>('all');

  const [templates, setTemplates] = useState<PagedResult<Template>>({ items: [], total: 0, limit: 20, offset: 0 });
  const [candidates, setCandidates] = useState<PagedResult<TemplateCandidate>>({ items: [], total: 0, limit: 20, offset: 0 });
  const [templateForm, setTemplateForm] = useState({ industry: '', subjectTemplate: '', bodyTemplate: '' });

  const fetchJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(`${apiBaseRef.current}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }, []);

  const loadDrafts = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', '50');
    params.set('offset', '0');
    if (draftFilter !== 'all') params.set('status', draftFilter);

    const result = await fetchJson<PagedResult<Draft>>(`/p1/drafts?${params.toString()}`);
    setDrafts(result);

    if (!result.items.some((item) => item.id === selectedDraftId)) {
      setSelectedDraftId(result.items[0]?.id ?? null);
    }
  }, [fetchJson, draftFilter, selectedDraftId]);

  const loadDraftsSummary = useCallback(async () => {
    const result = await fetchJson<PagedResult<Draft>>('/p1/drafts?limit=100&offset=0');
    setDraftsAll(result);
  }, [fetchJson]);

  const loadJobs = useCallback(async () => {
    const result = await fetchJson<PagedResult<SearchJob>>('/p1/search-jobs?limit=30&offset=0');
    setJobs(result);
  }, [fetchJson]);

  const loadEmailHistory = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('limit', '30');
    params.set('offset', '0');
    if (emailFilter !== 'all') params.set('status', emailFilter);
    const result = await fetchJson<PagedResult<EmailHistory>>(`/p1/email-history?${params.toString()}`);
    setEmailHistory(result);
  }, [fetchJson, emailFilter]);

  const loadTemplates = useCallback(async () => {
    const result = await fetchJson<PagedResult<Template>>('/p1/templates?limit=20&offset=0');
    setTemplates(result);
  }, [fetchJson]);

  const loadCandidates = useCallback(async () => {
    const result = await fetchJson<PagedResult<TemplateCandidate>>('/p1/template-candidates?limit=20&offset=0');
    setCandidates(result);
  }, [fetchJson]);

  const refreshActive = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      await loadDraftsSummary();
      if (tab === 'review') await loadDrafts();
      else if (tab === 'jobs') await loadJobs();
      else if (tab === 'mail') await loadEmailHistory();
      else if (tab === 'templates') {
        await loadTemplates();
        await loadCandidates();
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [tab, loadDrafts, loadDraftsSummary, loadJobs, loadEmailHistory, loadTemplates, loadCandidates]);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const selectedDraft = useMemo(
    () => drafts.items.find((item) => item.id === selectedDraftId) ?? null,
    [drafts.items, selectedDraftId]
  );

  useEffect(() => {
    if (selectedDraft) {
      setEditSubject(selectedDraft.subject);
      setEditBody(selectedDraft.body_text);
      setEditDirty(false);
      setShowRejectInput(false);
      setRejectReason('');
    }
  }, [selectedDraft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingDrafts = draftsAll.items.filter((item) => item.status === 'pending_review').length;
  const sentDrafts = draftsAll.items.filter((item) => item.status === 'sent').length;
  const failedJobs = jobs.items.filter((item) => item.status === 'failed').length;
  const bouncedCount = emailHistory.items.filter((item) => item.status === 'bounced').length;

  async function handleReview(action: 'approve' | 'reject' | 'edit'): Promise<void> {
    if (!selectedDraft) return;
    setLoading(true);
    setErrorText(null);
    setNotice(null);

    try {
      const body: Record<string, unknown> = { action, reviewer: 'sales-operator' };
      if (action === 'edit') {
        body.subject = editSubject.trim();
        body.bodyText = editBody;
      }
      if (action === 'reject' && rejectReason.trim()) {
        body.rejectReason = rejectReason.trim();
      }

      await fetchJson(`/p1/drafts/${selectedDraft.id}/review`, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      setNotice(
        action === 'approve'
          ? `Đã approve draft ${selectedDraft.id.slice(0, 8)} — pipeline sẽ gửi qua Safe Mode.`
          : action === 'reject'
          ? `Đã reject draft ${selectedDraft.id.slice(0, 8)}.`
          : `Đã lưu chỉnh sửa draft ${selectedDraft.id.slice(0, 8)}.`
      );

      setShowRejectInput(false);
      setRejectReason('');
      await loadDrafts();
      await loadDraftsSummary();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Thao tác thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryJob(jobId: string): Promise<void> {
    setLoading(true);
    setErrorText(null);
    setNotice(null);

    try {
      await fetchJson(`/p1/search-jobs/${jobId}/retry`, { method: 'POST' });
      await loadJobs();
      setNotice(`Đã retry job ${jobId.slice(0, 8)}.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Retry thất bại');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTemplate(): Promise<void> {
    if (!templateForm.industry.trim() || !templateForm.subjectTemplate.trim() || !templateForm.bodyTemplate.trim()) return;
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }

  async function handlePromote(): Promise<void> {
    setLoading(true);
    try {
      const result = await fetchJson<{ promoted: number }>('/p1/template-learning/promote', { method: 'POST' });
      await loadTemplates();
      await loadCandidates();
      setNotice(`Template Learning đã promote ${result.promoted} nhóm.`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Promote thất bại');
    } finally {
      setLoading(false);
    }
  }

  const draftEmailHistory = useMemo(() => {
    if (!selectedDraft) return [];
    return emailHistory.items.filter((row) => row.draft_id === selectedDraft.id);
  }, [emailHistory.items, selectedDraft]);

  return (
    <main className="page opPage">
      <div className="opShell">
        {/* TOPBAR */}
        <header className="opTopbar">
          <div className="opTopbarMain">
            <p className="eyebrow">Operations</p>
            <h1>Duyệt draft &amp; điều phối pipeline</h1>
          </div>
          <div className="opTopbarKpis">
            <span className="opKpi opKpiHot">
              <strong>{pendingDrafts}</strong> chờ duyệt
            </span>
            <span className="opKpi">
              <strong>{sentDrafts}</strong> đã gửi
            </span>
            <span className={`opKpi ${failedJobs > 0 ? 'opKpiAlert' : ''}`}>
              <strong>{failedJobs}</strong> job lỗi
            </span>
            <span className={`opKpi ${bouncedCount > 0 ? 'opKpiAlert' : ''}`}>
              <strong>{bouncedCount}</strong> bounce
            </span>
            <button type="button" className="ghostAction" onClick={() => void refreshActive()} disabled={loading}>
              {loading ? 'Đang tải…' : 'Làm mới'}
            </button>
          </div>
        </header>

        {/* TABS */}
        <nav className="opTabs">
          <button type="button" className={`opTab ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>
            Duyệt draft
            {pendingDrafts > 0 ? <span className="opTabBadge">{pendingDrafts}</span> : null}
          </button>
          <button type="button" className={`opTab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>
            Search jobs
            {failedJobs > 0 ? <span className="opTabBadge opTabBadgeAlert">{failedJobs}</span> : null}
          </button>
          <button type="button" className={`opTab ${tab === 'mail' ? 'active' : ''}`} onClick={() => setTab('mail')}>
            Email log
          </button>
          <button type="button" className={`opTab ${tab === 'templates' ? 'active' : ''}`} onClick={() => setTab('templates')}>
            Templates
          </button>
        </nav>

        {errorText ? <div className="alert opAlert">{errorText}</div> : null}
        {notice ? <div className="successAlert opAlert">{notice}</div> : null}

        {/* === TAB: DRAFT REVIEW === */}
        {tab === 'review' ? (
          <div className="opReviewBody">
            <aside className="opReviewSidebar">
              <div className="opReviewFilters">
                {(['pending_review', 'approved', 'sent', 'rejected', 'all'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rsFilterChip ${draftFilter === value ? 'active' : ''}`}
                    onClick={() => setDraftFilter(value)}
                  >
                    {value === 'pending_review' ? 'Chờ duyệt'
                      : value === 'approved' ? 'Đã duyệt'
                      : value === 'sent' ? 'Đã gửi'
                      : value === 'rejected' ? 'Từ chối'
                      : 'Tất cả'}
                  </button>
                ))}
              </div>

              <div className="opDraftList">
                {!drafts.items.length ? (
                  <p className="rsEmpty">Không có draft nào trong bộ lọc này.</p>
                ) : (
                  drafts.items.map((draft) => (
                    <button
                      key={draft.id}
                      type="button"
                      className={`opDraftRow ${selectedDraftId === draft.id ? 'selected' : ''}`}
                      onClick={() => setSelectedDraftId(draft.id)}
                    >
                      <div className="opDraftRowTop">
                        <strong>{draft.subject || '(không có subject)'}</strong>
                        <span className={`statusBadge status-${draft.status}`}>{mapDraftStatusLabel(draft.status)}</span>
                      </div>
                      <div className="opDraftRowMeta">
                        <span>{draft.compose_mode}</span>
                        {draft.edit_count > 0 ? <span>· edit ×{draft.edit_count}</span> : null}
                        <span className="opDraftRowWhen">{formatRelative(draft.created_at)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>

            <section className="opReviewDetail">
              {!selectedDraft ? (
                <div className="opReviewEmpty">
                  <p className="eyebrow">Chưa chọn draft</p>
                  <h2>Chọn một draft ở bên trái để xem chi tiết và duyệt.</h2>
                  <p>Bạn có thể chỉnh sửa subject/body, approve để pipeline gửi qua Safe Mode, hoặc reject với lý do.</p>
                </div>
              ) : (
                <>
                  <header className="opReviewHead">
                    <div>
                      <p className="eyebrow">
                        Draft {selectedDraft.id.slice(0, 8)} · {selectedDraft.compose_mode}
                        {selectedDraft.edit_count > 0 ? ` · ${selectedDraft.edit_count} edit` : ''}
                      </p>
                      <h2>Email gửi tới {selectedDraft.prospect_id ? <span className="opMute">prospect {selectedDraft.prospect_id.slice(0, 8)}</span> : 'unknown'}</h2>
                    </div>
                    <span className={`statusBadge status-${selectedDraft.status}`}>{mapDraftStatusLabel(selectedDraft.status)}</span>
                  </header>

                  <div className="opEmailFields">
                    <label className="opEmailField">
                      <span>Subject</span>
                      <input
                        value={editSubject}
                        onChange={(event) => { setEditSubject(event.target.value); setEditDirty(true); }}
                        disabled={selectedDraft.status !== 'pending_review' || loading}
                      />
                    </label>

                    <label className="opEmailField">
                      <span>Body</span>
                      <textarea
                        className="opEmailBody"
                        value={editBody}
                        onChange={(event) => { setEditBody(event.target.value); setEditDirty(true); }}
                        disabled={selectedDraft.status !== 'pending_review' || loading}
                        rows={16}
                      />
                    </label>
                  </div>

                  {selectedDraft.status === 'pending_review' ? (
                    <div className="opReviewActions">
                      <button
                        type="button"
                        className="opActionApprove"
                        onClick={() => void handleReview('approve')}
                        disabled={loading || editDirty}
                        title={editDirty ? 'Bạn đang có chỉnh sửa chưa lưu. Lưu trước hoặc approve sau.' : 'Approve và gửi qua Safe Mode'}
                      >
                        ✓ Approve &amp; gửi
                      </button>

                      <button
                        type="button"
                        className="opActionEdit"
                        onClick={() => void handleReview('edit')}
                        disabled={loading || !editDirty}
                        title={editDirty ? 'Lưu chỉnh sửa, vẫn ở trạng thái pending_review' : 'Chỉnh sửa subject/body để bật nút này'}
                      >
                        ✎ Lưu chỉnh sửa
                      </button>

                      <button
                        type="button"
                        className="opActionReject"
                        onClick={() => setShowRejectInput((prev) => !prev)}
                        disabled={loading}
                      >
                        ✗ Reject…
                      </button>
                    </div>
                  ) : (
                    <div className="opReviewLocked">
                      Draft đã được {mapDraftStatusLabel(selectedDraft.status).toLowerCase()}.
                      {selectedDraft.reject_reason ? <span> Lý do: <em>{selectedDraft.reject_reason}</em></span> : null}
                      {selectedDraft.approved_at ? <span> · approved {formatRelative(selectedDraft.approved_at)}</span> : null}
                      {selectedDraft.sent_at ? <span> · sent {formatRelative(selectedDraft.sent_at)}</span> : null}
                    </div>
                  )}

                  {showRejectInput && selectedDraft.status === 'pending_review' ? (
                    <div className="opRejectBox">
                      <label>
                        <span>Lý do reject (tuỳ chọn)</span>
                        <input
                          autoFocus
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="Ví dụ: subject không phù hợp ngành banking"
                        />
                      </label>
                      <div className="opRejectActions">
                        <button type="button" className="ghostAction" onClick={() => setShowRejectInput(false)}>Huỷ</button>
                        <button type="button" className="dangerBtn" onClick={() => void handleReview('reject')} disabled={loading}>
                          Xác nhận reject
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {draftEmailHistory.length > 0 ? (
                    <section className="opDraftHistory">
                      <h3>Email log cho draft này</h3>
                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Status</th>
                              <th>Intended</th>
                              <th>Actual</th>
                              <th>Redirect</th>
                              <th>Sent</th>
                            </tr>
                          </thead>
                          <tbody>
                            {draftEmailHistory.map((row) => (
                              <tr key={row.id}>
                                <td><span className={`statusBadge status-${row.status}`}>{row.status}</span></td>
                                <td>{row.intended_recipient}</td>
                                <td>{row.actual_recipient}</td>
                                <td>{row.redirected ? 'yes' : 'no'}</td>
                                <td>{formatDate(row.sent_at ?? row.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ) : null}

                  <p className="opTelegramNote">
                    Bạn cũng có thể duyệt qua Telegram. Hành động ở đây và Telegram đều cùng API.
                  </p>
                </>
              )}
            </section>
          </div>
        ) : null}

        {/* === TAB: SEARCH JOBS === */}
        {tab === 'jobs' ? (
          <section className="opBlock">
            <header className="opBlockHead">
              <div>
                <p className="eyebrow">Discovery</p>
                <h2>Search jobs gần đây</h2>
              </div>
              <span className="rsMetaChip">{jobs.total} job</span>
            </header>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Công ty</th>
                    <th>Status</th>
                    <th>Region · Industry</th>
                    <th>Prospect</th>
                    <th>Tạo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {!jobs.items.length ? (
                    <tr><td colSpan={6}>Chưa có job.</td></tr>
                  ) : (
                    jobs.items.map((job) => (
                      <tr key={job.id}>
                        <td><strong>{job.keyword}</strong></td>
                        <td><span className={`statusBadge status-${job.status}`}>{job.status}</span></td>
                        <td>
                          <span className="opMute">{job.region ?? 'Global'} · {job.industry ?? 'N/A'}</span>
                          {job.status === 'failed' && job.error_message ? (
                            <div className="opJobError">{job.error_message}</div>
                          ) : null}
                        </td>
                        <td>{job.total_prospects}</td>
                        <td>{formatRelative(job.created_at)}</td>
                        <td>
                          {job.status === 'failed' ? (
                            <button type="button" className="smallBtn" onClick={() => void handleRetryJob(job.id)} disabled={loading}>
                              Retry
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* === TAB: EMAIL LOG === */}
        {tab === 'mail' ? (
          <section className="opBlock">
            <header className="opBlockHead">
              <div>
                <p className="eyebrow">Safe Mode outbound</p>
                <h2>Email đã đi qua hệ thống</h2>
              </div>
              <div className="opMailFilters">
                {(['all', 'sent', 'delivered', 'bounced', 'failed'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`rsFilterChip ${emailFilter === value ? 'active' : ''}`}
                    onClick={() => setEmailFilter(value)}
                  >
                    {value === 'all' ? 'Tất cả' : value}
                  </button>
                ))}
              </div>
            </header>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Subject</th>
                    <th>Intended</th>
                    <th>Actual</th>
                    <th>Redirect</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {!emailHistory.items.length ? (
                    <tr><td colSpan={6}>Chưa có email log.</td></tr>
                  ) : (
                    emailHistory.items.map((row) => (
                      <tr key={row.id}>
                        <td><span className={`statusBadge status-${row.status}`}>{row.status}</span></td>
                        <td>{row.subject}</td>
                        <td>{row.intended_recipient}</td>
                        <td>{row.actual_recipient}</td>
                        <td>{row.redirected ? <span className="opTagYes">yes</span> : <span className="opMute">no</span>}</td>
                        <td>{formatRelative(row.sent_at ?? row.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {/* === TAB: TEMPLATES === */}
        {tab === 'templates' ? (
          <div className="opTemplatesGrid">
            <section className="opBlock">
              <header className="opBlockHead">
                <div>
                  <p className="eyebrow">Template Library</p>
                  <h2>Mẫu email theo ngành</h2>
                </div>
                <button type="button" className="ghostAction" onClick={() => void handlePromote()} disabled={loading}>
                  Promote candidates (BR-23)
                </button>
              </header>

              <div className="opTemplateForm">
                <input
                  placeholder="industry key (banking, fintech…)"
                  value={templateForm.industry}
                  onChange={(event) => setTemplateForm((prev) => ({ ...prev, industry: event.target.value }))}
                />
                <input
                  placeholder="subject template với {{var}}"
                  value={templateForm.subjectTemplate}
                  onChange={(event) => setTemplateForm((prev) => ({ ...prev, subjectTemplate: event.target.value }))}
                />
                <textarea
                  placeholder="body template với {{var}}"
                  value={templateForm.bodyTemplate}
                  onChange={(event) => setTemplateForm((prev) => ({ ...prev, bodyTemplate: event.target.value }))}
                  rows={3}
                />
                <button type="button" onClick={() => void handleCreateTemplate()} disabled={loading}>
                  + Thêm template
                </button>
              </div>

              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Industry</th>
                      <th>Version</th>
                      <th>Subject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!templates.items.length ? (
                      <tr><td colSpan={3}>Chưa có template.</td></tr>
                    ) : templates.items.map((template) => (
                      <tr key={template.id}>
                        <td><strong>{template.industry}</strong></td>
                        <td>v{template.version}</td>
                        <td>{template.subject_template}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="opBlock">
              <header className="opBlockHead">
                <div>
                  <p className="eyebrow">Template Candidates</p>
                  <h2>Đang chờ promote thành template chính thức</h2>
                </div>
              </header>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Template Key</th>
                      <th>Draft</th>
                      <th>Promoted</th>
                      <th>Similarity</th>
                      <th>Tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!candidates.items.length ? (
                      <tr><td colSpan={5}>Chưa có candidate.</td></tr>
                    ) : candidates.items.map((candidate) => (
                      <tr key={candidate.id}>
                        <td><strong>{candidate.template_key}</strong></td>
                        <td>{candidate.draft_id.slice(0, 8)}</td>
                        <td>{candidate.promoted ? <span className="opTagYes">yes</span> : <span className="opMute">no</span>}</td>
                        <td>{candidate.similarity_score ?? '-'}</td>
                        <td>{formatRelative(candidate.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
