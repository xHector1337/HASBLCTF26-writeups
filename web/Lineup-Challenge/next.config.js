/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  productionBrowserSourceMaps: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Hint-5",
            value: "The Right Back is English and currently plays in La Liga.",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;