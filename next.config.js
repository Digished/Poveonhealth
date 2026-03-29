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
};

module.exports = nextConfig;
