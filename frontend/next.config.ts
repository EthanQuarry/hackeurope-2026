import type { NextConfig } from "next"
import path from "path"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

const nextConfig: NextConfig = {
  distDir: ".next-build",
  turbopack: { root: path.resolve(__dirname) },
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
