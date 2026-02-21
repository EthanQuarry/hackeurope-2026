import type { NextConfig } from "next"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ]
  },
  serverExternalPackages: ["three"],
}

export default nextConfig
