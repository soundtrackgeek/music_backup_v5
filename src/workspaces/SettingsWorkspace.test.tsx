import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SettingsSection, SettingsWorkspace } from "./SettingsWorkspace";

function SettingsFixture() {
  return (
    <SettingsWorkspace reloadAction={<button type="button">Reload</button>}>
      <SettingsSection id="general">
        <p>General content</p>
      </SettingsSection>
      <SettingsSection id="ai">
        <label>
          API key draft
          <input />
        </label>
      </SettingsSection>
      <SettingsSection id="data">
        <p>Data content</p>
      </SettingsSection>
      <SettingsSection id="musicbrainz">
        <p>MusicBrainz content</p>
      </SettingsSection>
      <SettingsSection id="updates">
        <p>Updates content</p>
      </SettingsSection>
      <SettingsSection id="diagnostics">
        <p>Diagnostics content</p>
      </SettingsSection>
    </SettingsWorkspace>
  );
}

describe("SettingsWorkspace", () => {
  it("shows one of six explicit settings sections at a time", async () => {
    const user = userEvent.setup();
    render(<SettingsFixture />);

    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(
      screen.getByRole("tab", { name: /General/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("General content")).toBeVisible();
    expect(screen.getByLabelText("API key draft")).not.toBeVisible();

    await user.click(screen.getByRole("tab", { name: /MusicBrainz/ }));

    expect(
      screen.getByRole("tab", { name: /MusicBrainz/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("MusicBrainz content")).toBeVisible();
    expect(screen.getByText("General content")).not.toBeVisible();
  });

  it("keeps section drafts mounted while navigating", async () => {
    const user = userEvent.setup();
    render(<SettingsFixture />);

    await user.click(screen.getByRole("tab", { name: /^AI/ }));
    const draft = screen.getByLabelText("API key draft");
    await user.type(draft, "still here");

    await user.click(screen.getByRole("tab", { name: /General/ }));
    await user.click(screen.getByRole("tab", { name: /^AI/ }));

    expect(screen.getByLabelText("API key draft")).toHaveValue("still here");
  });

  it("supports arrow, Home, and End keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<SettingsFixture />);

    const generalTab = screen.getByRole("tab", { name: /General/ });
    generalTab.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /^AI/ })).toHaveFocus();
    expect(screen.getByLabelText("API key draft")).toBeVisible();

    await user.keyboard("{End}");
    expect(
      screen.getByRole("tab", { name: /Diagnostics/ }),
    ).toHaveFocus();
    expect(screen.getByText("Diagnostics content")).toBeVisible();

    await user.keyboard("{Home}");
    expect(generalTab).toHaveFocus();
    expect(screen.getByText("General content")).toBeVisible();
  });
});
