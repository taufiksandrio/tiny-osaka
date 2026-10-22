import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tools, parseToolInput, describeFailure } from "../../src/server/mcp/tools.mjs";
import { CmsRequestError } from "../../src/server/cms/request-policy.mjs";
import { isBlockedIp, parseImportUrl, resolvePublic, fetchImage, GuardError } from "../../src/server/mcp/net-guard.mjs";
import { createImportUrl, toDirectUrl, hostOf, importEnabled } from "../../src/server/mcp/import-url.mjs";

// Q-6 media_import_url (AC-33..AC-41): net-guard and orchestration with injected resolver/transport and local servers only.
// No real DNS and no real internet: the "remote" is a local plain-HTTP server and the transport records what https.request would receive.
const codeOf = async fn => { try { await fn(); return null; } catch (error) { return error.code ?? "OTHER"; } };
const PUBLIC_IP = "93.184.216.34";
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

test("AC-33: only https on 443, no userinfo, name hosts without literal IPs or internal suffixes", () => {
  for (const ok of ["https://example.com/a.jpg", "https://example.com:443/a.jpg", "https://cdn.example.co.id/x?y=1", "https://example.com./a.png"]) assert.ok(parseImportUrl(ok), ok);
  const bad = ["http://example.com/a.jpg", "ftp://example.com/a", "https://example.com:8443/a.jpg", "https://example.com:80/a.jpg", "https://user@example.com/a", "https://u:p@example.com/a",
    "https://127.0.0.1/a", "https://2130706433/a", "https://0x7f000001/a", "https://0177.0.0.1/a", "https://127.1/a", "https://[::1]/a", "https://[::ffff:127.0.0.1]/a", "https://[2001:db8::1]/a",
    "https://printer.local/a", "https://db.internal/a", "https://app.localhost/a", "https://localhost/a", "https://intranet/a", "https://example.com\\@evil.test/", "https://exa mple.com/",
    "https://example.1/a", "https://example.0x1/a", "", "not a url", "https://" + "a".repeat(64) + ".com/", "https://example.com/" + "a".repeat(2100)];
  for (const url of bad) assert.throws(() => parseImportUrl(url), error => error instanceof GuardError && error.code === "URL_INVALID", url.slice(0, 40));
  assert.throws(() => parseImportUrl(null), /URL_INVALID/);
});

