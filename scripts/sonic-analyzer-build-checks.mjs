import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareSonicAnalyzer } from "./build-sonic-analyzer.mjs";

function fixture(t, platform) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sonic-build-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("sonic-build-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const run = (command, args) => {
    if (command === "cargo") {
      const triple = args[args.indexOf("--target") + 1];
      const binary = path.join(root, "Tools/sonic-analyzer/target", triple, "release", `music-sonic-analyzer${platform === "win32" ? ".exe" : ""}`);
      fs.mkdirSync(path.dirname(binary), { recursive: true });
      fs.writeFileSync(binary, triple);
    } else if (command === "lipo") {
      fs.writeFileSync(args[4], `${fs.readFileSync(args[1], "utf8")}+${fs.readFileSync(args[2], "utf8")}`);
    } else {
      assert.fail(`Unexpected build command: ${command}`);
    }
  };
  return { root, platform, run };
}

test("universal macOS preparation supplies sidecars for both Cargo targets and final bundling", t => {
  const options = fixture(t, "darwin");
  prepareSonicAnalyzer({ ...options, target: "universal-apple-darwin" });
  // Each Tauri build script validates externalBin against its own Cargo TARGET.
  for (const triple of ["aarch64-apple-darwin", "x86_64-apple-darwin"]) {
    assert.equal(fs.readFileSync(path.join(options.root, "src-tauri/binaries", `music-sonic-analyzer-${triple}`), "utf8"), triple);
  }
  assert.equal(fs.readFileSync(path.join(options.root, "src-tauri/binaries/music-sonic-analyzer-universal-apple-darwin"), "utf8"), "aarch64-apple-darwin+x86_64-apple-darwin");
});

test("Windows preparation keeps the target suffix and executable extension", t => {
  const options = fixture(t, "win32");
  prepareSonicAnalyzer({ ...options, target: "x86_64-pc-windows-msvc" });
  assert.equal(fs.readFileSync(path.join(options.root, "src-tauri/binaries/music-sonic-analyzer-x86_64-pc-windows-msvc.exe"), "utf8"), "x86_64-pc-windows-msvc");
});
