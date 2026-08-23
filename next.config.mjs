/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      "sql.js": "sql.js/dist/sql-asm.js",
    },
  },
};
export default nextConfig;
