import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow the frontend to call the backend container by name in Docker
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.BACKEND_API_URL || 'http://backend:4000/api/v1'}/:path*`,
      },
      {
        source: '/graphql',
        destination: `${process.env.BACKEND_GRAPHQL_URL || 'http://backend:4000/graphql'}`,
      },
    ];
  },
};

export default nextConfig;
