import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Sidebar } from '@/components/layout/Sidebar';
import { QueryProvider } from '@/providers/query-provider';
import { OrgProvider } from '@/lib/org-context';

const geistSans = localFont({
  src: '../public/fonts/GeistVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'PDash — Project Dashboard',
  description: 'Internal project management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body className="flex h-screen overflow-hidden bg-gray-50">
        <QueryProvider>
          <OrgProvider>
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              {children}
            </div>
          </OrgProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
