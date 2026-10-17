import { test as base, expect } from "@playwright/test";

// Independent list of the preview routes under test, not imported from app data.
export const publicPaths = [
  "", "/menu", "/menu/sample-01", "/menu/sample-02", "/menu/sample-03",
  "/about", "/guides", "/guides/takoyaki", "/guides/okonomiyaki",
  "/guides/burger", "/promos", "/location",
];

export const test = base.extend({
  networkGuard: [async ({ context, baseURL }, runTest, testInfo) => {
    expect(baseURL).toBe("http://127.0.0.1:3030");
    const origin = new URL(baseURL).origin;
    const denied = [];
    const runtimeErrors = [];

    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin && ["http:", "https:"].includes(url.protocol)) {
        denied.push(`${url.protocol}//${url.host}${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    await context.routeWebSocket("**/*", (route) => {
      const url = new URL(route.url());
      if (url.hostname === "127.0.0.1" && url.port === "3030") {
        route.connectToServer();
      } else {
        denied.push(`${url.protocol}//${url.host}${url.pathname}`);
        route.close();
      }
    });

    context.on("page", (page) => {
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
    });

    try {
      await runTest();
    } finally {
      if (denied.length || runtimeErrors.length) {
        await testInfo.attach("browser-safety", {
          body: JSON.stringify({ denied, runtimeErrors }, null, 2),
          contentType: "application/json",
        });
      }
      expect(denied, "Browser attempted an external connection").toEqual([]);
      expect(runtimeErrors, "Browser runtime errors").toEqual([]);
    }
  }, { auto: true }],
});

export { expect };
