import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the new router accounts for every registered legacy route", async () => {
  const source = await readFile(path.join(appDir, "src/navigation/routes.js"), "utf8");
  const expected = [
    "home",
    "player",
    "account",
    "authQrSignIn",
    "authSignIn",
    "syncCode",
    "profileSelection",
    "experienceModeSelection",
    "essentialAddonSetup",
    "detail",
    "library",
    "search",
    "discover",
    "settings",
    "debugConsole",
    "trakt",
    "supportersContributors",
    "licensesAttributions",
    "plugin",
    "plugins",
    "catalogOrder",
    "stream",
    "castDetail",
    "catalogSeeAll",
    "tmdbEntityBrowse",
    "folderDetail"
  ];
  expected.forEach((route) => assert.match(source, new RegExp(`\\b${route}:`), route));
});

test("apps/web does not import legacy screen renderers or presentation CSS", async () => {
  const buildSource = await readFile(path.join(appDir, "scripts/build.mjs"), "utf8");
  const files = await readdir(path.join(appDir, "src"), { recursive: true });
  const sources = await Promise.all(
    files
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFile(path.join(appDir, "src", file), "utf8"))
  );
  assert.doesNotMatch(sources.join("\n"), /js\/ui\//);
  assert.doesNotMatch(buildSource, /css\/(?:web|web-pages|web-ui|responsive)\.css/);
});

test("the player screen delegates playback to the shared controller", async () => {
  const source = await readFile(path.join(appDir, "src/screens/player/playerScreen.js"), "utf8");
  assert.match(source, /PlayerController\.play\(/);
  assert.match(source, /PlayerController\.seekToSeconds/);
  assert.match(source, /PlayerController\.stop/);
});

test("adaptive libraries load before the shared player chooses an engine", async () => {
  const source = await readFile(
    path.resolve(appDir, "../../js/core/player/playerController.js"),
    "utf8"
  );
  const playBody = source.slice(source.indexOf("  async play("));
  const loadIndex = playBody.indexOf("await this.ensureAdaptiveLibrariesForSource(sourceType)");
  const chooseIndex = playBody.indexOf("this.choosePlaybackEngine(url, sourceType, itemType)");
  assert.ok(loadIndex >= 0, "adaptive library loading is present");
  assert.ok(chooseIndex > loadIndex, "engine selection happens after adaptive libraries load");
});
