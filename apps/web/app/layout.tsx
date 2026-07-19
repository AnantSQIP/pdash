import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { QueryProvider } from '@/providers/query-provider';
import { OrgProvider } from '@/lib/org-context';
import { AuthProvider } from '@/lib/auth-context';
import { PresenceProvider } from '@/lib/presence-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { PasscodeProvider } from '@/lib/passcode-context';
import { ToastProvider } from '@/components/ui/Toast';

const geistSans = localFont({
  src: '../public/fonts/GeistVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Squark Dashboard',
  description: 'Squark Dashboard — project, people & performance management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body className="flex h-screen overflow-hidden bg-gray-50">
        <QueryProvider>
          <AuthProvider>
            <OrgProvider>
              <PresenceProvider>
                <PermissionsProvider>
                  <ToastProvider>
                    <PasscodeProvider>
                      <AppShell>{children}</AppShell>
                    </PasscodeProvider>
                  </ToastProvider>
                </PermissionsProvider>
              </PresenceProvider>
            </OrgProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
