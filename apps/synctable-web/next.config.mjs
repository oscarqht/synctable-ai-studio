/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@synctable/ui"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
