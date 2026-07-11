import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co', // เก็บไว้ชั่วคราวช่วง migrate รูปเก่า
      },
      {
        protocol: 'https',
        hostname: 'pub-b5f616fbd8a1437d8fd9a58a37363569.r2.dev',
      },
    ],
  },
}

export default nextConfig;
