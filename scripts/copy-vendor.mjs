import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["node_modules/@mozilla/readability/Readability.js", "vendor/Readability.js"],
  ["node_modules/@mozilla/readability/LICENSE.md", "vendor/LICENSE-Readability.md"],
  ["node_modules/turndown/lib/turndown.browser.umd.js", "vendor/turndown.js"],
  ["node_modules/turndown/LICENSE", "vendor/LICENSE-Turndown"]
];

for (const [source, destination] of files) {
  const target = resolve(root, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, source), target);
}

console.log("Bundled Readability and Turndown into vendor/.");
