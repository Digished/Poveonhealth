/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
