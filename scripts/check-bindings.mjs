// Fails when src/bindings.ts differs from what the Rust commands generate.
// Regenerate with `npm run bindings` and commit the result.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const committedPath = new URL("../src/bindings.ts", import.meta.url);
const tempDir = mkdtempSync(join(tmpdir(), "music-library-bindings-"));
const generatedPath = join(tempDir, "bindings.ts");
const normalize = (text) => text.replace(/\r\n/g, "\n");

try {
  const result = spawnSync(
    "cargo",
    ["run", "--quiet", "--", "--export-bindings", generatedPath],
    { cwd: new URL("../src-tauri/", import.meta.url), stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    console.error("Could not generate TypeScript bindings from the Rust commands.");
    process.exit(1);
  }
  const generated = normalize(readFileSync(generatedPath, "utf8"));
  const committed = normalize(readFileSync(committedPath, "utf8"));
  if (generated !== committed) {
    console.error("src/bindings.ts is out of date with the Rust commands. Run `npm run bindings` and commit the result.");
    process.exit(1);
  }
  console.log("TypeScript bindings match the Rust commands.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
