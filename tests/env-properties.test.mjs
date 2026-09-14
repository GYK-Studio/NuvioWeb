import assert from "node:assert/strict";
import test from "node:test";
import { resolveBackendDiscovery } from "../scripts/envProperties.mjs";

test("backend discovery supplies public auth configuration", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://discovery.example/.well-known/nuvio");
    assert.equal(init.headers.Accept, "application/json");
    return new Response(
      JSON.stringify({
        service: "nuvio",
        backend_url: "https://auth.example/",
        publishable_key: "public-test-key"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  try {
    const result = await resolveBackendDiscovery({
      NUVIO_BACKEND_URL: "https://discovery.example/",
      NUVIO_SUPABASE_URL: "",
      NUVIO_SUPABASE_ANON_KEY: "",
      AVATAR_PUBLIC_BASE_URL: ""
    });
    assert.equal(result.NUVIO_SUPABASE_URL, "https://auth.example");
    assert.equal(result.NUVIO_SUPABASE_ANON_KEY, "public-test-key");
    assert.equal(
      result.AVATAR_PUBLIC_BASE_URL,
      "https://auth.example/storage/v1/object/public/avatars"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual auth configuration bypasses backend discovery", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("discovery should not run");
  };
  try {
    const env = {
      NUVIO_BACKEND_URL: "https://discovery.example",
      NUVIO_SUPABASE_URL: "https://manual.example",
      NUVIO_SUPABASE_ANON_KEY: "manual-public-key"
    };
    assert.equal(await resolveBackendDiscovery(env), env);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
