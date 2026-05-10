'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type PagedResult<T> = { items: T[]; total: number; limit: number; offset: number };

type ProspectCompanyReport = {
  id: string;
  prospect_id: string;
  search_job_id: string | null;
  company_name: string;
  report_markdown: string;
  report_json: Record<string, unknown>;
  provider: 'openai' | 'gemini' | 'fallback';
  source_count: number;
  confidence_score: string | null;
  generated_at: string;
  updated_at: string;
  person_name: string | null;
  person_email: string | null;
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

export default function ReportWorkflowPage() {
  const [apiBase, setApiBase] = useState(resolveApiBase);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [queryApplied, setQueryApplied] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [reports, setReports] = useState<PagedResult<ProspectCompanyReport>>({ items: [], total: 0, limit, offset: 0 });
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const fetchJson = useCallback(
    async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${apiBase}${path}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    [apiBase]
  );

  const loadReports = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      if (queryApplied.trim()) params.set('q', queryApplied.trim());

      const result = await fetchJson<PagedResult<ProspectCompanyReport>>(`/p1/reports?${params.toString()}`);
      setReports(result);

      if (!selectedReportId && result.items.length) {
        setSelectedReportId(result.items[0].id);
      }

      if (selectedReportId && !result.items.some((item) => item.id === selectedReportId)) {
        setSelectedReportId(result.items[0]?.id ?? null);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không thể tải danh sách report');
    } finally {
      setLoading(false);
    }
  }, [fetchJson, page, queryApplied, selectedReportId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setQueryApplied(queryInput);
  }

  const selectedReport = useMemo(
    () => reports.items.find((item) => item.id === selectedReportId) ?? null,
    [reports.items, selectedReportId]
  );

  const totalPages = Math.max(1, Math.ceil(reports.total / limit));

  return (
    <main className="page">
      <div className="container">
        <section className="hero">
          <div>
            <p className="eyebrow">Report Library</p>
            <h1>Báo cáo đã được hệ thống tạo</h1>
            <p>Trang này chỉ dùng để đọc lại report đã lưu trong database từ luồng chính ở Workspace.</p>
          </div>
          <label className="apiBox">
            <span>API Base URL</span>
            <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
          </label>
        </section>

        {errorText ? <div className="alert">{errorText}</div> : null}

        <section className="panel">
          <div className="panelHead">
            <h3>Danh sách report</h3>
            <button onClick={() => void loadReports()} disabled={loading}>{loading ? 'Đang tải...' : 'Làm mới'}</button>
          </div>

          <form onSubmit={handleSearch} className="toolbar" style={{ gridTemplateColumns: '1fr 140px' }}>
            <input
              placeholder="Tìm theo company, person, email"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
            />
            <button type="submit">Tìm</button>
          </form>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Person</th>
                  <th>Provider</th>
                  <th>Sources</th>
                  <th>Generated</th>
                </tr>
              </thead>
              <tbody>
                {!reports.items.length ? (
                  <tr><td colSpan={5}>Chưa có report nào.</td></tr>
                ) : (
                  reports.items.map((item) => (
                    <tr key={item.id} className={selectedReportId === item.id ? 'selected' : ''} onClick={() => setSelectedReportId(item.id)}>
                      <td>{item.company_name}</td>
                      <td>{item.person_name ?? '-'} {item.person_email ? `(${item.person_email})` : ''}</td>
                      <td>{item.provider}</td>
                      <td>{item.source_count}</td>
                      <td>{formatDate(item.generated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>Prev</button>
            <span>Page {page}/{totalPages} ({reports.total} reports)</span>
            <button disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>Next</button>
          </div>
        </section>

        <section className="panel companyReportPanel" style={{ marginTop: '0.9rem' }}>
          <h3>Chi tiết report</h3>
          {selectedReport ? (
            <>
              <div className="reportMeta">
                <span>ID: {selectedReport.id.slice(0, 8)}...</span>
                <span>Company: {selectedReport.company_name}</span>
                <span>Provider: {selectedReport.provider}</span>
                <span>Source count: {selectedReport.source_count}</span>
                <span>Score: {selectedReport.confidence_score ?? 'N/A'}</span>
                <span>Generated: {formatDate(selectedReport.generated_at)}</span>
              </div>
              <pre className="payloadBox reportMarkdown">{selectedReport.report_markdown}</pre>
            </>
          ) : (
            <p className="notice">Chọn một report để xem nội dung chi tiết.</p>
          )}
        </section>
      </div>
    </main>
  );
}
