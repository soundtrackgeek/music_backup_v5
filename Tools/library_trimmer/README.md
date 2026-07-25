# Music Library Trimmer

This standalone, standard-library Python tool identifies local albums that are
absent from a trusted artist's pure official MusicBrainz album list, checks
those candidates against Discogs, and moves only explicitly approved audio
files into a recoverable quarantine.

It never edits the app database, MusicBee database, audio tags, or source
manifests. It moves exact audio files recorded in the app database; it does not
move album directories, cover images, or other sidecars.

## Requirements

- Windows with Python 3.10 or newer through the `py` launcher.
- An imported Music Library app database.
- The MusicBrainz cache configured in the app.
- Internet access for uncached Discogs lookups.

The default app database is:

```text
%APPDATA%\com.local.musiclibrary\music-library.sqlite3
```

## Progress output

Every command continuously explains its current stage on stderr, including
database and cache validation, album loading, root and genre filtering,
MusicBrainz comparison, Discogs classification, manifest checkpoints, CSV
review work, move preflight, hashing and verification, journal writes, and
undo.

Counted work displays the completed and total items, percentage, processing
rate, and ETA. Discogs progress also shows whether each result came from the
local HTTP cache or the network and reports the overall manifest count during
resumed batches. Interactive terminals update a live status line where
practical; redirected output receives periodic durable log lines.

Progress always uses stderr. With `--json`, stdout therefore contains only the
documented JSON result and remains safe to pipe to another command or file.
The progress implementation uses only Python's standard library and does not
require `tqdm` or another package.

## Discogs authentication

Public read-only lookups work at the lower anonymous rate limit. For an
authenticated application rate limit, set either:

```powershell
$env:DISCOGS_TOKEN = "your personal access token"
```

or both application credentials:

```powershell
$env:DISCOGS_CONSUMER_KEY = "your consumer key"
$env:DISCOGS_CONSUMER_SECRET = "your consumer secret"
```

The personal token takes precedence when both methods are configured. Secrets
are sent in the Discogs authorization header. They are never written to the
manifest, review CSV, HTTP cache, journal, output, or repository.

## Safe workflow

Run all commands from the repository root.

1. Validate configuration:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py --json doctor
   ```

2. Count candidates without calling Discogs. This example limits the job to
   albums stored entirely beneath `D:\MUSIC` and excludes the app's complete
   `scores` genre group plus the canonical `Soundtrack` and `Synthwave`
   genres:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py --json candidates `
     --library-root "D:\MUSIC" `
     --exclude-genre scores `
     --exclude-genre soundtrack `
     --exclude-genre synthwave
   ```

3. Scan the first resumable batch. The default batch is 500 albums:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py scan `
     --library-root "D:\MUSIC" `
     --exclude-genre scores `
     --exclude-genre soundtrack `
     --exclude-genre synthwave `
     --out trim-manifest.json
   ```

4. Resume until the manifest reports `complete`:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py scan `
     --library-root "D:\MUSIC" `
     --exclude-genre scores `
     --exclude-genre soundtrack `
     --exclude-genre synthwave `
     --out trim-manifest.json `
     --resume
   ```

   Use `--limit 0` to process every pending candidate in one long run. Every
   Discogs response is cached under
   `%LOCALAPPDATA%\MusicLibraryTrimmer\discogs`, and the manifest is
   checkpointed every ten albums. An interrupted scan can therefore resume
   without repeating completed network work.

   An album is inside `--library-root` only when every recorded track directory
   is beneath that root. Albums split between inside and outside paths are
   excluded from the scan and counted as mixed-location albums. The chosen
   quarantine directory must be outside this root.

   `--exclude-genre` uses the app database's canonical album genre and can be
   repeated. `score` or `scores` expands exactly like the app to Action,
   Animation, Anime, Comedy, Documentary, Drama, Fantasy, Horror, Sci-Fi,
   Thriller, TV, Video Game, and Western. `Soundtrack` is not part of that
   umbrella and therefore remains an explicit exclusion.

5. Export the editable review sheet:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py export-review `
     --manifest trim-manifest.json `
     --out trim-review.csv
   ```

   Set `reviewDecision` to `move`, `keep`, or `review`. Set `approved` to
   `yes` only for rows that should be moved. `automatedClassification` and the
   evidence columns are informational and should not be edited.

6. Import the reviewed decisions:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py import-review `
     --manifest trim-manifest.json `
     --review trim-review.csv
   ```

   Import creates a timestamped backup of the manifest before changing it.

7. Preview the exact move:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py apply `
     --manifest trim-manifest.json `
     --quarantine "D:\Music Quarantine"
   ```

8. Execute the reviewed move:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py apply `
     --manifest trim-manifest.json `
     --quarantine "D:\Music Quarantine" `
     --execute `
     --confirm MOVE_APPROVED
   ```

   The tool preflights every source, size, modification time, and destination
   before moving anything. Same-volume moves use atomic renames. Cross-volume
   moves copy to a temporary file, verify SHA-256, publish the destination, and
   only then remove the source. A journal is checkpointed after every file.

9. If needed, preview and execute a full restore:

   ```powershell
   py Tools\library_trimmer\library_trimmer.py undo `
     --journal .\trim-manifest-apply-YYYYMMDD-HHMMSS.json

   py Tools\library_trimmer\library_trimmer.py undo `
     --journal .\trim-manifest-apply-YYYYMMDD-HHMMSS.json `
     --execute `
     --confirm RESTORE_FILES
   ```

10. After accepting the quarantine, rescan in MusicBee, export a fresh TSV,
    and use the app's normal import preview/apply workflow.

## Classification policy

- MusicBrainz is the candidate generator. Albums already found on the trusted
  artist's pure official MusicBrainz album list do not call Discogs.
- Library-root and canonical-genre exclusions run before MusicBrainz matching
  and before any Discogs request.
- Absence from MusicBrainz never causes a move by itself.
- Discogs `Album` evidence without an excluded descriptor produces `keep`.
- Strongly matched `EP`, `Single`, `Compilation`, `Live`, `Mixtape`,
  `Unofficial Release`, and related evidence produces `move_candidate`.
- Missing, weak, contradictory, or untyped matches produce `review`.
- A human review can override the automated result, but `apply` still requires
  both an effective `move` decision and `approved=yes`.

Discogs `Accepted` submission status is not treated as proof that a release is
official. Classification uses release format descriptions.

## JSON contract

Place `--json` before the command for machine-readable output:

```powershell
py Tools\library_trimmer\library_trimmer.py --json candidates
```

Success responses contain:

```json
{"ok":true,"command":"candidates"}
```

Expected failures use exit code 2 and contain:

```json
{"ok":false,"error":{"type":"TrimmerError","message":"..."}}
```

Progress is written to stderr so stdout remains valid JSON.

## Read-only Discogs escape hatch

The raw command is intentionally GET-only and always targets
`https://api.discogs.com`:

```powershell
py Tools\library_trimmer\library_trimmer.py --json request get /masters/27976
```

It uses the same credentials, throttling, response cache, and secret-redaction
rules as `scan`.
