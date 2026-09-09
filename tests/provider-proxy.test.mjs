import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRedirectRequest, validateTarget } from "../scripts/providerProxy.mjs";

test("provider redirects preserve safe methods and resolve relative URLs", () => {
  const original = {
    url: "https://media.example/path/start",
    method: "POST",
    body: "a=1",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "text/html" }
  };
  const converted = nextRedirectRequest(original, original.url, "/next", 302);
  assert.equal(converted.url, "https://media.example/next");
  assert.equal(converted.method, "GET");
  assert.equal(converted.body, "");
  assert.equal(converted.headers["Content-Type"], undefined);
  const preserved = nextRedirectRequest(original, original.url, "https://cdn.example/file", 307);
  assert.equal(preserved.method, "POST");
  assert.equal(preserved.body, "a=1");
});

test("every redirect destination still requires an exact public HTTPS allowlist entry", () => {
  assert.equal(
    validateTarget("https://cdn.example/video", new Set(["cdn.example"])).hostname,
    "cdn.example"
  );
  assert.throws(
    () => validateTarget("https://127.0.0.1/private", new Set(["127.0.0.1"])),
    /not allowed/
  );
  assert.throws(
    () => validateTarget("https://other.example/file", new Set(["cdn.example"])),
    /not allowed/
  );
});