test("AC-34: every private, loopback, link-local, CGNAT, multicast, reserved, ULA, mapped and metadata address is blocked", () => {
  const blocked = ["0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "100.100.100.200", "127.0.0.1", "127.255.255.254", "169.254.169.254", "169.254.0.1", "172.16.0.1", "172.31.255.255",
    "192.0.0.192", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.19.255.255", "198.51.100.1", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
    "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe", "::ffff:169.254.169.254", "0:0:0:0:0:ffff:c0a8:0101", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "64:ff9b:1::1",
    "2002:7f00:1::", "2002:a9fe:a9fe::1", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "fec0::1", "ff02::1", "100::1", "fd00:ec2::254",
    "garbage", "1.2.3", "300.1.1.1", "1:2:3", ":::", "", null, undefined, 5];
  for (const ip of blocked) assert.equal(isBlockedIp(ip), true, String(ip));
  for (const ip of [PUBLIC_IP, "8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.1", "172.15.0.1", "172.32.0.1", "11.0.0.1", "169.253.1.1", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8", "2002:808:808::1", "64:ff9b::808:808"]) assert.equal(isBlockedIp(ip), false, ip);
});

test("AC-34/35: ONE blocked answer rejects the host; an empty or failing lookup is DNS_FAILED", async () => {
  assert.deepEqual(await resolvePublic("example.com", async () => [PUBLIC_IP, "2606:4700::1111", PUBLIC_IP]), [PUBLIC_IP, "2606:4700::1111"]);
  assert.equal(await codeOf(() => resolvePublic("example.com", async () => [PUBLIC_IP, "10.0.0.5"])), "URL_BLOCKED");
  assert.equal(await codeOf(() => resolvePublic("example.com", async () => ["2606:4700::1111", "fd00::1"])), "URL_BLOCKED");
  assert.equal(await codeOf(() => resolvePublic("example.com", async () => [])), "DNS_FAILED");
  assert.equal(await codeOf(() => resolvePublic("example.com", async () => { throw new Error("ENOTFOUND secret-host"); })), "DNS_FAILED");
});

const withServer = async (handler, run) => {
  const server = http.createServer(handler);
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const calls = [];
  const request = (options, callback) => { calls.push(options); return http.request({ host: "127.0.0.1", port: server.address().port, method: options.method, path: options.path, headers: options.headers, agent: false }, callback); };
  try { return await run({ request, calls }); } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
};
const image = (res, body = PNG, type = "image/png", extra = {}) => { res.writeHead(200, { "content-type": type, "content-length": String(body.length), ...extra }); res.end(body); };
const resolvePublicIp = async () => [PUBLIC_IP];

test("AC-35/37: the connection is pinned to the validated IP with original SNI/Host, identity encoding and verification on", async () => {
  let lookups = 0;
  await withServer((req, res) => image(res), async ({ request, calls }) => {
    const got = await fetchImage("https://Img.Example.com/a/b.png?x=1", { request, resolve: async host => { lookups++; assert.equal(host, "img.example.com"); return [PUBLIC_IP]; } });
    assert.deepEqual([got.mime, [...got.buffer]], ["image/png", [...PNG]]);
    assert.equal(lookups, 1);
    const [options] = calls;
    assert.deepEqual([options.host, options.port, options.servername, options.path, options.rejectUnauthorized], [PUBLIC_IP, 443, "img.example.com", "/a/b.png?x=1", true]);
    assert.deepEqual([options.headers.Host, options.headers["Accept-Encoding"]], ["img.example.com", "identity"]);
  });
});

test("AC-36: up to 3 redirects, each hop fully re-validated; http, private IP, odd port and the 4th hop are refused", async () => {
  const resolve = async host => { if (host === "example.org") return [PUBLIC_IP]; if (host === "rebind.example.net") return ["10.0.0.7"]; throw new Error("nx"); };
  let hops = 0;
  const routes = { "/to-http": "http://example.org/x.png", "/to-private": "https://rebind.example.net/x.png", "/to-ip": "https://169.254.169.254/latest",
    "/to-port": "https://example.org:8443/x.png", "/relative": "/done", "/a": "/b", "/b": "/c", "/c": "/done" };
  await withServer((req, res) => {
    if (req.url === "/done") return image(res);
    if (req.url === "/nolocation") { res.writeHead(302); return res.end(); }
    if (routes[req.url]) { res.writeHead(302, { location: routes[req.url] }); return res.end(); }
    hops++; res.writeHead(302, { location: "/loop" + hops }); res.end();
  }, async ({ request }) => {
    const get = path => fetchImage("https://example.org" + path, { request, resolve });
    assert.equal((await get("/relative")).mime, "image/png");
    assert.equal((await get("/a")).mime, "image/png", "exactly 3 redirects succeed");
    assert.equal(await codeOf(() => get("/to-http")), "URL_INVALID");
    assert.equal(await codeOf(() => get("/to-private")), "URL_BLOCKED");
    assert.equal(await codeOf(() => get("/to-ip")), "URL_INVALID");
    assert.equal(await codeOf(() => get("/to-port")), "URL_INVALID");
    assert.equal(await codeOf(() => get("/nolocation")), "FETCH_FAILED");
    assert.equal(await codeOf(() => get("/start")), "TOO_MANY_REDIRECTS");
    assert.equal(hops, 4, "initial request plus 3 redirects are made, the 4th redirect is refused");
  });
});

test("AC-35: DNS rebinding - public on the first answer, private on the next hop - is refused", async () => {
  let answers = 0;
  await withServer((req, res) => { res.writeHead(302, { location: "https://example.org/again" }); res.end(); }, async ({ request }) => {
    const resolve = async () => (answers++ === 0 ? [PUBLIC_IP] : ["127.0.0.1"]);
    assert.equal(await codeOf(() => fetchImage("https://example.org/start", { request, resolve })), "URL_BLOCKED");
    assert.equal(answers, 2);
  });
});

test("AC-37: only JPG/PNG/WebP images; HTML and encoded bodies refused; bytes cut at the limit even when the header lies", async () => {
  const cases = [["text/html", PNG, {}, "NOT_IMAGE"], ["application/octet-stream", PNG, {}, "NOT_IMAGE"], ["image/gif", PNG, {}, "UNSUPPORTED_TYPE"], ["image/svg+xml", PNG, {}, "UNSUPPORTED_TYPE"],
    ["image/png", PNG, { "content-encoding": "gzip" }, "FETCH_FAILED"], ["image/png", Buffer.alloc(2000), {}, "TOO_LARGE"]];
  for (const [type, body, extra, expected] of cases) {
    await withServer((req, res) => image(res, body, type, extra), async ({ request }) => {
      assert.equal(await codeOf(() => fetchImage("https://example.org/a", { request, resolve: resolvePublicIp, maxBytes: expected === "TOO_LARGE" ? 1000 : undefined })), expected, type + " " + expected);
    });
  }
  await withServer((req, res) => image(res, PNG, "image/jpeg; charset=binary"), async ({ request }) => assert.equal((await fetchImage("https://example.org/a", { request, resolve: resolvePublicIp })).mime, "image/jpeg"));
  // No Content-Length (chunked): the byte counter alone enforces the limit.
  await withServer((req, res) => { res.writeHead(200, { "content-type": "image/png" }); res.write(Buffer.alloc(600)); res.end(Buffer.alloc(600)); }, async ({ request }) =>
    assert.equal(await codeOf(() => fetchImage("https://example.org/a", { request, resolve: resolvePublicIp, maxBytes: 1000 })), "TOO_LARGE"));
  // Content-Length claims small but more arrives: the node parser or the counter stops it; never more than the limit is returned.
  await withServer((req, res) => { res.socket.write("HTTP/1.1 200 OK\r\ncontent-type: image/png\r\nconnection: close\r\n\r\n"); res.socket.write(Buffer.alloc(1500)); res.socket.end(); }, async ({ request }) =>
    assert.equal(await codeOf(() => fetchImage("https://example.org/a", { request, resolve: resolvePublicIp, maxBytes: 1000 })), "TOO_LARGE"));
  await withServer((req, res) => image(res, Buffer.alloc(1000)), async ({ request }) => assert.equal((await fetchImage("https://example.org/a", { request, resolve: resolvePublicIp, maxBytes: 1000 })).buffer.length, 1000));
  await withServer((req, res) => { res.writeHead(404); res.end(); }, async ({ request }) => assert.equal(await codeOf(() => fetchImage("https://example.org/a", { request, resolve: resolvePublicIp })), "FETCH_FAILED"));
});

test("AC-37: a stalled server or a slow body hits the total timeout; a failed connection tries the next validated address", async () => {
  await withServer(() => {}, async ({ request }) => {
    const started = Date.now();
    assert.equal(await codeOf(() => fetchImage("https://example.org/a", { request, resolve: resolvePublicIp, timeoutMs: 150 })), "FETCH_TIMEOUT");
    assert.ok(Date.now() - started < 3000);
  });
  await withServer((req, res) => { res.writeHead(200, { "content-type": "image/png" }); res.write(PNG); }, async ({ request }) =>
    assert.equal(await codeOf(() => fetchImage("https://example.org/a", { request, resolve: resolvePublicIp, timeoutMs: 150 })), "FETCH_TIMEOUT"));
  await withServer((req, res) => image(res), async ({ request, calls }) => {
    const flaky = (options, callback) => options.host === "2606:4700::1111" ? http.request({ host: "127.0.0.1", port: 1, agent: false }, callback) : request(options, callback);
    const got = await fetchImage("https://example.org/a", { request: flaky, resolve: async () => ["2606:4700::1111", PUBLIC_IP] });
    assert.equal(got.mime, "image/png");
    assert.equal(calls.at(-1).host, PUBLIC_IP);
  });
});

test("AC-38: share-link hosts (Drive/Dropbox) are NOT rewritten - patterns could not be verified - and are refused with a clear error", async () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123";
  for (const shared of [`https://drive.google.com/file/d/${id}/view?usp=sharing`, `https://drive.google.com/uc?export=download&id=${id}`, "https://docs.google.com/document/d/abc/edit",
    "https://www.dropbox.com/s/abc123/foto.jpg?dl=0", "https://dropbox.com/scl/fi/abc/foto.png?rlkey=k1&dl=1", "https://DROPBOX.com./s/x/y.jpg"]) {
    assert.throws(() => toDirectUrl(shared), error => error instanceof GuardError && error.code === "SHARE_LINK_UNSUPPORTED" && error.status === 400, shared);
  }
  // Direct image hosts, look-alikes and ordinary URLs pass through untouched (still validated).
  for (const same of ["https://example.com/s/abc/foto.jpg", `https://drive.google.com.example.com/file/d/${id}/view`, "https://dl.dropboxusercontent.com/s/abc/foto.jpg", "https://lh3.googleusercontent.com/abc=w800"]) assert.equal(toDirectUrl(same), same);
  assert.throws(() => toDirectUrl(`http://drive.google.com/file/d/${id}/view`), /URL_INVALID/);
  // Through the tool: a clear error code plus an Indonesian hint, and nothing is downloaded.
  let downloads = 0;
  const importer = createImportUrl({ enabled: () => true, download: async () => { downloads++; return { buffer: PNG, mime: "image/png" }; } });
  const error = await importer.run(fakeCms(), new Headers(), { url: `https://drive.google.com/file/d/${id}/view` }, actor("o1")).catch(e => e);
  assert.ok(error instanceof CmsRequestError);
  assert.deepEqual([error.code, error.status], ["SHARE_LINK_UNSUPPORTED", 400]);
  assert.match(describeFailure(error).detail.hint, /unduhan langsung/);
  assert.equal(downloads, 0);
  assert.match(tools.media_import_url.description, /SHARE_LINK_UNSUPPORTED/);
});

const fakeCms = (seen = []) => ({ media: { upload: async (headers, body, mime) => {
  const reader = body.getReader(); let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; }
  seen.push([mime, size]); return { id: "asset-1", mime };
} } });
const actor = id => ({ subject: id, clientId: "mcpc_a" });
const SECRET_URL = "https://example.com/private/path.png?token=SECRET123";

