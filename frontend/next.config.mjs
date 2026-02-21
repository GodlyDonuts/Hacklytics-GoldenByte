/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-src https://*.cloud.databricks.com 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
