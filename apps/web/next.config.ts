import type { NextConfig } from 'next';

const rawAllowedDevOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS ?? '';
const allowedDevOrigins = rawAllowedDevOrigins
  .split(',')
  .map((item) => item.trim())
  .filter((item) => item.length > 0);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {})
};

export default nextConfig;
