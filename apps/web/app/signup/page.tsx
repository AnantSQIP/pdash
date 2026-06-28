'use client';

import Link from 'next/link';
import Image from 'next/image';
import { RiShieldUserLine } from '@remixicon/react';

// Open self-signup is disabled — this is a single-org internal tool. New accounts
// are provisioned by an administrator (invite flow). This page just points users back.
export default function SignupPage() {
  return (
    <div className="min-h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-brand-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image src="/fav.png" alt="SquarkIP" width={48} height={48} className="rounded-xl mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Accounts are invite-only</h1>
          <p className="text-sm text-gray-500 mt-1">SquarkIP is an internal workspace</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 text-center">
          <div className="flex items-center justify-center gap-2 mb-4 text-brand-600">
            <RiShieldUserLine size={18} />
            <span className="text-sm font-semibold">Need access?</span>
          </div>
          <p className="text-sm text-gray-600">
            Ask your administrator to create an account for you. You&apos;ll receive an
            invite link to set your password.
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            Back to sign in
          </Link>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          © {new Date().getFullYear()} SquarkIP · Intellectual Property Management
        </p>
      </div>
    </div>
  );
}
