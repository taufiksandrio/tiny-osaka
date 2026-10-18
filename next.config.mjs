const nextConfig = {
  // Keep automated production QA separate from the user's running dev server.
  distDir: process.env.QA_NEXT_DIST_DIR === ".next-qa" ? ".next-qa" : ".next",
  // Preserve the repository's existing agent instructions during development.
  agentRules: false,
  // Unmatched URLs render an Indonesian 404 with <html lang="id"> (there is no root layout).
  experimental: { globalNotFound: true },
  // Card images go through the built-in optimizer (no new dependency; sharp is already installed).
  // Only same-origin /media/** may be optimized (no remotePatterns); webp only (AVIF costs too much CPU/RAM
  // on a small VPS); minimumCacheTTL equals PUBLIC_MEDIA_MAX_AGE in src/server/media/cache-headers.mjs so a
  // withdrawn image can linger in the optimizer cache for at most that long (AC-31, AC-35).
  images: {
    localPatterns: [{ pathname: "/media/**" }],
    formats: ["image/webp"],
    qualities: [75],
    deviceSizes: [640, 828, 1080, 1280],
    imageSizes: [384],
    minimumCacheTTL: 3600,
  },
  // ADR-038: public URLs have no language segment and nothing redirects; any prefixed address is a normal 404.
  // Baseline security headers. No CSP yet (a wrong policy would break pages); add it report-only first.
  // HSTS only for the production target, which is always served over HTTPS (never for local/staging hosts).
  async headers() {
    const baseline = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    if (process.env.PUBLIC_DATABASE_TARGET === "production") {
      baseline.push({ key: "Strict-Transport-Security", value: "max-age=15552000" });
    }
    return [{ source: "/:path*", headers: baseline }];
  },
};

export default nextConfig;
