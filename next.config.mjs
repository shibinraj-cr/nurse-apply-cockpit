/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint is optional for this scaffold; type-checking still runs during build.
  eslint: { ignoreDuringBuilds: true },
  // Keep Prisma out of the server bundle so the query engine resolves correctly.
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
};

export default nextConfig;
