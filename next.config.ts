import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: '/four-in-a-row/index.html', destination: '/games/four-in-a-row', permanent: false },
      { source: '/checkers/index.html', destination: '/games/checkers', permanent: false },
      { source: '/tic-tac-toe/index.html', destination: '/games/tic-tac-toe', permanent: false },
    ];
  },
};

export default nextConfig;
