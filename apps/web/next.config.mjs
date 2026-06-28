/** @type {import('next').NextConfig} */
// Proxy /api/* to the NestJS API so the browser only ever talks to the web origin.
// This keeps the auth cookies first-party (SameSite=Lax) with zero CORS in dev & prod.
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig = {
  transpilePackages: ['@pdash/db'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
