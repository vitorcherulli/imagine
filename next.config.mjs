/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "fluent-ffmpeg", "drizzle-orm", "postgres", "@aws-sdk/client-s3"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/generated/:path*",
        destination: "/api/media/generated/:path*",
      },
    ];
  },
};

export default nextConfig;