test("AC-39/40/41: bytes go to media.upload, guard errors keep only a code, one import per Owner and 2 global, switch off = nothing happens", async () => {
  const seen = [];
  const ok = createImportUrl({ enabled: () => true, download: async () => ({ buffer: PNG, mime: "image/png" }) });
  assert.deepEqual(await ok.run(fakeCms(seen), new Headers(), { url: SECRET_URL }, actor("o1")), { id: "asset-1", mime: "image/png" });
  assert.deepEqual(seen, [["image/png", PNG.length]]);

  let downloads = 0;
  const off = createImportUrl({ enabled: () => false, download: async () => { downloads++; } });
  assert.equal(await codeOf(() => off.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("o1"))), "IMPORT_DISABLED");
  assert.equal(downloads, 0);
  assert.deepEqual([importEnabled({}), importEnabled({ MCP_MEDIA_IMPORT_ENABLED: "1" }), importEnabled({ MCP_MEDIA_IMPORT_ENABLED: "TRUE" }), importEnabled({ MCP_MEDIA_IMPORT_ENABLED: "true" })], [false, false, false, true]);

  const guarded = createImportUrl({ enabled: () => true, download: async () => { throw new GuardError("URL_BLOCKED"); } });
  const error = await guarded.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("o1")).catch(e => e);
  assert.ok(error instanceof CmsRequestError); assert.deepEqual([error.code, error.status], ["URL_BLOCKED", 400]);
  const foreign = createImportUrl({ enabled: () => true, download: async () => { throw new Error("connect ECONNREFUSED example.com SECRET123"); } });
  const leaked = await foreign.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("o1")).catch(e => e);
  assert.ok(!leaked.message.includes("SECRET123") && !JSON.stringify(describeFailure(leaked)).includes("SECRET123"));
  assert.equal(await codeOf(() => ok.run(fakeCms(), new Headers(), { url: "http://example.com/a.png" }, actor("o1"))), "URL_INVALID");

  let release; const gate = new Promise(done => { release = done; });
  const slow = createImportUrl({ enabled: () => true, download: async () => { await gate; return { buffer: PNG, mime: "image/png" }; } });
  const first = slow.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("a"));
  assert.equal(await codeOf(() => slow.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("a"))), "IMPORT_BUSY");
  const second = slow.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("b"));
  const busy = await slow.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("c")).catch(e => e);
  assert.deepEqual([busy.code, busy.status], ["IMPORT_BUSY", 429]);
  release(); await Promise.all([first, second]);
  assert.ok(await slow.run(fakeCms(), new Headers(), { url: SECRET_URL }, actor("a")), "slots are released");
});

