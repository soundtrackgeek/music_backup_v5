import fs from "node:fs";
import path from "node:path";

const [, , version, tag, repository, notesPath = "release-notes.md"] = process.argv;

if (!version || !tag || !repository) {
  throw new Error(
    "Usage: node scripts/prepare-release-assets.mjs <version> <tag> <owner/repo> [notes-path]",
  );
}

const bundleRoot = path.join("src-tauri", "target", "release", "bundle");
const outputDir = "release-assets";

function listFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function copyAsset(sourcePath) {
  const targetPath = path.join(outputDir, releaseAssetName(sourcePath));
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function releaseAssetName(sourcePath) {
  return path.basename(sourcePath).replace(/\s+/g, ".");
}

function releaseAssetUrl(fileName) {
  return `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(fileName)}`;
}

if (!fs.existsSync(bundleRoot)) {
  throw new Error(`Bundle output directory does not exist: ${bundleRoot}`);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const files = listFiles(bundleRoot);
const versionedFiles = files.filter((file) => path.basename(file).includes(version));
const installerAssets = versionedFiles.filter((file) => [".exe", ".msi"].includes(path.extname(file)));

if (installerAssets.length === 0) {
  throw new Error(`No Windows installer assets for version ${version} were found under ${bundleRoot}.`);
}

for (const asset of installerAssets) {
  copyAsset(asset);
}

const updaterAsset =
  installerAssets.find((file) => path.basename(file).toLowerCase().includes("setup.exe")) ??
  installerAssets.find((file) => path.extname(file).toLowerCase() === ".msi") ??
  installerAssets[0];

if (!updaterAsset) {
  throw new Error(`No updater installer for version ${version} was found under ${bundleRoot}.`);
}

const signatureAssets = installerAssets.map((asset) => `${asset}.sig`).filter((asset) => fs.existsSync(asset));
for (const signature of signatureAssets) {
  copyAsset(signature);
}

const signaturePath = `${updaterAsset}.sig`;
if (!fs.existsSync(signaturePath)) {
  throw new Error(`No updater signature was found for ${updaterAsset}.`);
}

const notes = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, "utf8").trim() : "";
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: fs.readFileSync(signaturePath, "utf8").trim(),
      url: releaseAssetUrl(releaseAssetName(updaterAsset)),
    },
  },
};

fs.writeFileSync(path.join(outputDir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

for (const asset of fs.readdirSync(outputDir).sort()) {
  console.log(`Prepared release asset: ${asset}`);
}
