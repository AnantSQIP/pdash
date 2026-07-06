import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { QueryProvider } from '@/providers/query-provider';
import { OrgProvider } from '@/lib/org-context';
import { AuthProvider } from '@/lib/auth-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { ToastProvider } from '@/components/ui/Toast';

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
          <AuthProvider>
            <OrgProvider>
              <PermissionsProvider>
                <ToastProvider>
                  <AppShell>{children}</AppShell>
                </ToastProvider>
              </PermissionsProvider>
            </OrgProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
