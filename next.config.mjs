/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // puter.js reads its own browser bundle with readFileSync at a path it computes from
  // __filename, then evaluates it in node:vm. File tracing cannot see a
  // runtime-computed readFileSync, so the function deployed without dist/puter.cjs and
  // every Puter call failed with "puter.js bundle not found". The include list below is
  // what guarantees that file is on disk; puter.ts also re-implements init() so it never
  // depends on the bundled init.cjs resolving its own path.
  serverExternalPackages: ["@heyputer/puter.js"],
  turbopack: {
    resolveAlias: {
      "sql.js": "sql.js/dist/sql-asm.js",
    },
    // serverExternalPackages alone was not honoured under Turbopack: init.cjs was still
    // bundled, so nothing was left on disk to require at runtime. Declaring it external
    // here keeps the package a real node_modules dependency alongside the dist trace below.
    external: ["@heyputer/puter.js"],
  },
  outputFileTracingIncludes: {
    "/api/v1/**": ["./node_modules/@heyputer/puter.js/dist/**", "./node_modules/@heyputer/puter.js/package.json"],
  },
};
export default nextConfig;
