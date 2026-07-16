import { describe, expect, it } from "vitest";
import {
  addUpdateBadgeToRgba,
  createUpdateOverlayRgba,
} from "./updateIndicator";

describe("update icon artwork", () => {
  it("creates a transparent taskbar overlay with amber and white pixels", () => {
    const rgba = createUpdateOverlayRgba(32);
    const pixels = Array.from({ length: rgba.length / 4 }, (_, index) =>
      Array.from(rgba.slice(index * 4, index * 4 + 4)),
    );

    expect(rgba).toHaveLength(32 * 32 * 4);
    expect(pixels.some((pixel) => pixel[3] === 0)).toBe(true);
    expect(
      pixels.some(
        (pixel) => pixel[0] === 245 && pixel[1] === 158 && pixel[2] === 11,
      ),
    ).toBe(true);
    expect(
      pixels.some(
        (pixel) => pixel[0] === 255 && pixel[1] === 255 && pixel[2] === 255,
      ),
    ).toBe(true);
  });

  it("adds a bottom-right badge without mutating the normal tray icon", () => {
    const source = new Uint8Array(16 * 16 * 4).fill(24);
    const badged = addUpdateBadgeToRgba(source, 16, 16);

    expect(badged).not.toBe(source);
    expect(Array.from(source).every((value) => value === 24)).toBe(true);
    expect(badged[0]).toBe(24);
    expect(Array.from(badged).some((value) => value !== 24)).toBe(true);
  });

  it("rejects RGBA data that does not match the icon dimensions", () => {
    expect(() => addUpdateBadgeToRgba(new Uint8Array(3), 2, 2)).toThrow(
      "does not match",
    );
  });
});
