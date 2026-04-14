import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Prevent exposing server internals in error messages
  reactStrictMode: true,

  // Disable X-Powered-By header
  poweredByHeader: false,

  // Compress responses
  compress: true,

  // Images: no remote patterns needed (receipts are served locally)
  // domains[] is deprecated in Next.js 15 — use remotePatterns instead
  images: {
    remotePatterns: [],
    dangerouslyAllowSVG: false,
  },

  // Webpack: do not bundle server-only packages on the client
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        argon2: false,
        crypto: false,
      }
    }
    return config
  },
}

export default nextConfig
