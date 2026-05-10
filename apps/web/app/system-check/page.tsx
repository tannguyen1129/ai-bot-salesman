'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type CheckState = {
  loading: boolean;
  ok: boolean | null;
  message: string;
  payload?: unknown;
};

const envApiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function resolveApiBase(): string {
  if (typeof window === 'undefined') return envApiBase || 'http://localhost:4000';

  const host = window.location.hostname;
  const protocol = window.location.protocol || 'http:';

  if (envApiBase.trim().length > 0) {
    const pointsToLocalhost = /localhost|127\.0\.0\.1/.test(envApiBase);
    const browsingLocally = host === 'localhost' || host === '127.0.0.1';
    if (!pointsToLocalhost || browsingLocally) return envApiBase;
  }

  const browsingLocally = host === 'localhost' || host === '127.0.0.1';
  return browsingLocally ? `${protocol}//${host}:4000` : `${protocol}//${host}`;
}

export default function SystemCheckPage() {
  const [apiBase, setApiBase] = useState(resolveApiBase);
  const [state, setState] = useState<CheckState>({ loading: false, ok: null, message: 'Chưa chạy kiểm tra.' });

  const healthUrl = useMemo(() => `${apiBase.replace(/\/$/, '')}/health`, [apiBase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const host = window.location.hostname;
    const browsingLocally = host === 'localhost' || host === '127.0.0.1';
    const apiPointsLocalhost = /localhost|127\.0\.0\.1/.test(apiBase);

    if (!browsingLocally && apiPointsLocalhost) {
      setApiBase(`${window.location.protocol}//${host}`);
    }
  }, [apiBase]);

  async function runCheck(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    setState({ loading: true, ok: null, message: 'Đang kiểm tra kết nối API...' });

    let timeoutId: number | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('TIMEOUT')), 30000);
      });

      const response = (await Promise.race([fetch(healthUrl, { method: 'GET' }), timeoutPromise])) as Response;

      if (!response.ok) {
        setState({ loading: false, ok: false, message: `API phản hồi lỗi HTTP ${response.status}.` });
        return;
      }

      const payload = await response.json();
      setState({
        loading: false,
        ok: true,
        message: 'Kết nối API thành công. Có thể vận hành trên Workspace.',
        payload
      });
    } catch (error) {
      const message = error instanceof Error && error.message === 'TIMEOUT' ? 'Request timeout.' : error instanceof Error ? error.message : 'Lỗi không xác định';
      setState({ loading: false, ok: false, message: `Không kết nối được API: ${message}` });
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  return (
    <main className="page">
      <div className="container">
        <section className="hero compactHero">
          <div>
            <p className="eyebrow">System Check</p>
            <h1>Kiểm tra môi trường trước vận hành</h1>
            <p>Xác thực nhanh API endpoint và phản hồi health trước khi chạy workflow chính.</p>
          </div>
        </section>

        <section className="panel checkPanel">
          <form onSubmit={runCheck} className="checkForm">
            <label>
              <span>API Base URL</span>
              <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <button type="submit" disabled={state.loading}>{state.loading ? 'Đang kiểm tra...' : 'Run Check'}</button>
          </form>

          <div className={state.ok === false ? 'alert' : state.ok === true ? 'successAlert' : 'notice'}>{state.message}</div>

          {state.ok === true && state.payload ? <pre className="payloadBox">{JSON.stringify(state.payload, null, 2)}</pre> : null}

          <div className="quickPanel">
            <h3>Khi kết nối thất bại</h3>
            <ul>
              <li>Khởi động lại API và worker process.</li>
              <li>Xác nhận cổng backend đúng `4000` hoặc theo env thực tế.</li>
              <li>Kiểm tra biến `ALLOWED_ORIGINS` nếu đang truy cập qua domain/IP khác localhost.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
