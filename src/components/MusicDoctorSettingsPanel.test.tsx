import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MusicDoctorSettingsPanel } from "./MusicDoctorSettingsPanel";

describe("MusicDoctorSettingsPanel", () => {
  it("checks and manually syncs the configured read-only database", async () => {
    const user = userEvent.setup();
    const onSaveSettings = vi.fn().mockResolvedValue(true);

    render(
      <MusicDoctorSettingsPanel
        databasePath="%APPDATA%\\com.musicdoctor.desktop\\music-doctor.db"
        autoSync={false}
        isSavingSettings={false}
        onSaveSettings={onSaveSettings}
      />,
    );

    expect(
      await screen.findByText("The external database is always opened read-only."),
    ).toBeVisible();
    expect(await screen.findByRole("button", { name: "Sync now" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Sync now" }));

    expect(await screen.findByText("1,108,057")).toBeVisible();
    expect(screen.getByText("Music Doctor quality data is current.")).toBeVisible();
  });
});
