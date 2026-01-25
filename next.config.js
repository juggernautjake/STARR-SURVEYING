/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
  },
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
}

module.exports = nextConfig