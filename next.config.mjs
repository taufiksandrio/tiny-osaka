const nextConfig = {
  // Keep automated production QA separate from the user's running dev server.
  distDir: process.env.QA_NEXT_DIST_DIR === ".next-qa" ? ".next-qa" : ".next",
  // Preserve the repository's existing agent instructions during development.
  agentRules: false,
  redirects: async () => [
    { source: "/en/:path*", destination: "/id/:path*", permanent: true },
    { source: "/", destination: "/id", permanent: false },
  ],
};

export default nextConfig;
