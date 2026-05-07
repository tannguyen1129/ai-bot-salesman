import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI Bot Salesman P1 Dashboard',
  description: 'VNETWORK AI Bot Salesman - P1 Approved Flow'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <header className="siteHeader">
          <div className="siteHeaderInner">
            <div className="brandBlock">
              <strong>VNETWORK</strong>
              <span>AI Bot Salesman P1</span>
            </div>
            <nav className="siteNav">
              <a href="/">Trang chủ</a>
              <a href="/workspace">Workspace P1</a>
              <a href="/guide">Playbook</a>
              <a href="/system-check">Kiểm tra kết nối</a>
            </nav>
          </div>
        </header>

        {children}

        <footer className="siteFooter">
          <div className="siteFooterInner">
            <div>
              <strong>AI Bot Salesman - P1</strong>
              <p>Nền tảng tự động hóa prospect discovery theo luồng đã phê duyệt.</p>
            </div>
            <div className="footerMeta">
              <span>P1 Approved Flow</span>
              <span>Next.js + NestJS + PostgreSQL + Redis + Worker Queue</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