test("AC-39: the audit target is the host only; schema strict; scope mcp:write; shares the upload rate budget; no logging in the new modules", () => {
  assert.equal(hostOf(SECRET_URL), "example.com");
  assert.equal(hostOf("https://user:pw@Sub.Example.com:443/a?b"), "sub.example.com");
  assert.equal(hostOf("nonsense"), null);
  assert.equal(tools.media_import_url.target({ url: "https://Img.example.com/secret/path.png?token=abc" }, null), "img.example.com");
  assert.equal(tools.media_import_url.target(undefined, null), null);
  assert.deepEqual(parseToolInput("media_import_url", { url: "https://example.com/a.jpg" }), { url: "https://example.com/a.jpg" });
  for (const bad of [{}, { url: "" }, { url: "x".repeat(2049) }, { url: 5 }, { url: "https://example.com/a", extra: 1 }]) assert.throws(() => parseToolInput("media_import_url", bad), error => error.code === "INVALID_INPUT");
  assert.deepEqual([tools.media_import_url.scope, tools.media_import_url.write, tools.media_import_url.refresh], ["mcp:write", true, false]);
  assert.match(readFileSync(new URL("../../src/server/mcp/server.mjs", import.meta.url), "utf8"), /\["media_upload_request", "media_import_url"\]\.includes/);
  for (const file of ["net-guard.mjs", "import-url.mjs"]) assert.ok(!/console\.|NEXT_PUBLIC_/.test(readFileSync(new URL("../../src/server/mcp/" + file, import.meta.url), "utf8")), file);
});

