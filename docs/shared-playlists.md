# Aurora-compatible Smart playlists

Music Library 0.185.0 and Aurora 0.33.0 share the existing `saved_playlists` catalog.
Music Library remains the only catalog writer. Aurora uses protocol-1 bridge
operations `playlistSaveSelection`, `playlistSaveSmart`, and `playlistRefresh`,
advertised by `smartPlaylistAuthoring`. Update both apps before editing new recipes;
older Music Library versions can discard fields they do not understand when saving.

Create or edit Smart rules in Playlists. Song rules match individual songs. Album
rules match albums and collect their songs in disc/track order. The rules use the
native `BrowseRequest`, with optional `smartSettings`: `trackLimit` (1–10,000) and
`refreshPolicy` (`library` or `manual`). Automatic rules refresh when opening the
playlist workspace and after library changes; manual rules refresh explicitly.
Empty results are valid. Existing recipes without settings keep their prior behavior.
Both editors preserve advanced native filters and reject saving a stale revision.
The lists reload on focus so playlists created in the other app become visible.

Aurora can save selected songs or whole albums as regular ordered playlists. The
bridge validates current song ID, directory and filename in one transaction, removes
duplicate selections, and rejects selections exceeding 100 albums or 1,000 songs.
Smart rules cannot overwrite exact track-ID selections or mixtapes.

Aurora pages saved snapshots in batches of 100 using file identity and a revision
guard. Authoring requires the Windows companion bridge; catalog snapshots on other
devices remain readable. Aurora-specific query syntax can be kept in an Aurora saved
view when it does not have equivalent native playlist rules.

## Regular playlist authoring (Aurora 0.34.0 / Music Library 0.186.1)

The protocol-1 `playlistAuthor` operation is advertised separately as
`playlistAuthoring`. Its actions are `create`, `rename`, `delete`, `append`, `move`
and `remove`. Existing-playlist writes require `expectedUpdatedAt`; Music Library
checks it and all selected song identities inside one transaction. Music Library's
own Update saved sends the revision captured when the draft opened, including after
focus refreshes. Reopen after a conflict. Rename and delete work for all playlist
types; manual song edits target regular playlists. Mixtape sides and Smart rules are
preserved. Raw JSON edits retain unknown fields and entries absent from the catalog.

Aurora's Playlists page creates empty regular playlists, renames/deletes playlists,
and moves/removes songs by their saved JSON positions. Unavailable songs retain their
positions; moving past one never drops it. List ordering remains most recently edited
first. Row Add to playlist and selection actions append complete albums in disc/track
order or songs in selected display order. Queues capture the currently loaded queue
(at most 200 songs), not future pages of a playing playlist, and preserve repeats.
Selections/appends accept up to 1,000 songs or 100 albums per request; regular playlists
support up to 10,000 stored entries. No audio files or tags change.

Import M3U8 uses a native file picker and accepts UTF-8 text up to 2 MiB / 1,000 entries.
Comments, BOMs, LF/CRLF, relative paths and local `file:` URLs are supported. Relative
paths resolve beside the M3U8. Only exact local catalog paths are matched (separator,
trailing-slash and ASCII-case normalization); missing/ambiguous paths or stream URLs
reject the entire import. Preview shows the count and first ten filenames; saving
rechecks the file digest and resolves current identities before a bridge transaction.
Import creates a regular snapshot rather than reconstructing Smart rules.

Export M3U8 takes a consistent saved JSON snapshot, retains all entries and repeated
paths (including catalog-unavailable songs), and writes UTF-8 with EXTINF metadata.
The native Save dialog selects a `.m3u8` file; publication uses a synced temporary file
and atomic replacement. The revision is checked again after the dialog. Paths use
the catalog's original filesystem location, so another device may need a path mapping.
Export supports up to 10,000 songs. Browser preview displays the desktop requirement
for writes/import/export; it never substitutes a private Aurora playlist store.
