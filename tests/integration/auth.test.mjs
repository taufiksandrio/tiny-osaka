import assert from "node:assert/strict";
import test from "node:test";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { createAuthService } from "../../src/server/auth/service.mjs";
import { provisionAccount } from "../../src/server/auth/provision.mjs";
import { randomUUID } from "node:crypto";
import { createAuthFixture, callAuth, cookieJar } from "../fixtures/auth.mjs";

test("local auth integration: real library sessions, reset, MFA and privilege boundary", async t => {
  const fixture = await createAuthFixture();
  const { accounts: [owner, staff], password, pool } = fixture;
  let currentPassword = password;
  const login = async (account = owner, input = currentPassword) => {
    const jar = cookieJar();
    const response = await callAuth(fixture, "/sign-in/email", { email: account.email, password: input }, jar);
    assert.equal(response.status, 200);
    return { jar, data: await response.json(), response };
  };
  try {
    await t.test("no registration, unauthorized origin, role mutation or private table reads", async () => {
      assert.equal((await callAuth(fixture, "/sign-up/email", { email: owner.email, password })).status, 404);
      assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password }, null, { headers: { origin: "https://evil.invalid" } })).status, 403);
      assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password, callbackURL: "https://evil.invalid" })).status, 400);
      assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password: "x".repeat(9000) })).status, 413);
      for (const query of ["UPDATE cms_auth.roles SET role='owner'", "INSERT INTO cms_auth.roles(user_id,role) VALUES ('fake','owner')", "SELECT * FROM public.page_revisions", "SELECT * FROM cms_auth.audit", "DELETE FROM cms_auth.audit"]) {
        await assert.rejects(pool.query(query), error => error.code === "42501");
      }
      assert.equal(await (await callAuth(fixture, "/get-session")).json(), null);
    });
    await t.test("credential login creates HttpOnly session; role and token are not client-controlled", async () => {
      assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password: "wrong-password" })).status, 401);
      const { jar, data, response } = await login();
      assert.ok(!Object.hasOwn(data, "token"));
      assert.ok(response.headers.getSetCookie().some(cookie => /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
      const current = await (await callAuth(fixture, "/get-session", undefined, jar)).json();
      assert.equal(current.user.role, "owner"); assert.ok(!JSON.stringify(current).includes("token"));
      const staffJar = cookieJar();
      assert.equal((await callAuth(fixture, "/sign-in/email", { email: staff.email, password, role: "owner" }, staffJar)).status, 200);
      assert.equal((await (await callAuth(fixture, "/get-session", undefined, staffJar)).json()).user.role, "staff");
      assert.equal((await callAuth(fixture, "/two-factor/enable", { password }, staffJar)).status, 403);
      assert.equal((await callAuth(fixture, "/sign-out", {}, jar)).status, 200);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, jar)).json(), null);
    });
    await fixture.expireLimits();
    await t.test("idle expiry and account disable are enforced on server and revoke sessions", async () => {
      const { jar } = await login();
      await fixture.owner.query("UPDATE cms_auth.session_activity SET last_active_at=clock_timestamp()-interval '61 minutes' WHERE session_id IN (SELECT id FROM cms_auth.sessions WHERE user_id=$1)", [owner.id]);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, jar)).json(), null);
      const fresh = await login(staff, password);
      await fixture.owner.query("UPDATE cms_auth.roles SET enabled=false WHERE user_id=$1", [staff.id]);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, fresh.jar)).json(), null);
      assert.notEqual((await callAuth(fixture, "/sign-in/email", { email: staff.email, password })).status, 200);
      await fixture.owner.query("UPDATE cms_auth.roles SET enabled=true WHERE user_id=$1", [staff.id]);
    });
    await fixture.expireLimits();
    await t.test("database prevents expiry extension beyond 24h and session identity rewrites", async () => {
      const { jar } = await login();
      await assert.rejects(pool.query("UPDATE cms_auth.sessions SET expires_at=created_at+interval '25 hours' WHERE user_id=$1", [owner.id]), error => error.code === "23514");
      await assert.rejects(pool.query("UPDATE cms_auth.sessions SET created_at=clock_timestamp() WHERE user_id=$1", [owner.id]), error => error.code === "23514");
      await fixture.owner.query("UPDATE cms_auth.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1", [owner.id]);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, jar)).json(), null);
    });
    await fixture.expireLimits();
    await t.test("concurrent login limit persists across service instances", async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => callAuth(fixture, "/sign-in/email", { email: staff.email, password: "wrong-password" })));
      assert.equal(results.filter(response => response.status === 429).length, 1);
      const restarted = { ...fixture, service: createAuthService({ pool, env: fixture.env }) };
      assert.equal((await callAuth(restarted, "/sign-in/email", { email: staff.email, password })).status, 429);
    });
    await fixture.expireLimits();
    await t.test("reset conceals account existence and requires verified inbox ownership", async () => {
      const known = await (await callAuth(fixture, "/request-password-reset", { email: owner.email })).json();
      const unknown = await (await callAuth(fixture, "/request-password-reset", { email: "absent@example.invalid" })).json();
      assert.deepEqual(known, unknown); assert.equal(fixture.emails.length, 0);
      const { jar } = await login();
      assert.equal((await callAuth(fixture, "/send-verification-email", { email: owner.email, callbackURL: "/admin" }, jar)).status, 200);
      assert.equal(fixture.emails.length, 1);
      const url = new URL(fixture.emails[0].url);
      const verification = await callAuth(fixture, "/verify-email", { token: new URLSearchParams(url.hash.slice(1)).get("token") });
      assert.ok(verification.status < 400);
      assert.equal((await fixture.owner.query("SELECT email_verified FROM cms_auth.users WHERE id=$1", [owner.id])).rows[0].email_verified, true);
    });
    await fixture.expireLimits();
    await t.test("reset is single-use, rejects expired tokens and revokes all active sessions", async () => {
      const { jar } = await login();
      assert.equal((await callAuth(fixture, "/request-password-reset", { email: owner.email })).status, 200);
      const token = new URLSearchParams(new URL(fixture.emails.at(-1).url).hash.slice(1)).get("token"); assert.ok(token);
      currentPassword = password + "-changed";
      assert.equal((await callAuth(fixture, "/reset-password", { token, newPassword: currentPassword })).status, 200);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, jar)).json(), null);
      assert.equal((await callAuth(fixture, "/reset-password", { token, newPassword: password })).status, 400);
      await callAuth(fixture, "/request-password-reset", { email: owner.email });
      const expired = new URLSearchParams(new URL(fixture.emails.at(-1).url).hash.slice(1)).get("token");
      await fixture.owner.query("UPDATE cms_auth.verifications SET expires_at=clock_timestamp()-interval '1 second' WHERE identifier=$1", ["reset-password:" + expired]);
      assert.equal((await callAuth(fixture, "/reset-password", { token: expired, newPassword: password })).status, 400);
      assert.equal((await callAuth(fixture, "/sign-in/email", { email: owner.email, password })).status, 401);
    });
    await fixture.expireLimits();
    await t.test("Owner TOTP enrollment, challenge and single-use recovery codes", async () => {
      const { jar } = await login();
      const response = await callAuth(fixture, "/two-factor/enable", { password: currentPassword }, jar);
      assert.equal(response.status, 200);
      const data = await response.json(); assert.ok(data.totpURI && data.backupCodes.length);
      const secret = new TextDecoder().decode(base32.decode(new URL(data.totpURI).searchParams.get("secret")));
      const otp = () => createOTP(secret).totp();
      assert.equal((await callAuth(fixture, "/two-factor/verify-totp", { code: await otp() }, jar)).status, 200);
      await callAuth(fixture, "/sign-out", {}, jar);
      const challenge = await login(); assert.equal(challenge.data.twoFactorRedirect, true);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, challenge.jar)).json(), null);
      assert.notEqual((await callAuth(fixture, "/two-factor/verify-totp", { code: "invalid" }, challenge.jar)).status, 200);
      assert.equal((await callAuth(fixture, "/two-factor/verify-backup-code", { code: data.backupCodes[0] }, challenge.jar)).status, 200);
      assert.equal((await (await callAuth(fixture, "/get-session", undefined, challenge.jar)).json()).user.role, "owner");
      await callAuth(fixture, "/sign-out", {}, challenge.jar);
      const again = await login();
      assert.notEqual((await callAuth(fixture, "/two-factor/verify-backup-code", { code: data.backupCodes[0] }, again.jar)).status, 200);
      assert.equal((await callAuth(fixture, "/two-factor/verify-totp", { code: await otp(), trustDevice: true }, again.jar)).status, 400);
      assert.equal((await callAuth(fixture, "/two-factor/verify-totp", { code: await otp() }, again.jar)).status, 200);
      assert.equal((await callAuth(fixture, "/two-factor/disable", { password: currentPassword }, again.jar)).status, 200);
    });
    await t.test("audit is append-only and contains no credentials, email, MFA or reset tokens", async () => {
      const audit = JSON.stringify((await fixture.owner.query("SELECT * FROM cms_auth.audit")).rows);
      for (const secret of [password, currentPassword, owner.email, staff.email]) assert.ok(!audit.includes(secret));
      await assert.rejects(fixture.owner.query("UPDATE cms_auth.audit SET event='logout'"), error => error.code === "23514");
      const unwired = { ...fixture, service: createAuthService({ pool, env: fixture.env }) };
      assert.equal((await callAuth(unwired, "/request-password-reset", { email: owner.email })).status, 503);
    });
    await fixture.expireLimits();
    await t.test("HTTPS configuration emits Secure HttpOnly cookies", async () => {
      const env = { ...fixture.env, BETTER_AUTH_URL: "https://localhost:3033" };
      const secure = { ...fixture, env, service: createAuthService({ pool, env }) };
      const response = await callAuth(secure, "/sign-in/email", { email: owner.email, password: currentPassword });
      assert.equal(response.status, 200);
      assert.ok(response.headers.getSetCookie().some(cookie => cookie.startsWith("__Secure-") && /; Secure/i.test(cookie) && /HttpOnly/i.test(cookie)));
    });
    await fixture.expireLimits();
    await t.test("password minimum: five rejected, six accepted by provisioning, login and reset", async () => {
      const email = `qa-password-${randomUUID()}@example.invalid`;
      const input = { client: fixture.owner, email, role: "staff", name: "QA password boundary" };
      await assert.rejects(provisionAccount({ ...input, password: "A1!bc" }), /Invalid internal account input/);
      const created = await provisionAccount({ ...input, password: "Q4!abc" });
      fixture.accounts.push({ ...created, email });
      const jar = cookieJar();
      assert.equal((await callAuth(fixture, "/sign-in/email", { email, password: "Q4!abc" }, jar)).status, 200);
      await fixture.owner.query("UPDATE cms_auth.users SET email_verified=true WHERE id=$1", [created.id]);
      await callAuth(fixture, "/request-password-reset", { email });
      const token = new URLSearchParams(new URL(fixture.emails.at(-1).url).hash.slice(1)).get("token");
      assert.ok(token);
      assert.equal((await callAuth(fixture, "/reset-password", { token, newPassword: "A1!bc" })).status, 400);
      assert.equal((await callAuth(fixture, "/reset-password", { token, newPassword: "R5!abc" })).status, 200);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, jar)).json(), null);
      assert.equal((await callAuth(fixture, "/sign-in/email", { email, password: "R5!abc" })).status, 200);
      assert.equal((await callAuth(fixture, "/sign-in/email", { email, password: "Q4!abc" })).status, 401);
    });
  } finally { await fixture.cleanup(); }
});

