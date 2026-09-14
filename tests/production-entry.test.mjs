import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(rootDir, "dist");

async function exists(target) {
  return access(target).then(
    () => true,
    () => false
  );
}

test("the production entry serves only the apps/web presentation", async () => {
  const html = await readFile(path.join(distDir, "index.html"), "utf8");
  const buildSource = await readFile(path.join(rootDir, "scripts", "build.mjs"), "utf8");

  assert.match(buildSource, /webAppDir/);
  assert.match(html, /href="app\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /app\.bundle\.js|css\/(?:web|web-pages|web-ui|responsive)\.css/);
  assert.equal(await exists(path.join(distDir, "app.bundle.js")), false);
  assert.equal(await exists(path.join(distDir, "css")), false);
});
