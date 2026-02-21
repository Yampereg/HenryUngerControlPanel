import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['sharp'],

  async headers() {
    return [
      {
        // Allow this app to be embedded as an iframe from any origin.
        // Auth is enforced by middleware.ts (PANEL_TOKEN check).
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ]
  },
}

export default nextConfig
