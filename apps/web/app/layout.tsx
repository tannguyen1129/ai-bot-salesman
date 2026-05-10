import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI Sales Agent P1',
  description: 'VNETWORK internal sales workflow product'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <header className="siteHeader">
          <div className="siteHeaderInner">
            <div className="brandBlock">
              <strong>VNETWORK</strong>
              <span>AI Sales Agent P1</span>
            </div>
            <nav className="siteNav">
              <a href="/">Tổng quan</a>
              <a href="/workspace">Workspace</a>
              <a href="/report-workflow">Report Studio</a>
              <a href="/console">Operations</a>
              <a href="/guide">Playbook</a>
              <a href="/system-check">System Check</a>
            </nav>
          </div>
        </header>

        {children}

        <footer className="siteFooter">
          <div className="siteFooterInner">
            <div>
              <strong>AI Sales Agent - P1 Email Outreach</strong>
              <p>Frontend vận hành nội bộ cho discovery, prospecting, draft review và reporting.</p>
            </div>
            <div className="footerMeta">
              <span>Stack: Next.js · NestJS · PostgreSQL · Redis</span>
              <span>Safe Mode mặc định bật cho P1</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
