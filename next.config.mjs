const nextConfig = {
  // Preserve the repository's existing agent instructions during development.
  agentRules: false,
  redirects: async () => [
    { source: "/", destination: "/id", permanent: false },
  ],
};

export default nextConfig;
