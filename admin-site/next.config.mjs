// Owner-only admin site. Hardening: noindex, no caching of authenticated pages, strict CSP, no framing.
// /__/auth/* and /__/firebase/* are Firebase's sign-in handler, served from this origin so redirect sign-in
// works on phones without cross-site storage. Those responses come from Google, so they are excluded below.
const FIREBASE_HOST = 'https://pincraft-ly.firebaseapp.com';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://apis.google.com",
  "frame-src 'self' https://pincraft-ly.firebaseapp.com https://accounts.google.com https://apis.google.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/__/auth/:path*', destination: `${FIREBASE_HOST}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `${FIREBASE_HOST}/__/firebase/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: '/((?!__/).*)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex, nocache' },
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