// ---- Real TLS: net-guard against a local HTTPS server with CAs generated at test time (keys live in a temp dir, never in the repo). ----
const findOpenssl = () => {
  const candidates = ["openssl", "C:\\Program Files\\Git\\usr\\bin\\openssl.exe", "C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe", "/usr/bin/openssl", "/opt/homebrew/bin/openssl"];
  for (const candidate of candidates) { try { execFileSync(candidate, ["version"], { stdio: "pipe" }); return candidate; } catch { /* try the next one */ } }
  throw new Error("openssl is required by the TLS guard tests but was not found");
};
// One CA per label, each issuing one server certificate whose only SAN is the given DNS name.
const makePki = names => {
  const openssl = findOpenssl(), dir = mkdtempSync(path.join(os.tmpdir(), "tiny-osaka-tls-"));
  const run = (...args) => execFileSync(openssl, args, { cwd: dir, stdio: "pipe" });
  const issue = (label, dnsName) => {
    run("req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", `${label}-ca.key`, "-out", `${label}-ca.crt`, "-subj", `/CN=Test CA ${label}`, "-days", "2",
      "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign");
    run("req", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-keyout", `${label}.key`, "-out", `${label}.csr`, "-subj", `/CN=${dnsName}`);
    writeFileSync(path.join(dir, `${label}.ext`), `subjectAltName=DNS:${dnsName}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature\n`);
    run("x509", "-req", "-in", `${label}.csr`, "-CA", `${label}-ca.crt`, "-CAkey", `${label}-ca.key`, "-CAcreateserial", "-out", `${label}.crt`, "-days", "2", "-extfile", `${label}.ext`);
    const read = name => readFileSync(path.join(dir, name));
    return { ca: read(`${label}-ca.crt`), key: read(`${label}.key`), cert: read(`${label}.crt`) };
  };
  return { pki: Object.fromEntries(Object.entries(names).map(([label, dnsName]) => [label, issue(label, dnsName)])), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

// HTTPS server on 127.0.0.1 that records the SNI and Host the client presented. The transport is the ONLY test seam: it maps the
// "public" IP the injected resolver returned onto this server and optionally adds a test CA; everything else the guard asked for is forwarded.
const withTlsServer = async (credentials, run) => {
  const seen = { sni: [], hosts: [] };
  const context = tls.createSecureContext({ key: credentials.key, cert: credentials.cert });
  const server = https.createServer({ SNICallback: (name, done) => { seen.sni.push(name); done(null, context); } },
    (req, res) => { seen.hosts.push(req.headers.host); res.writeHead(200, { "content-type": "image/png", "content-length": String(PNG.length) }); res.end(PNG); });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const calls = [], lookups = [];
  const transport = ({ ca } = {}) => (options, callback) => {
    calls.push(options);
    return https.request({ ...options, host: "127.0.0.1", port: server.address().port, ...(ca ? { ca } : {}),
      lookup: (hostname, ...rest) => { lookups.push(hostname); rest.at(-1)(new Error("unexpected DNS lookup")); } }, callback);
  };
  try { return await run({ transport, seen, calls, lookups }); } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
};

test("TLS: certificate verification is on - a trusted CA works; unknown CA, other CA and wrong-name certificates are refused", async () => {
  const { pki, cleanup } = makePki({ good: "img.example.com", rogue: "img.example.com", other: "other.example.org" });
  try {
    const url = "https://img.example.com/a.png";
    const resolve = async () => [PUBLIC_IP];
    await withTlsServer(pki.good, async ({ transport, calls }) => {
      const got = await fetchImage(url, { request: transport({ ca: pki.good.ca }), resolve });
      assert.deepEqual([got.mime, [...got.buffer]], ["image/png", [...PNG]]);
      assert.equal(calls[0].rejectUnauthorized, true, "the guard never relaxes verification");
      // Without the test CA only the system store applies: the same server is untrusted, so verification is really enforced.
      assert.equal(await codeOf(() => fetchImage(url, { request: transport(), resolve })), "FETCH_FAILED");
      // Another CA does not vouch for this server either.
      assert.equal(await codeOf(() => fetchImage(url, { request: transport({ ca: pki.rogue.ca }), resolve })), "FETCH_FAILED");
    });
    // A certificate that chains to the trusted CA but names another host: identity is checked against the ORIGINAL name (servername), not the IP.
    await withTlsServer(pki.other, async ({ transport }) => {
      assert.equal(await codeOf(() => fetchImage(url, { request: transport({ ca: pki.other.ca }), resolve })), "FETCH_FAILED");
      assert.equal((await fetchImage("https://other.example.org/a.png", { request: transport({ ca: pki.other.ca }), resolve })).mime, "image/png", "passes under its own name");
    });
  } finally { cleanup(); }
});

test("TLS: SNI and Host stay the original name and the connection goes to the validated IP, never to a fresh DNS answer", async () => {
  const { pki, cleanup } = makePki({ good: "img.example.com" });
  try {
    let resolved = 0;
    await withTlsServer(pki.good, async ({ transport, seen, calls, lookups }) => {
      const resolve = async host => { resolved++; assert.equal(host, "img.example.com"); return [PUBLIC_IP]; };
      await fetchImage("https://Img.Example.com/a/b.png?x=1", { request: transport({ ca: pki.good.ca }), resolve });
      assert.deepEqual(seen.sni, ["img.example.com"], "SNI is the original host name");
      assert.deepEqual(seen.hosts, ["img.example.com"], "Host header is the original host name");
      assert.deepEqual([calls[0].host, calls[0].port, calls[0].servername], [PUBLIC_IP, 443, "img.example.com"], "the dialed address is the one the validator approved");
      assert.equal(resolved, 1, "one DNS lookup per hop");
      assert.deepEqual(lookups, [], "no hostname lookup at connect time (the host option is an IP literal)");
    });
    // The production guard still refuses to dial blocked answers, although the test transport could reach loopback.
    await withTlsServer(pki.good, async ({ transport, calls }) => {
      for (const answers of [["127.0.0.1"], [PUBLIC_IP, "10.0.0.9"]]) {
        assert.equal(await codeOf(() => fetchImage("https://img.example.com/a.png", { request: transport({ ca: pki.good.ca }), resolve: async () => answers })), "URL_BLOCKED");
      }
      assert.equal(calls.length, 0, "nothing was dialed");
    });
  } finally { cleanup(); }
});
