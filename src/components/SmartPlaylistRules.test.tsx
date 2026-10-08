import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SmartPlaylistRules } from "./SmartPlaylistRules";
import { saveSmartPlaylist } from "../backend";

vi.mock("../backend",()=>({saveSmartPlaylist:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});

it("saves album stars in native points and stores limits and manual policy",async()=>{
  vi.mocked(saveSmartPlaylist).mockRejectedValue(new Error("Reload rules from the other app"));
  render(<SmartPlaylistRules onSaved={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"),{target:{value:"Album rules"}});
  fireEvent.change(screen.getByLabelText("Match",{exact:true}),{target:{value:"albums"}});
  fireEvent.change(screen.getByLabelText("Minimum rating"),{target:{value:"4.25"}});
  fireEvent.change(screen.getByLabelText("Song limit"),{target:{value:"25"}});
  fireEvent.change(screen.getByLabelText("Refresh",{exact:true}),{target:{value:"manual"}});
  fireEvent.click(screen.getByRole("button",{name:"Save Smart playlist"}));
  await waitFor(()=>expect(saveSmartPlaylist).toHaveBeenCalledWith(expect.objectContaining({name:"Album rules",request:expect.objectContaining({view:"albums",filters:expect.objectContaining({albumRatingMin:85})}),settings:{trackLimit:25,refreshPolicy:"manual"}})));
  await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("Reload rules"));
});
