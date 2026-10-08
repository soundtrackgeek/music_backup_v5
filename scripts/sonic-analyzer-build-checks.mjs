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
    } else if (command.includes("music-sonic-analyzer")) {
      assert.ok(args[0].endsWith("large-id3.mp3"));
      return JSON.stringify({ profile: "bliss-0.13.0-symphonia-0.6.1-v2-full-mp3", features: Array(23).fill(0.5), weights: Array(23 * 23).fill(1) });
    } else {
      assert.fail(`Unexpected build command: ${command}`);
    }
  };
  return { root, platform, hostArch: "x64", run };
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

test("a sidecar that cannot decode tagged MP3s blocks Windows bundling", t => {
  const options = fixture(t, "win32");
  const run = (command, args, execution) => {
    if (command.includes("music-sonic-analyzer") && command !== "cargo") {
      throw new Error("no suitable format reader found");
    }
    return options.run(command, args, execution);
  };
  assert.throws(() => prepareSonicAnalyzer({ ...options, run, target: "x86_64-pc-windows-msvc" }), /no suitable format reader/);
  assert.equal(fs.existsSync(path.join(options.root, "src-tauri/binaries/music-sonic-analyzer-x86_64-pc-windows-msvc.exe")), false);
});

test("an invalid analyzer profile blocks bundling", t => {
  const options = fixture(t, "win32");
  const run = (command, args, execution) => command === "cargo" ? options.run(command, args, execution) : JSON.stringify({ profile: "old", features: [], weights: [] });
  assert.throws(() => prepareSonicAnalyzer({ ...options, run, target: "x86_64-pc-windows-msvc" }), /tagged-MP3 smoke test/);
});

test("cross-compiling does not execute a foreign architecture", t => {
  const options = fixture(t, "darwin");
  let executed = false;
  const run = (command, args, execution) => {
    if (command !== "cargo") executed = true;
    return options.run(command, args, execution);
  };
  prepareSonicAnalyzer({ ...options, run, target: "aarch64-apple-darwin" });
  assert.equal(executed, false);
});
