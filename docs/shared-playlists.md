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
