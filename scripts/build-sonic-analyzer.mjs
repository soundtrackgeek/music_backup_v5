import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function prepareSonicAnalyzer({ root, target, platform = process.platform, hostArch = process.arch, run = execFileSync }) {
  const suffix = platform === "win32" ? ".exe" : "";
  const manifest = resolve(root, "Tools/sonic-analyzer/Cargo.toml");
  const destination = resolve(root, "src-tauri/binaries");
  mkdirSync(destination, { recursive: true });
  function build(triple) {
    run("cargo", ["build", "--locked", "--release", "--manifest-path", manifest, "--target", triple], { cwd: root, stdio: "inherit" });
    return resolve(root, `Tools/sonic-analyzer/target/${triple}/release/music-sonic-analyzer${suffix}`);
  }
  function smoke(binary) {
    const output = run(binary, [resolve(root, "Tools/sonic-analyzer/tests/fixtures/large-id3.mp3")], {
      cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 64 * 1024, windowsHide: true,
    });
    const value = JSON.parse(output);
    if (value.profile !== "bliss-0.13.0-symphonia-0.6.1-v2-full-mp3"
      || !Array.isArray(value.features) || value.features.length !== 23 || !value.features.every(Number.isFinite)
      || !Array.isArray(value.weights) || value.weights.length !== 23 * 23 || !value.weights.every(Number.isFinite)) {
      throw new Error("Built audio analyzer failed the tagged-MP3 smoke test");
    }
  }
  if (target === "universal-apple-darwin") {
    const arm = build("aarch64-apple-darwin");
    const intel = build("x86_64-apple-darwin");
    // Cargo builds each architecture separately and Tauri checks its sidecar then.
    copyFileSync(arm, resolve(destination, "music-sonic-analyzer-aarch64-apple-darwin"));
    copyFileSync(intel, resolve(destination, "music-sonic-analyzer-x86_64-apple-darwin"));
    run("lipo", ["-create", arm, intel, "-output", resolve(destination, `music-sonic-analyzer-${target}`)], { stdio: "inherit" });
    if (platform === "darwin") smoke(resolve(destination, `music-sonic-analyzer-${target}`));
  } else {
    const binary = build(target);
    const nativeArch = { x64: "x86_64", arm64: "aarch64" }[hostArch];
    const nativePlatform = { win32: "-windows-", darwin: "-apple-darwin", linux: "-linux-" }[platform];
    if (nativeArch && nativePlatform && target.startsWith(`${nativeArch}-`) && target.includes(nativePlatform)) smoke(binary);
    copyFileSync(binary, resolve(destination, `music-sonic-analyzer-${target}${suffix}`));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const target = process.argv[2] || process.env.TAURI_ENV_TARGET_TRIPLE || execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
  prepareSonicAnalyzer({ root, target });
}
