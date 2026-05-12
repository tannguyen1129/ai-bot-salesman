'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

type ProviderFilter = 'all' | 'openai' | 'gemini' | 'fallback';

export default function ReportWorkflowPage() {
  const apiBaseRef = useRef(resolveApiBase());
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [queryInput, setQueryInput] = useState('');
  const [queryApplied, setQueryApplied] = useState('');
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>('all');
  const [page, setPage] = useState(1);
  const limit = 30;

  const [reports, setReports] = useState<PagedResult<ProspectCompanyReport>>({ items: [], total: 0, limit, offset: 0 });
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const fetchJson = useCallback(async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${apiBaseRef.current}${path}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }, []);

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
      } else if (selectedReportId && !result.items.some((item) => item.id === selectedReportId)) {
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

  const filteredItems = useMemo(() => {
    if (providerFilter === 'all') return reports.items;
    return reports.items.filter((item) => item.provider === providerFilter);
  }, [reports.items, providerFilter]);

  const selectedReport = useMemo(
    () => reports.items.find((item) => item.id === selectedReportId) ?? null,
    [reports.items, selectedReportId]
  );

  const totalPages = Math.max(1, Math.ceil(reports.total / limit));

  async function handleDownloadLatex(): Promise<void> {
    if (!selectedReport) return;
    try {
      const response = await fetch(`${apiBaseRef.current}/p1/prospects/${selectedReport.prospect_id}/report/latex`);
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      const payload = (await response.json()) as { filename: string; content: string };
      const blob = new Blob([payload.content], { type: 'application/x-tex;charset=utf-8' });
      triggerDownload(blob, payload.filename || 'company-report.tex');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tải được .tex');
    }
  }

  async function handleDownloadPdf(): Promise<void> {
    if (!selectedReport) return;
    try {
      const response = await fetch(`${apiBaseRef.current}/p1/prospects/${selectedReport.prospect_id}/report/pdf`);
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      const payload = (await response.json()) as { filename: string; contentBase64: string };
      const binary = atob(payload.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      triggerDownload(new Blob([bytes], { type: 'application/pdf' }), payload.filename || 'company-report.pdf');
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Không tải được PDF');
    }
  }

  function handlePrintPdf(): void {
    if (!selectedReport) return;
    const reportText = selectedReport.report_markdown ?? '';
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
  <title>AI Company Report - ${selectedReport.company_name}</title>
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
  <p class="meta">Company: ${selectedReport.company_name} | Provider: ${selectedReport.provider} | Generated: ${formatDate(selectedReport.generated_at)}</p>
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
    <main className="page rsPage">
      <div className="rsShell">
        <header className="rsTopbar">
          <div className="rsTopbarMain">
            <p className="eyebrow">Report Studio</p>
            <h1>Thư viện báo cáo công ty</h1>
            <p className="rsTopbarLead">
              Đọc lại báo cáo đã lưu trong database. Để tạo mới, dùng Workspace.
            </p>
          </div>
          <div className="rsTopbarMeta">
            <span className="rsMetaChip">{reports.total} report đã lưu</span>
            <button type="button" className="ghostAction" onClick={() => void loadReports()} disabled={loading}>
              {loading ? 'Đang tải…' : 'Làm mới'}
            </button>
          </div>
        </header>

        {errorText ? <div className="alert">{errorText}</div> : null}

        <div className="rsBody">
          <aside className="rsSidebar">
            <form onSubmit={handleSearch} className="rsSearchBar">
              <input
                placeholder="Tìm công ty, người, email…"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
              />
              <button type="submit">Tìm</button>
            </form>

            <div className="rsFilterRow">
              {(['all', 'openai', 'gemini', 'fallback'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rsFilterChip ${providerFilter === value ? 'active' : ''}`}
                  onClick={() => setProviderFilter(value)}
                >
                  {value === 'all' ? 'Tất cả' : value}
                </button>
              ))}
            </div>

            <div className="rsReportList">
              {!filteredItems.length ? (
                <p className="rsEmpty">
                  {reports.total === 0 ? 'Chưa có report nào.' : 'Không khớp bộ lọc.'}
                </p>
              ) : (
                filteredItems.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className={`rsReportRow ${selectedReportId === report.id ? 'selected' : ''}`}
                    onClick={() => setSelectedReportId(report.id)}
                  >
                    <div className="rsReportRowTop">
                      <strong>{report.company_name}</strong>
                      <span className={`rsProviderChip provider-${report.provider}`}>{report.provider}</span>
                    </div>
                    <div className="rsReportRowSub">
                      {report.person_name ? (
                        <>
                          <span>{report.person_name}</span>
                          {report.person_email ? <span className="rsMute">· {report.person_email}</span> : null}
                        </>
                      ) : (
                        <span className="rsMute">Chưa có người liên hệ</span>
                      )}
                    </div>
                    <div className="rsReportRowFoot">
                      <span>{report.source_count} nguồn</span>
                      <span>·</span>
                      <span>score {report.confidence_score ?? 'N/A'}</span>
                      <span className="rsReportRowWhen">{formatRelative(report.generated_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="rsPager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>‹ Prev</button>
              <span>Trang {page}/{totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>Next ›</button>
            </div>
          </aside>

          <section className="rsDetail">
            {!selectedReport ? (
              <div className="rsDetailEmpty">
                <p className="eyebrow">Chưa chọn report</p>
                <h2>Chọn một báo cáo ở bên trái để xem chi tiết.</h2>
                <p>Tất cả report đều có structured JSON. Bạn có thể tải về file .tex hoặc PDF.</p>
              </div>
            ) : (
              <>
                <header className="rsDetailHead">
                  <div className="rsDetailTitle">
                    <p className="eyebrow">{selectedReport.provider} · {formatRelative(selectedReport.generated_at)}</p>
                    <h2>{selectedReport.company_name}</h2>
                    {selectedReport.person_name ? (
                      <p className="rsDetailPerson">
                        {selectedReport.person_name}
                        {selectedReport.person_email ? <span> · {selectedReport.person_email}</span> : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="rsDetailMetaRow">
                    <span>{selectedReport.source_count} nguồn</span>
                    <span>score {selectedReport.confidence_score ?? 'N/A'}</span>
                    <span title={formatDate(selectedReport.generated_at)}>{formatDate(selectedReport.generated_at)}</span>
                  </div>
                </header>

                <div className="rsDetailActions">
                  <button type="button" className="ghostAction smallBtn" onClick={() => void handleDownloadLatex()}>Tải .tex</button>
                  <button type="button" className="ghostAction smallBtn" onClick={() => void handleDownloadPdf()}>Tải PDF</button>
                  <button type="button" className="ghostAction smallBtn" onClick={handlePrintPdf}>Xuất PDF (in)</button>
                </div>

                <ReportBody report={selectedReport} />
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ReportBody({ report }: { report: ProspectCompanyReport }) {
  const json = readObj(report.report_json);
  if (!json) {
    return <pre className="payloadBox reportMarkdown rsRawMarkdown">{report.report_markdown}</pre>;
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
    <div className="rsReportBody">
      <article className="rsReportSection">
        <h3>Tóm tắt điều hành</h3>
        <p>{readStr(json.executive_summary)}</p>
      </article>

      <article className="rsReportSection">
        <h3>Company Overview</h3>
        <div className="rsKeyValueGrid">
          <div><span>Domain</span><strong>{readStr(overview.domain)}</strong></div>
          <div><span>Industry</span><strong>{readStr(overview.industry)}</strong></div>
          <div><span>Region</span><strong>{readStr(overview.region)}</strong></div>
        </div>
        <p className="rsSectionLead">{readStr(overview.summary)}</p>
      </article>

      <article className="rsReportSection">
        <h3>Firmographics</h3>
        <div className="rsKeyValueGrid">
          <div><span>Nhân sự</span><strong>{readStr(firmographics.employee_count_range)}</strong></div>
          <div><span>Doanh thu (USD)</span><strong>{readStr(firmographics.revenue_range_usd)}</strong></div>
          <div><span>Funding stage</span><strong>{readStr(firmographics.funding_stage)}</strong></div>
          <div><span>Thành lập</span><strong>{typeof firmographics.founded_year === 'number' ? String(firmographics.founded_year) : 'N/A'}</strong></div>
        </div>
      </article>

      <article className="rsReportSection">
        <h3>Key Person · điểm kích hoạt</h3>
        <div className="rsKeyValueGrid">
          <div><span>Name</span><strong>{readStr(keyPerson.name)}</strong></div>
          <div><span>Title</span><strong>{readStr(keyPerson.title)}</strong></div>
          <div><span>Email</span><strong>{readStr(keyPerson.email)}</strong></div>
          <div><span>Phone</span><strong>{readStr(keyPerson.phone)}</strong></div>
        </div>
      </article>

      <article className="rsReportSection">
        <h3>All Key Persons ({allKeyPersons.length})</h3>
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
      </article>

      <article className="rsReportSection">
        <h3>Outreach Hooks ({outreachHooks.length})</h3>
        {!outreachHooks.length ? (
          <p className="rsMute">Chưa tìm được hook cụ thể từ dữ liệu nguồn hiện có.</p>
        ) : (
          <ul className="rsHookList">
            {outreachHooks.map((row, idx) => {
              const hook = readStr(row.hook);
              const useIn = readStr(row.use_in);
              const evidence = typeof row.evidence_url === 'string' ? row.evidence_url : null;
              return (
                <li key={`${hook}-${idx}`} className="rsHookItem">
                  <span className={`rsHookTag rsHookTag-${useIn === 'N/A' ? 'opener' : useIn}`}>{useIn === 'N/A' ? 'opener' : useIn}</span>
                  <span className="rsHookText">{hook}</span>
                  {evidence ? (
                    <a href={evidence} target="_blank" rel="noreferrer" className="rsHookEvidence">nguồn ↗</a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </article>

      <div className="rsSignalsGrid">
        <article className="rsReportSection rsSignal rsSignalBuy">
          <h3>Buying Signals</h3>
          <ul>{buyingSignals.length ? buyingSignals.map((it) => <li key={it}>{it}</li>) : <li className="rsMute">N/A</li>}</ul>
        </article>

        <article className="rsReportSection rsSignal rsSignalRisk">
          <h3>Risks</h3>
          <ul>{risks.length ? risks.map((it) => <li key={it}>{it}</li>) : <li className="rsMute">N/A</li>}</ul>
        </article>

        <article className="rsReportSection rsSignal rsSignalNext">
          <h3>Recommended Next Steps</h3>
          <ul>{nextSteps.length ? nextSteps.map((it) => <li key={it}>{it}</li>) : <li className="rsMute">N/A</li>}</ul>
        </article>

        <article className="rsReportSection rsSignal rsSignalQuality">
          <h3>Data Quality Notes</h3>
          <ul>{dataQuality.length ? dataQuality.map((it) => <li key={it}>{it}</li>) : <li className="rsMute">N/A</li>}</ul>
        </article>
      </div>

      <article className="rsReportSection">
        <h3>Nguồn dẫn chứng ({sources.length})</h3>
        {!sources.length ? (
          <p className="rsMute">Không có URL nguồn nào kèm theo report này.</p>
        ) : (
          <ul className="rsSourceList">
            {sources.map((row, idx) => {
              const url = typeof row.url === 'string' ? row.url : '';
              const title = readStr(row.title);
              const claim = typeof row.claim_supported === 'string' ? row.claim_supported : null;
              return (
                <li key={`${url}-${idx}`}>
                  <a href={url} target="_blank" rel="noreferrer">{title !== 'N/A' ? title : url}</a>
                  {claim ? <span className="rsSourceClaim"> — dẫn chứng cho: <code>{claim}</code></span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </div>
  );
}
