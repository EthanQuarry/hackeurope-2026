import type { NextConfig } from "next"
import path from "path"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

const nextConfig: NextConfig = {
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
  webpack: (config) => {
    config.resolve = config.resolve ?? {}
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      "node_modules",
    ]
    return config
  },
}

export default nextConfig
