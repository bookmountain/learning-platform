import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("Dockerfile copies every local module imported by server.js", async () => {
  const [dockerfile, server] = await Promise.all([
    readFile(path.join(projectRoot, "Dockerfile"), "utf8"),
    readFile(path.join(projectRoot, "server.js"), "utf8"),
  ]);
  const copiedFiles = new Set(
    [...dockerfile.matchAll(/^COPY\s+(\S+)\s+\.\/$/gm)].map((match) => match[1])
  );
  const localModules = [...server.matchAll(/^import\s+.+?\s+from\s+"\.\/(.+?)";$/gm)].map(
    (match) => match[1]
  );

  for (const modulePath of localModules) {
    assert.ok(copiedFiles.has(modulePath), `Dockerfile must copy ${modulePath}`);
  }
});
