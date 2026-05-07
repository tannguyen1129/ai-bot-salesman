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

function isAbortLike(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  if (error instanceof Error && /aborted|abort/i.test(error.message)) {
    return true;
  }
  return false;
}

export default function SystemCheckPage() {
  const [apiBase, setApiBase] = useState(resolveApiBase);
  const [state, setState] = useState<CheckState>({
    loading: false,
    ok: null,
    message: 'Chưa chạy kiểm tra.'
  });

  const healthUrl = useMemo(() => `${apiBase.replace(/\/$/, '')}/health`, [apiBase]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const host = window.location.hostname;
    const browsingLocally = host === 'localhost' || host === '127.0.0.1';
    const apiPointsLocalhost = /localhost|127\.0\.0\.1/.test(apiBase);

    if (!browsingLocally && apiPointsLocalhost) {
      const corrected = `${window.location.protocol}//${host}:4000`;
      setApiBase(corrected);
    }
  }, [apiBase]);

  async function runCheck(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    setState({ loading: true, ok: null, message: 'Đang kiểm tra kết nối API...' });

    let timeoutId: number | null = null;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error('TIMEOUT'));
        }, 30000);
      });
      const response = (await Promise.race([
        fetch(healthUrl, { method: 'GET' }),
        timeoutPromise
      ])) as Response;

      if (!response.ok) {
        setState({
          loading: false,
          ok: false,
          message: `API phản hồi lỗi HTTP ${response.status}. Kiểm tra backend hoặc reverse proxy.`
        });
        return;
      }

      const payload = await response.json();
      setState({
        loading: false,
        ok: true,
        message: 'Kết nối API thành công. Có thể vào Workspace để tạo search job.',
        payload
      });
    } catch (error) {
      const message =
        isAbortLike(error) || (error instanceof Error && error.message === 'TIMEOUT')
          ? 'Request timeout khi kiểm tra API.'
          : error instanceof Error
            ? error.message
            : 'Lỗi không xác định';
      setState({
        loading: false,
        ok: false,
        message: `Không kết nối được API: ${message}`
      });
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  return (
    <main className="page">
      <div className="container">
        <section className="hero compactHero">
          <div>
            <h1>Kiểm Tra Kết Nối P1</h1>
            <p>Kiểm tra nhanh API trước khi tạo search job để giảm lỗi vận hành.</p>
          </div>
        </section>

        <section className="panel checkPanel">
          <form onSubmit={runCheck} className="checkForm">
            <label>
              <span>API Base URL</span>
              <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} />
            </label>
            <button type="submit" disabled={state.loading}>
              {state.loading ? 'Đang kiểm tra...' : 'Kiểm tra ngay'}
            </button>
          </form>

          <div className={state.ok === false ? 'alert' : state.ok === true ? 'successAlert' : 'notice'}>
            {state.message}
          </div>

          {state.ok === true && state.payload ? (
            <pre className="payloadBox">{JSON.stringify(state.payload, null, 2)}</pre>
          ) : null}

          <div className="quickPanel">
            <h3>Khi kết nối thất bại</h3>
            <ul>
              <li>Khởi động API và Worker: `npm run dev:api` + `npm run dev:worker`.</li>
              <li>Kiểm tra đúng cổng API (mặc định `4000`).</li>
              <li>Kiểm tra `ALLOWED_ORIGINS` nếu truy cập qua IP/domain.</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
