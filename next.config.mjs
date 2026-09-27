/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      "sql.js": "sql.js/dist/sql-asm.js",
    },
  },
  // puter.js reads its own browser bundle with readFileSync at a path it computes from
  // __filename, then evaluates it in node:vm. Bundling rewrites __dirname/__filename to
  // the emitted chunk, and file tracing cannot see a runtime-computed readFileSync, so the
  // function deployed without dist/puter.cjs and every Puter call failed with
  // "puter.js bundle not found". Keeping the package external makes it a real require
  // from node_modules, which fixes __filename and lets Vercel trace the dist file.
  serverExternalPackages: ["@heyputer/puter.js"],
  outputFileTracingIncludes: {
    "/api/v1/**": ["./node_modules/@heyputer/puter.js/dist/**"],
  },
};
export default nextConfig;
