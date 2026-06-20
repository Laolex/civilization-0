/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@civ/shared", "@civ/zerog", "@civ/provenance", "@civ/persistence"],
  experimental: { serverComponentsExternalPackages: ["pg"] },
};
export default nextConfig;
