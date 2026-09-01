/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  experimental: {
    instrumentationHook: true,
  },
  // @react-pdf/renderer is ESM-only — keep it out of webpack bundling
  serverExternalPackages: ["@react-pdf/renderer"],
  // The old `/home` marketing page was replaced by the landing page at `/`.
  // Keep the URL working for anything still linking to it.
  async redirects() {
    return [{ source: "/home", destination: "/", permanent: true }];
  },
};

module.exports = nextConfig;
