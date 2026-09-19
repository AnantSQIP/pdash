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
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';

const geistSans = localFont({
  src: '../public/fonts/GeistVariable.woff2',
  variable: '--font-sans',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Squark Dashboard',
  description: 'Squark Dashboard — project, people & performance management',
  // public/fav.png has been sitting there unreferenced: with no icon declared, every page load
  // asked for /favicon.ico, got a 404, and the browser tab showed a blank sheet of paper instead
  // of the Squark mark. Declared here rather than added as app/favicon.ico so there is one file
  // to replace when the logo changes.
  icons: {
    icon: [{ url: '/fav.png', type: 'image/png', sizes: '200x200' }],
    shortcut: '/fav.png',
    apple: '/fav.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geistSans.variable}>
      {/* No bg-* utility here. A class selector (0,1,0) outranks the `body` rule in
          globals.css (0,0,1), so a utility here silently wins the cascade and the
          canvas token never applies — which is exactly what happened. */}
      <body className="flex h-screen overflow-hidden">
        <QueryProvider>
          <AuthProvider>
            <OrgProvider>
              <PresenceProvider>
                <PermissionsProvider>
                  <ToastProvider>
                    <ConfirmProvider>
                      <PasscodeProvider>
                        <AppShell>{children}</AppShell>
                      </PasscodeProvider>
                    </ConfirmProvider>
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