test("account password change regression (PR-3): wrong password, session revocation, audit, validation, transport, MFA RBAC", async t => {
  const fixture = await createAuthFixture();
  const { accounts: [owner, staff], password, pool } = fixture;
  const signIn = async (account, input) => {
    const jar = cookieJar();
    const response = await callAuth(fixture, "/sign-in/email", { email: account.email, password: input }, jar);
    return { jar, response };
  };
  const change = (jar, body, options) => callAuth(fixture, "/change-password", body, jar, options);
  const auditCount = async (event, userId) => Number((await fixture.owner.query("SELECT count(*) FROM cms_auth.audit WHERE event=$1 AND user_id=$2", [event, userId])).rows[0].count);
  try {
    await t.test("session constants are 24h absolute and 1h idle (AC-10)", async () => {
      const { ABSOLUTE_SESSION_MS, IDLE_SESSION_MS } = await import("../../src/server/auth/policy.mjs");
      assert.equal(ABSOLUTE_SESSION_MS, 24 * 60 * 60 * 1000);
      assert.equal(IDLE_SESSION_MS, 60 * 60 * 1000);
      const { jar } = await signIn(owner, password);
      const row = (await fixture.owner.query("SELECT extract(epoch FROM expires_at-created_at) AS span FROM cms_auth.sessions WHERE user_id=$1", [owner.id])).rows[0];
      assert.ok(Math.abs(Number(row.span) - 86400) <= 2);
      await fixture.owner.query("UPDATE cms_auth.session_activity SET last_active_at=clock_timestamp()-interval '61 minutes' WHERE session_id IN (SELECT id FROM cms_auth.sessions WHERE user_id=$1)", [owner.id]);
      assert.equal(await (await callAuth(fixture, "/get-session", undefined, jar)).json(), null);
    });
    await fixture.expireLimits();
    await t.test("Owner without MFA logs in normally (AC-11)", async () => {
      const { response } = await signIn(owner, password);
      assert.equal(response.status, 200);
      assert.notEqual((await response.json()).twoFactorRedirect, true);
    });
    await fixture.expireLimits();
    await t.test("MFA endpoints: anonymous 401, Staff 403 (AC-9)", async () => {
      for (const path of ["/two-factor/enable", "/two-factor/disable", "/two-factor/generate-backup-codes"]) {
        assert.equal((await callAuth(fixture, path, { password })).status, 401);
        const { jar } = await signIn(staff, password);
        assert.equal((await callAuth(fixture, path, { password }, jar)).status, 403);
      }
    });
    await fixture.expireLimits();
    await t.test("transport rules: no session 401, bad origin 403, non-JSON 415 (AC-6)", async () => {
      assert.equal((await change(null, { currentPassword: password, newPassword: "Zz9!newpass" })).status, 401);
      const { jar } = await signIn(staff, password);
      assert.equal((await change(jar, { currentPassword: password, newPassword: "Zz9!newpass" }, { headers: { origin: "https://evil.invalid" } })).status, 403);
      const response = await fixture.service.handle(new Request(fixture.env.BETTER_AUTH_URL + "/api/auth/change-password", {
        method: "POST", headers: { "content-type": "text/plain", origin: fixture.env.BETTER_AUTH_URL, cookie: jar.header() },
        body: JSON.stringify({ currentPassword: password, newPassword: "Zz9!newpass" }) }));
      assert.equal(response.status, 415);
      assert.equal((await signIn(staff, password)).response.status, 200);
    });
    await fixture.expireLimits();
    await t.test("wrong current password is rejected generically and changes nothing (AC-3, AC-7)", async () => {
      const { jar } = await signIn(staff, password);
      const before = await auditCount("password_changed", staff.id);
      const response = await change(jar, { currentPassword: "wrong-current-pw", newPassword: "Zz9!newpass" });
      assert.ok(response.status >= 400 && response.status < 500 || response.status === 401);
      const text = await (await change(jar, { currentPassword: "wrong-current-pw", newPassword: "Zz9!newpass" })).text();
      for (const secret of ["wrong-current-pw", "Zz9!newpass", password]) assert.ok(!text.includes(secret));
      assert.equal(await auditCount("password_changed", staff.id), before);
      assert.equal((await signIn(staff, password)).response.status, 200);
    });
    await fixture.expireLimits();
    for (const [label, account, index] of [["Owner", owner, 0], ["Staff", staff, 1]]) {
      await t.test(`${label}: change-password revokes other sessions, keeps current, audits actor (AC-2, AC-4, AC-7)`, async () => {
        const next = `Nw${index}!` + randomUUID().slice(0, 12);
        const current = await signIn(account, password), other = await signIn(account, password);
        const before = await auditCount("password_changed", account.id);
        const otherActorBefore = await auditCount("password_changed", (index ? owner : staff).id);
        const response = await change(current.jar, { currentPassword: password, newPassword: next });
        assert.equal(response.status, 200);
        assert.ok(!(await response.text()).includes(next));
        assert.equal(await (await callAuth(fixture, "/get-session", undefined, other.jar)).json(), null);
        assert.equal((await (await callAuth(fixture, "/get-session", undefined, current.jar)).json())?.user?.role, account === owner ? "owner" : "staff");
        assert.equal(await auditCount("password_changed", account.id), before + 1);
        assert.equal(await auditCount("password_changed", (index ? owner : staff).id), otherActorBefore);
        assert.equal((await signIn(account, password)).response.status, 401);
        assert.equal((await signIn(account, next)).response.status, 200);
        const audit = JSON.stringify((await fixture.owner.query("SELECT * FROM cms_auth.audit")).rows);
        for (const secret of [password, next]) assert.ok(!audit.includes(secret));
        account.currentPassword = next;
      });
      await fixture.expireLimits();
    }
    await t.test("password length 6-128 enforced server-side on change-password (AC-5)", async () => {
      const pw = owner.currentPassword;
      const { jar } = await signIn(owner, pw);
      assert.equal((await change(jar, { currentPassword: pw, newPassword: "A1!bc" })).status, 400);
      assert.equal((await change(jar, { currentPassword: pw, newPassword: "A1!" + "x".repeat(126) })).status, 400);
      assert.equal((await signIn(owner, pw)).response.status, 200);
      assert.equal((await change(jar, { currentPassword: pw, newPassword: "A1!" + "x".repeat(125) })).status, 200);
      owner.currentPassword = "A1!" + "x".repeat(125);
      await assert.rejects(provisionAccount({ client: fixture.owner, email: `qa-max-${randomUUID()}@example.invalid`, role: "staff", name: "QA max", password: "A1!" + "x".repeat(126) }), /Invalid internal account input/);
    });
  } finally { await fixture.cleanup(); }
});
