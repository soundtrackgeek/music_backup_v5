import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Image } from "@tauri-apps/api/image";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TRAY_ICON_ID = "music-library-main";
const ICON_SIZE = 32;
const APP_TOOLTIP = "Music Library";

type Rgba = readonly [number, number, number, number];

type UpdateIndicatorResources = {
  normalTrayIcon: Image;
  updateTrayIcon: Image;
  updateOverlayIcon: Image;
  tray: TrayIcon;
};

let resourcesPromise: Promise<UpdateIndicatorResources> | null = null;
let updateQueue: Promise<void> = Promise.resolve();

function setPixel(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: Rgba,
) {
  const offset = (y * width + x) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = color[3];
}

function drawUpdateBadge(
  rgba: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  borderColor: Rgba,
) {
  const amber: Rgba = [245, 158, 11, 255];
  const white: Rgba = [255, 255, 255, 255];
  const innerRadius = radius * 0.82;
  const minimumX = Math.max(0, Math.floor(centerX - radius));
  const maximumX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minimumY = Math.max(0, Math.floor(centerY - radius));
  const maximumY = Math.min(height - 1, Math.ceil(centerY + radius));

  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const relativeX = x + 0.5 - centerX;
      const relativeY = y + 0.5 - centerY;
      const distance = Math.hypot(relativeX, relativeY);
      if (distance > radius) {
        continue;
      }

      let color = distance > innerRadius ? borderColor : amber;
      const shaft =
        Math.abs(relativeX) <= radius * 0.13 &&
        relativeY >= -radius * 0.48 &&
        relativeY <= radius * 0.08;
      const headProgress =
        (relativeY - radius * 0.02) / (radius * 0.48);
      const arrowHead =
        headProgress >= 0 &&
        headProgress <= 1 &&
        Math.abs(relativeX) <= radius * 0.5 * (1 - headProgress);

      if (shaft || arrowHead) {
        color = white;
      }
      setPixel(rgba, width, x, y, color);
    }
  }
}

export function createUpdateOverlayRgba(size = ICON_SIZE) {
  const rgba = new Uint8Array(size * size * 4);
  drawUpdateBadge(
    rgba,
    size,
    size,
    size / 2,
    size / 2,
    size * 0.45,
    [146, 64, 14, 255],
  );
  return rgba;
}

export function addUpdateBadgeToRgba(
  source: Uint8Array,
  width: number,
  height: number,
) {
  if (source.length !== width * height * 4) {
    throw new Error("Tray icon RGBA data does not match its dimensions.");
  }

  const rgba = new Uint8Array(source);
  const radius = Math.max(4, Math.min(width, height) * 0.26);
  drawUpdateBadge(
    rgba,
    width,
    height,
    width - radius - Math.max(1, width * 0.02),
    height - radius - Math.max(1, height * 0.02),
    radius,
    [255, 255, 255, 255],
  );
  return rgba;
}

function createFallbackAppIconRgba() {
  const rgba = new Uint8Array(ICON_SIZE * ICON_SIZE * 4);
  for (let y = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1) {
      setPixel(rgba, ICON_SIZE, x, y, [15, 118, 110, 255]);
    }
  }
  return rgba;
}

async function focusMainWindow() {
  const window = getCurrentWindow();
  await window.show();
  await window.unminimize();
  await window.setFocus();
}

async function createIndicatorResources(): Promise<UpdateIndicatorResources> {
  const normalTrayIcon =
    (await defaultWindowIcon()) ??
    (await Image.new(createFallbackAppIconRgba(), ICON_SIZE, ICON_SIZE));
  const [{ width, height }, normalRgba] = await Promise.all([
    normalTrayIcon.size(),
    normalTrayIcon.rgba(),
  ]);
  const [updateTrayIcon, updateOverlayIcon] = await Promise.all([
    Image.new(addUpdateBadgeToRgba(normalRgba, width, height), width, height),
    Image.new(createUpdateOverlayRgba(), ICON_SIZE, ICON_SIZE),
  ]);
  const tray = await TrayIcon.new({
    id: TRAY_ICON_ID,
    icon: normalTrayIcon,
    tooltip: APP_TOOLTIP,
    showMenuOnLeftClick: false,
    action: (event) => {
      if (
        event.type === "Click" &&
        event.button === "Left" &&
        event.buttonState === "Up"
      ) {
        void focusMainWindow().catch(() => undefined);
      }
    },
  });

  return { normalTrayIcon, updateTrayIcon, updateOverlayIcon, tray };
}

async function indicatorResources() {
  if (!resourcesPromise) {
    resourcesPromise = createIndicatorResources().catch((error) => {
      resourcesPromise = null;
      throw error;
    });
  }
  return resourcesPromise;
}

async function applyAppUpdateIndicator(version: string | null) {
  const resources = await indicatorResources();
  const hasUpdate = Boolean(version);
  await Promise.all([
    getCurrentWindow().setOverlayIcon(
      hasUpdate ? resources.updateOverlayIcon : undefined,
    ),
    resources.tray.setIcon(
      hasUpdate ? resources.updateTrayIcon : resources.normalTrayIcon,
    ),
    resources.tray.setTooltip(
      version ? `${APP_TOOLTIP} — update ${version} available` : APP_TOOLTIP,
    ),
  ]);
}

export function setAppUpdateIndicator(version: string | null) {
  const nextUpdate = updateQueue
    .catch(() => undefined)
    .then(() => applyAppUpdateIndicator(version));
  updateQueue = nextUpdate;
  return nextUpdate;
}
