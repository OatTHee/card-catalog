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
        hostname: 'pub-xxxxxxxx.r2.dev', // เปลี่ยนเป็น R2 public URL จริงของคุณ
      },
    ],
  },
}

export default nextConfig;
