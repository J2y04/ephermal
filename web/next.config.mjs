/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        source:      '/dashboard.html',
        has:         [{ type: 'host', value: 'ephermal.app' }],
        destination: 'https://dashboard.ephermal.app/',
        permanent:   false,
      },
    ];
  },
};
export default nextConfig;
