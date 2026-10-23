import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SmartPlaylistRules } from "./SmartPlaylistRules";
import { saveSmartPlaylist } from "../backend";
import { searchJourneyTracks } from "../backend/sonicJourney";

vi.mock("../backend",()=>({saveSmartPlaylist:vi.fn()}));
vi.mock("../backend/sonicJourney",()=>({searchJourneyTracks:vi.fn()}));
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

it("saves sound examples with native filters, stable ordering and manual refresh",async()=>{
  vi.mocked(searchJourneyTracks).mockResolvedValue([{trackKey:"path:seed",title:"The Journey",artist:"Artist",album:"Album"} as Awaited<ReturnType<typeof searchJourneyTracks>>[number]]);
  vi.mocked(saveSmartPlaylist).mockRejectedValue(new Error("Desktop evaluation required"));
  render(<SmartPlaylistRules onSaved={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Name"),{target:{value:"Late train home"}});
  fireEvent.click(screen.getByLabelText("Sounds like these examples"));
  expect(screen.getByRole("button",{name:"Save Smart playlist"})).toBeDisabled();
  expect(screen.getByLabelText("Match",{exact:true})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Find sound examples"),{target:{value:"Journey"}});
  fireEvent.keyDown(screen.getByLabelText("Find sound examples"),{key:"Enter"});
  expect(saveSmartPlaylist).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button",{name:"Add The Journey"}));
  fireEvent.change(screen.getByLabelText("Original year from"),{target:{value:"1980"}});
  fireEvent.change(screen.getByLabelText("Original year to"),{target:{value:"1989"}});
  fireEvent.click(screen.getByLabelText("Unrated only"));
  fireEvent.change(screen.getByLabelText("Refresh",{exact:true}),{target:{value:"manual"}});
  fireEvent.click(screen.getByRole("button",{name:"Save Smart playlist"}));
  await waitFor(()=>expect(saveSmartPlaylist).toHaveBeenCalledWith(expect.objectContaining({
    settings:expect.objectContaining({refreshPolicy:"manual",sonic:expect.objectContaining({version:1,ordering:"nearest",maxDistance:0.2,maxPerArtist:2,seeds:[expect.objectContaining({trackKey:"path:seed"})]})}),
    request:expect.objectContaining({filters:expect.objectContaining({yearFrom:1980,yearTo:1989,missingFields:["rating"]})})
  })));
  expect(await screen.findByRole("alert")).toHaveTextContent("Desktop evaluation required");
  expect(screen.getByLabelText("Name")).toHaveValue("Late train home");
  expect(screen.getByRole("list",{name:"Sound examples"})).toHaveTextContent("The Journey");
  expect(screen.getByRole("button",{name:"Save Smart playlist"})).toBeEnabled();
});

it("explains why Save is disabled while the playlist name is missing",()=>{
  render(<SmartPlaylistRules onSaved={vi.fn()} onCancel={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Enter a playlist name above");
  expect(screen.getByRole("button",{name:"Save Smart playlist"})).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Name"),{target:{value:"Named mix"}});
  expect(screen.queryByText("Enter a playlist name above to enable Save Smart playlist.")).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Save Smart playlist"})).toBeEnabled();
});

it("ignores an old example search after the query changes",async()=>{
  let finish!: (value: Awaited<ReturnType<typeof searchJourneyTracks>>) => void;
  vi.mocked(searchJourneyTracks).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  render(<SmartPlaylistRules onSaved={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Sounds like these examples"));
  fireEvent.change(screen.getByLabelText("Find sound examples"),{target:{value:"first"}});
  fireEvent.click(screen.getByRole("button",{name:"Search examples"}));
  fireEvent.change(screen.getByLabelText("Find sound examples"),{target:{value:"latest"}});
  finish([{trackKey:"old",title:"Old result"} as Awaited<ReturnType<typeof searchJourneyTracks>>[number]]);
  await waitFor(()=>expect(screen.queryByRole("button",{name:"Add Old result"})).not.toBeInTheDocument());
  expect(screen.getByLabelText("Find sound examples")).toHaveValue("latest");
});
