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
      {
        source: '/privacy.html',
        destination: '/privacy',
        permanent: true,
      },
      {
        source: '/terms.html',
        destination: '/terms',
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
