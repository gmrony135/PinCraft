/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the Node HTTP client's Agent/dispatcher in one runtime module instead
  // of duplicating it into each route bundle. Public-host DNS pinning is intact.
  serverExternalPackages: ['undici'],
  // Bound build concurrency for small CI/local machines. No runtime service or
  // paid build resource is required by the reviewed publishing changes.
  experimental: { cpus: 1, webpackMemoryOptimizations: true },
};

module.exports = nextConfig;
