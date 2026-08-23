/**
 * Copies the two Swagger UI assets out of node_modules into public/ before the
 * build.
 *
 * They are served from our own origin on purpose. The page used to pull them
 * from a CDN, which failed twice over: the CSP allows no third-party script,
 * and a self-hosted instance behind a firewall cannot reach jsdelivr at all.
 *
 * public/ is copied into the standalone image (see the Dockerfile), so nothing
 * else has to know about this. The copies are gitignored — the package is the
 * source of truth, and vendoring 1.4 MB of built JavaScript into the repository
 * would only make it drift.
 */
import { mkdir, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const from = dirname(require.resolve("swagger-ui-dist/package.json"));
const to = join(process.cwd(), "public", "swagger");

// Only the bundle. The stylesheet is imported by the component and goes through
// webpack instead.
const FILES = ["swagger-ui-bundle.js"];

await mkdir(to, { recursive: true });
for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
}
console.log(`swagger-ui assets copied to public/swagger (${FILES.join(", ")})`);
