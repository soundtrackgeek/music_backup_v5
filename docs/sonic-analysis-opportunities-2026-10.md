# What a fully analyzed music library can become

## 20 useful and fun additions to Music Library, Aurora, and Tonehavn

**Prepared: 2026-10-21.** Product proposals grounded in the current repositories and the analysis format they actually use. These are opportunities, not claims that the proposed behavior has shipped or been tested on the library.

## The recommendation

The biggest return on the analysis is helping you enjoy more of the collection you already own: finding overlooked favorites, choosing what deserves a proper listen, making a hand-picked playlist flow, and taking a satisfying slice of the collection anywhere.

I would start with **Hidden favorites**, **Playlist flow workshop**, and **Blind tasting**. Together they answer three different questions: “What am I missing?”, “How do I make this mix better?”, and “What can I play with?” Follow those with **Sonic smart playlists** and **Pack my collection** for lasting everyday usefulness.

There is a substantial first phase available without decoding the collection again. **Ideas 01–16 can build on the existing audio features**, although some need new derived data, algorithms, or integration. **Ideas 17–20 need richer measurements for their full promise.** Preserve the completed analysis and add those measurements selectively if the early features prove worthwhile.

Near-complete coverage matters because recommendations can draw from most of the collection instead of the part that happened to finish scanning first. It does not automatically make every recommendation good. The quality of the selection, its diversity, and how easily you can steer it will determine whether this investment becomes useful.

## What is already available

The current foundation includes more than an audio scan. These capabilities should be reused rather than presented as new features:

| Product | Existing foundation relevant to this report |
| --- | --- |
| Music Library | Track and album similarity; sound evidence in Discovery and Similar unrated albums; Sonic journeys; analysis scheduling, coverage, recovery, backup and reuse; regular and Smart playlists. |
| Aurora | More like this for tracks and albums; persistent track/album sonic radio; Sonic journeys; Tonight’s Album; Ratings Studio; playback and listening-history views. |
| Tonehavn | Artist Radio based on cached Last.fm relationships; familiarity/adventure controls and repeat limits; Trip Tape with duration and storage constraints; downloads; independent playlists and linked Music Library playlists; playback-history integration. |

Music Library and Aurora already share an **exact weighted k-d tree index** for sonic retrieval. Tonehavn currently has **no sonic feature import or vector API in its inspected source contract**. Its current radio is therefore a strong integration target, but completed analysis in Music Library does not yet make Tonehavn audio-aware. Sources: [Music Library sonic contract][ml-sonic], [index operation][ml-index], [Aurora product behavior][au-readme], [Tonehavn discovery][th-discovery], [Tonehavn catalog capabilities][th-catalog].

### What the analysis knows—and what it does not

The active profile is `bliss-0.13.0-symphonia-0.6.1-v2-full-mp3`. Each analyzed track has a **23-value summary of the whole recording**, plus profile-specific weights and identity/freshness information. The dimensions cover tempo, zero-crossing rate, spectral statistics, loudness statistics, and chroma-derived values. The last group is not a ready-made musical-key label. See the [analyzer implementation][ml-analyzer], [shared profile][ml-core], and [Bliss 0.13.0 feature definitions](https://docs.rs/bliss-audio/0.13.0/bliss_audio/enum.AnalysisIndex.html).

| Reasonable use of the current data | Something it does not establish |
| --- | --- |
| Rank whole tracks by the current acoustic distance | A percentage chance you will love a song |
| Compare albums, track groups and listening cohorts | Musical quality or the rating a track deserves |
| Derive representative tracks and broad sound neighborhoods | Verified genre, instruments, vocal presence or lyrical subject |
| Use tempo-related information cautiously after profile-specific validation | Reliable beat positions, downbeats, cadence confidence or a beat grid |
| Compare aggregate loudness/texture statistics | LUFS normalization targets or where a sudden loud passage occurs |
| Identify contrast between tracks or albums | Verse/chorus structure, the best excerpt, or compatible intros/outros |
| Reuse identical MP3 payloads after retagging | Acoustic duplicate detection across encodings or cover-song identification |

“Sounds close” should stay distinct from “means the same thing,” “was influenced by,” and “is the same recording.” A score and a rock song can be neighbors without sharing a genre or emotional meaning. That cross-boundary possibility is part of the appeal.

The repository’s existing album comparison uses an equal-weight mean of usable tracks. This is practical, but it can blur a stylistically varied album. Several proposals below deliberately retain representative tracks and variation instead of compressing everything to one average.

## The 20 opportunities at a glance

**Data:** Existing = current full-track vectors; Derived = additional summaries computed from those vectors; Extra = new audio measurements. Tonehavn can already play/download a fixed Music Library playlist produced using sonic analysis. New sonic data publication is needed when Tonehavn itself selects, steers or replenishes recommendations, or displays new sonic evidence. **Effort:** S, M and L are relative implementation judgments, not delivery estimates; they exclude that shared Tonehavn foundation where required.

| ID | Addition | Best first home | Data | Effort | Main payoff |
| --- | --- | --- | --- | --- | --- |
| 01 | Hidden favorites | Aurora + Music Library | Existing | M | Rediscover music beyond the usual recommendations |
| 02 | What should I rate next? | Music Library + Aurora | Existing / Derived | M | Make listening through the backlog rewarding |
| 03 | An album’s many sides | Aurora | Derived | M | Find the part of a varied album you actually connect with |
| 04 | Sonic smart playlists | Music Library | Existing | M–L | Save a sound-based collection that can grow |
| 05 | Playlist flow workshop | Aurora + Music Library | Existing | M | Improve a mix while keeping your selections |
| 06 | Radio you can steer by ear | Aurora, then Tonehavn | Existing | M | Control the direction of a listening session |
| 07 | A journey that fits your time | Tonehavn + Music Library | Existing | M | Deliberate sessions with a beginning and an ending |
| 08 | Common ground | Aurora + Tonehavn | Existing | M | A shared mix that represents different tastes |
| 09 | Same sound, different world | Aurora | Existing | S–M | Discover surprising connections across the collection |
| 10 | Blind tasting | Aurora + Tonehavn | Existing | S–M | A listening game that produces real discoveries |
| 11 | A playable sonic atlas | Aurora + Music Library | Derived | L | Explore the collection by sound |
| 12 | Hear an artist change | Aurora + Music Library | Derived | M | Explore a career through audible contrasts |
| 13 | Your year in sound | Music Library | Derived | M | Understand listening changes beyond genre totals |
| 14 | Sonic outlier detective | Music Library | Existing / Derived | M | Direct attention to things worth checking |
| 15 | Pack my collection | Tonehavn | Derived | M–L | Carry breadth within a storage budget |
| 16 | Pocket sonic radio | Tonehavn | Existing / Derived | L | Useful discovery with no connection |
| 17 | Sound comfort sessions | Tonehavn + Aurora | Extra | L | More predictable listening for work or winding down |
| 18 | Music that matches your pace | Tonehavn | Extra for dependable matching | M–L | Walking/running playlists with a suitable pulse |
| 19 | More like this moment | Aurora | Extra | L | Find music resembling a particular passage |
| 20 | Transitions that hear the ending | Aurora, then Tonehavn | Extra | L | Better handoffs between tracks in mixes |

## The ideas in detail

### 01. Hidden favorites - DONE

**Implementation update, 2026-10-22:** The first track-based version ships in
Music Library 0.195.0 and Aurora 0.40.0. It incorporates the second report's
thin-history correction with a held-out ratings ranking prior. See the
[shipped behavior and boundaries](hidden-favorites.md). Album suggestions,
Tonehavn's native daily sampler, and long-term listening evaluation remain future work.

**The experience.** Open a small shelf titled “You already own this.” It offers perhaps five tracks or three albums connected to several favorites, but neglected in the available listening history. Each suggestion names a recognizable anchor: “Near these two favorites; no recorded play in the last twelve months.” Choose **Play**, **Keep for later**, or **Not today**.

**Why it earns a place.** A huge collection can repeatedly lead you back to the same familiar corner. The reward here is the feeling of finding a record in your own shelves that you had forgotten buying. Sonic analysis helps cross artist and genre labels while the history layer makes the suggestion timely.

**What is new.** Music Library already has sound-based Discovery and Similar unrated albums; Aurora already has Tonight’s Album. Add a neglected-music intent and multi-anchor coverage to those surfaces. Do not create a duplicate generic recommendations page. Unlike idea 02, this includes highly rated music that deserves another listen.

**Across the apps.** Music Library builds the evidence and saved shortlist; Aurora makes it an immediate listening choice; Tonehavn offers a short daily sampler and optional download.

**First version and limits.** Combine neighborhoods around several favorite examples, exclude recent plays, rotate artists, and keep one broader discovery slot. Say “not in available history,” never “you have never heard this.” A dismissal should not change a rating.

**Proof of value.** Compare with the current Discovery shelf over repeated sessions: more voluntarily kept or replayed discoveries, without becoming dominated by one favorite artist.

### 02. What should I rate next? - DONE

**Implementation update, 2026-10-22:** Music Library 0.196.0 and Aurora 0.41.0
ship time-bounded album and mixed rating missions, three audition intents,
shared persistence, actual-rating progress, and reviewed playlist saving. Reuse
the held-out ranking prior introduced for 01. See [rating missions](rating-missions.md)
for the shipped behavior, validation and limits. Tonehavn-native missions and
recording-twin rating carry-over remain future work.

**The experience.** Choose “I have 40 minutes” or “Help me finish these albums.” Receive a manageable listening mission: one partially rated album close to music you love, or a short set of unrated tracks from several different sound neighborhoods. Keep album order where that matters. Finish with the existing rating workflow.

**Why it earns a place.** It turns collection completion into a series of attractive choices. A backlog sorted only by artist, date or number of missing ratings says little about what you might enjoy investigating today.

**What is new.** Extend Music Library’s completion views and Aurora’s Ratings Studio with sound-aware prioritization. Unlike the existing Similar unrated albums shelf, include partly rated albums, available listening time, and balanced exploration across the collection. The system recommends what to audition, not what rating to assign.

**Across the apps.** Music Library owns the mission and completion evidence; Aurora handles listening and rating; Tonehavn can carry the exact reviewed mission for later listening, using only supported rating/sync paths.

**First version and limits.** Offer three choices: a likely fit, an album close to completion, and a deliberate stretch. Keep exploration even when the current ratings favor a narrow style. Avoid promises that the “likely fit” will be a four-star album.

**Proof of value.** Track whether missions are completed and whether they spread attention across more artists and sound regions. Rating count alone is insufficient if it encourages rushed decisions.

### 03. An album’s many sides - DONE

**Implementation update, 2026-10-22:** Music Library 0.197.0 supplies the shared
structure and query; Aurora 0.42.0 adds **Explore its sound** to album inspectors.
Includes representatives, group playback, contrast and matching-cue album
discovery. See [shipped behavior and boundaries](album-many-sides.md).
Tonehavn’s card and listening-quality evaluation remain future work.

**The experience.** An album page offers “Explore its sound.” A compact panel presents two or three representative tracks, the most contrasting track, and optional groups such as “tracks close to this one.” Select the strand you like and ask for other albums containing that kind of material.

**Why it earns a place.** Long scores, compilations and eclectic albums are poorly represented by one mean. You may love the restrained passages of a score while its action cues dominate your memory of the album—or the opposite. This gives the listener a better entry point without requiring knowledge of its track list.

**What is new.** Existing album similarity compares album means. This proposal exposes variation and supports strand-to-album discovery. It is not section detection inside a track; each representative remains a complete track.

**Across the apps.** Aurora hosts the listening panel. Music Library computes reusable representatives and can compare album profiles. Tonehavn presents a simpler “Three ways into this album” card.

**First version and limits.** Start with completely analyzed albums. Pick actual representative tracks, not synthetic averages, and show how many tracks support each group. For a short or uniform album, show one representative rather than inventing multiple personalities. Partial coverage must remain visible.

**Proof of value.** Compare the usefulness of recommendations from the selected strand against the existing album-mean results, especially on varied soundtracks and compilations.

### 04. Sonic smart playlists

**The experience.** Save a recipe such as: “Tracks near these four examples, outside this other sound, unrated, from the 1980s, with no more than two tracks per artist.” Newly imported and analyzed music can enter the playlist at its next defined refresh.

**Why it earns a place.** This gives your preferred sounds durable names without requiring a perfect genre label. You can make a personal “Late train home” collection from examples you know, then let the collection grow with the library.

**What is new.** Existing Smart playlists use native catalog rules. Sonic journeys save a fixed reviewed sequence. This adds a versioned sonic recipe and refresh semantics; it should not silently turn either existing playlist type into something else.

**Across the apps.** Music Library owns the recipe and its saved result. Aurora creates and edits it through an advertised bridge capability. Tonehavn reads the published membership as a linked playlist; rule editing there would require an explicit authoring contract.

**First version and limits.** Start with positive examples plus existing metadata filters. Add negative examples once their effect is understandable. Store profile, seed identities, limits, ordering and refresh policy. Keep the active playback queue stable when the saved playlist refreshes. Report missing seeds and insufficient matches instead of quietly weakening the rules.

**Proof of value.** New eligible music appears after refresh; banned or stale tracks disappear from new results; the exact currently playing queue remains unchanged. See the existing [Smart playlist ownership contract][ml-playlists].

### 05. Playlist flow workshop

**The experience.** Open a hand-built playlist and choose **Improve flow**. Pin the opener and closer, lock an album block or a deliberate three-song run, and compare the current order with a proposed one. Highlight the largest changes and let you audition each handoff. Save the accepted sequence as a new version or explicitly update the playlist.

**Why it earns a place.** Choosing the tracks is often the enjoyable part of a mixtape; getting the order right can take much longer. This makes sonic analysis a practical editing assistant.

**What is new.** Sonic journeys insert connectors between selected stops. This workshop primarily reorders the tracks you already selected. Membership stays fixed, including intentional repeated entries, and locked blocks retain their internal order.

**Across the apps.** Aurora is the natural auditioning surface. Music Library saves the reviewed result and can apply the same tool to a mixtape within its existing side boundaries. Tonehavn plays the published sequence, or applies the tool to its own independent playlists under its own ownership rules.

**First version and limits.** Use bounded optimization on a manageable selection. Preserve all locks and provide undo. Whole-track distance can suggest a coherent order; it cannot establish that one outro mixes seamlessly into another intro. That is idea 20.

**Proof of value.** Blindly compare original and proposed orders for several personally made mixes. All entries and constraints must survive exactly, even when the proposed ordering is rejected.

### 06. Radio you can steer by ear

**The experience.** Start a station from a track, then add a second example: “More in this direction.” Use **Closer**, **Explore further**, and **Avoid this direction today**. The interface shows the few examples currently steering the session, so you can remove a mistaken steer.

**Why it earns a place.** You often know the right sound when you hear it, even when you cannot describe it. A station should let you express that without editing a large set of technical filters.

**What is new.** Aurora’s sonic radio currently stays anchored to one track or album. Tonehavn already has familiarity controls, but its candidate relationships are metadata-based. Add multiple audible examples, explicit negative examples, and a controlled discovery distance.

**Across the apps.** Aurora proves the interaction first. Tonehavn reuses its existing station replenishment and queue revision machinery. Music Library can save a successful set of examples as an idea-04 recipe.

**First version and limits.** Retrieve around each positive seed, combine the pools, then rank for coverage, relevance and repeats. Do not average incompatible seeds into an empty middle. Keep the original anchor unless the listener deliberately changes it. Ordinary skipping is ambiguous; make steering explicit. Start by changing selection policy, not the index’s metric weights.

**Proof of value.** The next few additions respond audibly to steering without undoing queued choices, overplaying one artist, or drifting away indefinitely. Small eligible pools should produce an honest explanation.

### 07. A journey that fits your time

**The experience.** “I have 55 minutes. Begin near this song, get more adventurous in the middle, and land near this other one.” Preview a complete session with a real duration, known ending and optional album block. If it cannot fit exactly, offer the nearest under-budget option and its actual length.

**Why it earns a place.** A commute, cooking session or evening walk has a shape and an endpoint. A deliberately paced set can be more satisfying than stopping an endless station arbitrarily.

**What is new.** Existing Sonic journeys specify a number of connectors; Tonehavn Trip Tape already handles duration/storage and Music Library has mixtape tools. Extend them with sound-based arc constraints and reviewed sequencing rather than creating another playlist builder.

**Across the apps.** Music Library provides the reusable planner. Aurora supports preview and desktop playback. Tonehavn makes the approved version downloadable through Trip Tape, preserving the existing storage budget and favorite share.

**First version and limits.** Use actual durations and explicit anchor tracks for the beginning, middle and ending. “Calmer” should mean nearer to an example you chose, unless a separately validated semantic measure exists. Treat album blocks as indivisible and use complete tracks; do not truncate a song to hit a target.

**Proof of value.** The session respects duration and storage constraints, retains required stops, and sounds deliberately shaped in listening comparisons. Saving must preserve the preview rather than regenerate a different mix. Existing [Trip Tape implementation][th-trip].

### 08. Common ground

**The experience.** Two people choose two or three tracks each. Build a dinner or shared-drive mix that gives both sets a recognizable presence. A simple balance control shows whether the draft represents each side equally or favors one slightly.

**Why it earns a place.** “You choose something” becomes a cooperative activity. It can also work for one person combining two different musical interests.

**What is new.** This is a representation problem, not a path between the first and last song. Existing Sonic journeys already handle the latter. The new aim is a satisfying whole set in which neither person’s choices disappear.

**Across the apps.** Aurora offers a two-column seed picker and shared auditioning. Tonehavn takes the reviewed set on a drive or downloads it. Music Library can save it as a regular shared-library playlist when that is the selected destination.

**First version and limits.** No accounts or social network are needed: two labeled seed groups suffice. Union their neighborhoods and balance selections against both groups, while limiting repeats. Include some direct favorites if requested. When there is little overlap, explain that the mix alternates between two styles rather than inventing “common ground.”

**Proof of value.** Both participants recognize their contribution and choose to keep part of the result. Mathematical closeness to a blended center is not the success metric.

### 09. Same sound, different world

**The experience.** Choose a favorite and a challenge: **Different decade**, **Outside this genre**, **Another country in my catalog**, or **An artist I have barely played**. Hear three candidates before revealing the connection.

**Why it earns a place.** This is a controlled surprise. It lets you discover that records filed in unrelated parts of the collection share something audible.

**What is new.** The novelty is the explicit boundary crossing. Ordinary nearest-neighbor lists often keep you in the same artist, era or genre; this feature asks the retrieval system to find plausible neighbors on the other side of a chosen metadata boundary.

**Across the apps.** Aurora provides the reveal and comparison. Music Library supplies precise year, artist and country filters and saves the discoveries. Tonehavn offers a compact three-track challenge.

**First version and limits.** Start with decade and excluded artist; add other boundaries as their metadata is reliable. Apply the constraint before declaring success. If there is no convincing candidate in the analyzed collection, say so. A country filter uses stored artist metadata; it is not an acoustic classification. Similarity does not establish historical influence or a shared tradition.

**Proof of value.** Results satisfy the chosen boundary and are interesting enough to hear again. Evaluate the sonic result separately from whether the reveal happened to be surprising.

### 10. Blind tasting

**The experience.** Listen to a familiar seed, then two concealed candidates from your own collection. Choose the one you would keep playing. Reveal artist, album and artwork afterward, with **Save**, **Hear the album**, and **Another round**.

**Why it earns a place.** This is immediately playable and can puncture expectations about names, genres and covers. The prize is finding music you want to hear, not earning points against an algorithm.

**What is new.** A short, deliberate listening activity instead of another recommendation shelf. It tests your reaction before the metadata frames it.

**Across the apps.** Aurora is the easiest first home. Tonehavn can run downloaded rounds on a train or sofa. Music Library supplies candidate evidence and receives explicit saved selections through supported paths.

**First version and limits.** Use existing full-track playback and user-controlled seeking. Avoid claiming to have found the best 20 seconds; that needs richer analysis. Hide visual identity until reveal, while respecting accessibility requirements and explaining any platform media controls that still expose it. There is no objectively correct preference, and the choice must not silently become a star rating or Ban.

**Proof of value.** Rounds lead to voluntary reveals, saves and full-album listening. This is an excellent inexpensive experiment because its enjoyable part does not depend on sophisticated new modeling.

### 11. A playable sonic atlas

**The experience.** Browse a map of sound neighborhoods. Each region has a few recognizable representatives and meaningful counts: owned, rated, loved, and absent from available play history. Select a region to hear an entry point, open its albums, or create a listening shortlist.

**Why it earns a place.** It gives a very large collection a sense of place. “Show me the territory between these favorites” becomes an exploration rather than a text search.

**What is new.** Music Library already has genre-based visual exploration. This map derives its neighborhoods from audio and remains useful when genre tags are broad, inconsistent or simply not how you remember music.

**Across the apps.** Music Library computes versioned clusters and progress summaries. Aurora owns rich navigation. Tonehavn offers selected neighborhoods as compact shelves or offline packs, without needing a million-dot map on a phone.

**First version and limits.** Start with a local neighborhood around a chosen track and a modest set of representatives. Expand to a hierarchy only after that is useful. Keep layout stable between ordinary refreshes; tie saved regions to explicit versions. A two-dimensional projection distorts distance, so retrieve actual neighbors using the original metric. Region names should be examples or editable labels, not invented musical facts.

**Proof of value.** You can reach worthwhile unfamiliar music faster than through ordinary browsing. A beautiful map without useful listening actions has failed.

### 12. Hear an artist change

**The experience.** Open an artist’s discography and see albums arranged in time with audible comparison points. Select a large change and hear representative tracks from before and after it. Choose “More from this phase” to find the part of the catalog that fits your preference.

**Why it earns a place.** It makes a discography easier to understand and revisit. The interface can reveal a shift you had noticed vaguely, or show that an overlooked release belongs near an era you enjoy.

**What is new.** A chronological comparison within a properly identified artist, using album variation and representative tracks. This is different from generic album similarity or a timeline of rating scores.

**Across the apps.** Aurora offers listening comparisons. Music Library supplies reviewed artist identity, release dates, edition distinctions and analysis coverage. Tonehavn can present a short “Hear three phases” session.

**First version and limits.** Begin with studio albums and a visible minimum coverage threshold. Separate live albums, compilations and reissues; retain unknown dates rather than imposing a false chronology. Show multiple representatives for varied albums. An acoustic shift may reflect production, recording conditions or edition differences; it is not proof of intention or an artistic breakthrough.

**Proof of value.** The comparison helps you choose an album to revisit and remains sensible when inspected against the actual tracks and edition metadata.

### 13. Your year in sound

**The experience.** Add a sonic layer to In Review: which sound neighborhoods you visited, which favorites connected new discoveries, and which parts of the collection entered or left your listening rotation. Every visual opens the actual tracks behind it.

**Why it earns a place.** Genre totals can remain almost unchanged while your listening changes substantially. A sound-based diary can describe those differences without requiring every album to have perfect labels.

**What is new.** Music Library already has calendar reviews and a genre-based taste-drift view. Extend those with observed listening and acoustic distributions. Keep “what I played,” “what I rated highly,” and “what I added” as separate comparisons.

**Across the apps.** Music Library produces the report. Aurora opens its evidence and plays comparison sets. Tonehavn contributes supported play-history evidence and displays a compact retrospective.

**First version and limits.** Compare two periods using a fixed neighborhood model and report represented plays alongside missing-history and missing-analysis counts. Offer both play-weighted and unique-track views: replaying one album 50 times should mean something different from exploring 50 albums. Do not infer mood, wellbeing, or personality from acoustic features. A new clustering version must not masquerade as a change in taste.

**Proof of value.** Every claim is reproducible from a named period, catalog/model snapshot and visible track cohort. Listening to the comparison should make the difference recognizable. Existing [In Review release description][ml-changelog].

### 14. Sonic outlier detective

**The experience.** In a review workspace, see items whose sound is unusual for an expected grouping: one track far outside an otherwise consistent album, an apparent duplicate edition with very different representatives, or an album unlike neighboring releases by the same artist. Audition and inspect the evidence before deciding whether anything needs correction.

**Why it earns a place.** Analysis can focus attention on a few things worth checking in an enormous catalog. It may help uncover a wrong file, an incorrectly assigned track, or an edition discrepancy that text metadata alone did not reveal.

**What is new.** A triage signal for existing review tools, not another similarity playlist. Combine sound with duration, filename/track position, album identity and existing metadata evidence where available.

**Across the apps.** Music Library owns the review and any explicit correction. Aurora can audition compared files. Tonehavn need not expose this administrative feature; it benefits from corrected published data.

**First version and limits.** Start with within-album outliers and label them “Worth listening to,” not “Wrong file.” Interludes, bonus tracks, dialogue, live material and stylistic experimentation are legitimate. Audio distance alone cannot prove corruption, a duplicate, a cover version, or an incorrect artist. Never automatically move, replace, retag or delete anything.

**Proof of value.** Measure confirmed useful findings against dismissed suggestions. If almost all flags are intentional variation, narrow the trigger or stop surfacing it. This has lower priority than listening features because its false-positive cost is higher.

### 15. Pack my collection

**The experience.** “Give me 8 GB for a week away: my essentials, some unheard possibilities, and several different corners of my collection.” Review a proposed offline library by neighborhood or album, swap choices, and see the actual bytes required before downloading.

**Why it earns a place.** A long trip needs options, not just one perfect playlist. Sound-aware packing can avoid using most of the available space on several nearly interchangeable selections.

**What is new.** Trip Tape already creates a time/storage-constrained playlist. This creates a reusable **offline collection with breadth**, including enough alternatives to choose from later. Its output need not have one canonical listening order.

**Across the apps.** Tonehavn owns the package, downloads and device availability. Music Library supplies sound representatives, favorites and optional locked albums. Aurora can help review a larger package on the desktop if a corresponding package handoff is added.

**First version and limits.** Select representative albums from several user-approved sound regions, preserving pinned essentials and whole-album choices. Count actual unique file bytes and existing shared downloads; a track appearing in two collections should not consume the budget twice. Define whether the entered budget means total offline occupancy or additional download space. Show exclusions and offer manual swaps.

**Proof of value.** The package fits its declared budget, contains real choice across the user’s preferred styles, and plays fully offline. Diversity should remain preference-aware: maximizing distance alone can pack a lot of music you do not want.

### 16. Pocket sonic radio

**The experience.** While offline, start from a downloaded track and keep listening to suitable music already on the phone. Choose **Stay close** or **Explore**, see the available pool, and let the station continue without a server connection.

**Why it earns a place.** Downloads stop being a collection of fixed lists. The phone can assemble a useful listening session from the music it actually has.

**What is new.** This is local recommendation and replenishment, not merely offline playback of a server-generated playlist. It complements idea 15: better packing provides a stronger pool; pocket radio makes that pool more useful.

**Across the apps.** Music Library remains the source of audio analysis. Tonehavn publishes a compact feature subset or neighborhood data with the downloads and performs bounded local selection. Aurora needs no separate feature beyond sharing the same policy definitions where appropriate.

**First version and limits.** Start with a single seed and a few thousand complete downloads. Include the profile/metric needed to interpret vectors; keep every recommendation inside the existing readable, complete-file gate. A neighbor list computed for the whole server library may be almost empty after filtering to the phone, so build for the downloaded subset or retain enough vectors for local search. Reconnection must not replace the active queue unexpectedly.

**Proof of value.** Test in airplane mode, after interrupted downloads, after deletions, and across app restart. Never select a missing file or silently substitute another song. Small pools should end or offer an explicit repeat option. Existing [offline selection gate][th-downloads].

### 17. Sound comfort sessions

**The experience.** Choose a listening context such as “steady background for work” or “wind down without sudden jumps.” Use your own examples, with optional controls for vocal presence and large changes in loudness. Preview the choices and keep an easy way to reject a poor fit.

**Why it earns a place.** An otherwise enjoyable playlist can become distracting because of one abrupt passage, a vocal entrance, or extreme dynamic contrast. This feature addresses a specific listening preference rather than assigning an emotional label to everything.

**What is new.** Tonehavn already has normalization modes and gain metadata. This proposal improves **selection and predictability**, and should reuse that playback machinery. Turning volume normalization on is not a new sonic feature.

**Across the apps.** Music Library stores optional additional measurements. Aurora provides detailed preparation and feedback. Tonehavn makes the selected session available through a simple preset and downloads.

**First version and limits.** Current whole-track statistics can support an explicitly experimental ranking around user examples. A dependable “avoid sudden changes” option needs short-term measurements; a vocal filter needs reviewed tags or a suitable classifier. Instrumental does not necessarily mean unobtrusive. Preserve album dynamics when the user chooses normal album playback. Make no promises about sleep, concentration or health outcomes.

**Proof of value.** Repeated listening finds fewer unwanted interruptions without flattening all choice into one narrow sound. Additional data candidates include [time-resolved loudness descriptors](https://essentia.upf.edu/reference/streaming_LoudnessEBUR128.html) and [music classification models](https://essentia.upf.edu/models.html); these are research options, not selected dependencies.

### 18. Music that matches your pace

**The experience.** Enter a preferred pulse or choose a warm-up / steady / finish structure. Tonehavn builds an offline-ready session from music you enjoy, with an easy **Feels too fast** or **Feels too slow** adjustment.

**Why it earns a place.** A walking or running set can have a suitable rhythmic feel while still coming from your own collection. Sonic neighbors help retain a familiar character as the pulse changes.

**What is new.** This is a rhythm-constrained session, not a generic energetic playlist. Duration, preferences and cadence suitability all affect the result.

**Across the apps.** Music Library supplies validated rhythm metadata and the current sonic vectors. Aurora helps audition and correct selections. Tonehavn handles the actual session and offline playback.

**First version and limits.** The current tempo dimension can inform an experimental tempo browser after its normalization and missing-beat sentinel are handled. Do not expose it as a reliable cadence guarantee. Dependable matching needs uncertainty handling, half/double-time alternatives, and preferably beat positions. Reject uncertain material or label it clearly; allow manual corrections. No automatic time-stretching is required for the first version.

**Proof of value.** Audition a varied set of electronic, rock, orchestral and changing-tempo recordings. The listener’s perceived pulse is the test, not merely agreement between two BPM numbers. [RhythmExtractor2013](https://essentia.upf.edu/reference/streaming_RhythmExtractor2013.html) illustrates the distinction between a tempo estimate, beat locations and confidence; it does not guarantee those outputs are correct for every recording.

### 19. More like this moment

**The experience.** During a long score cue or evolving track, mark a passage and choose **Find this kind of moment**. Preview matching passages in other owned tracks, with an option to play the full recording or open the album.

**Why it earns a place.** Sometimes the part you love is a quiet passage inside a loud track, or a brief rhythmic section inside something otherwise spacious. A whole-track average can bury precisely the feature you want to find.

**What is new.** Passage-to-passage retrieval. Idea 03 explores different complete tracks within an album; this works inside a recording.

**Across the apps.** Aurora provides the time-range selection and comparison player. Music Library owns a separate versioned segment-analysis job and cache. Tonehavn can later consume selected results and bookmarked ranges without analyzing audio on the phone.

**First version and limits.** Begin with a deliberately small collection or favorite albums. Store time-bounded windows and their source identities; search segment features against other segment features. Do not assume a window vector is directly comparable to the current full-track profile. Merge overlapping matches and avoid returning dozens of passages from one recording. Fixed windows are not verified verse, chorus or scene boundaries.

**Proof of value.** For passages the user selects, segment retrieval should beat whole-track retrieval in listening comparisons. Only expand extraction after this works. Keep playback timestamps accurate after file replacement and preserve existing full-track analysis separately.

### 20. Transitions that hear the ending

**The experience.** In a mix, audition the last part of one track and the beginning of the next. The app suggests a suitable next track, or an optional handoff duration, based on what those actual passages do. Accept the transition explicitly and retain a normal-playback option.

**Why it earns a place.** Two similar whole tracks can still make an awkward transition. A huge ending into a delicate opening, applause, silence, or an abrupt start can matter more than the overall acoustic distance.

**What is new.** Idea 05 improves playlist order using whole tracks. This adds endpoint analysis and, optionally, playback behavior. It is a separate later investment, not a claim that the existing sonic engine already mixes audio seamlessly.

**Across the apps.** Music Library produces optional endpoint summaries. Aurora implements and verifies the first playback experience. Tonehavn needs separate server/iOS playback integration and device testing; publishing a transition plan alone is not enough.

**First version and limits.** Begin with endpoint-aware suggestions and preview, preserving ordinary playback. Require richer timing, loudness and silence evidence before automatic overlap. Beat alignment and harmonic compatibility would need their own validated measurements; the current chroma-derived values are not musical keys. Preserve continuous albums, movements and live sequences by default. A [key extractor](https://essentia.upf.edu/reference/streaming_KeyExtractor.html) is a distinct analysis capability, not something implied by the existing vector.

**Proof of value.** Listening comparisons favor the proposed handoffs, and playback tests verify no truncation, missing audio or unexpected overlap. Validate each playback platform separately before calling this complete.

## What I would build first

### The first three experiments

1. **Hidden favorites (01):** strongest daily usefulness. Extend an existing surface and use several favorite anchors plus honest history evidence.
2. **Playlist flow workshop (05):** most concrete creative tool. Its result is directly reviewable, and preserving the selected tracks provides a clear correctness contract.
3. **Blind tasting (10):** strongest inexpensive fun experiment. It turns analysis into a short activity immediately, without requiring a new analysis model or large visualization project.

Run these on the real analyzed collection before committing to a broader recommendation architecture. Include scores, rock/pop, electronic music, mixed albums, live recordings and long tracks in the listening comparisons. The goal is to discover where the current metric is helpful and where it is merely mathematically consistent.

### The next durable capabilities

**Sonic smart playlists (04)** makes a successful sound-based idea reusable. **Radio steering (06)** makes the experience responsive. Build those on the same candidate-selection rules so a saved recipe and its live station do not disagree about bans, identities or eligibility.

In parallel, design Tonehavn’s sonic publication contract. Then **Pack my collection (15)** is the first mobile feature I would prioritize: it solves a different problem from desktop similarity and gives the completed analysis practical value away from home. **Pocket radio (16)** follows once the downloaded pool and its analysis can be trusted.

### The larger experiences

Build **An album’s many sides (03)** before the full atlas: it proves representative selection on a small, understandable set. Its derived summaries can help **Artist evolution (12)** and **Sonic atlas (11)**. Add **Your year in sound (13)** after neighborhood definitions are stable enough that a model refresh does not rewrite the story.

Defer **17–20** until a selective prototype shows that richer analysis changes the experience enough to justify another pass over audio. They should not delay delivering value from the nearly completed scan.

## Shared implementation principles

### Keep the three products’ responsibilities clear

| Responsibility | Owner |
| --- | --- |
| Source catalog, file identity, raw sonic analysis and its backups | Music Library |
| Music Library playlists and sonic recipes | Music Library, with capability-gated authoring from Aurora |
| Desktop auditioning, browsing, session controls and playback | Aurora |
| Server playback state, mobile queues, downloads and device availability | Tonehavn |
| Tonehavn’s independent saved playlists | Tonehavn; linked Music Library playlists remain distinct |

Tonehavn’s independent playlists are an important exception to any shorthand that says “Music Library owns all playlists.” A Trip Tape saved by Tonehavn is not automatically a writable Music Library playlist. Respect the existing source-versus-player boundary in the [Tonehavn specification][th-spec].

### Publish analysis to Tonehavn deliberately

There are two useful routes. The quickest is to generate and save a sonic playlist in Music Library, then use Tonehavn's existing linked-playlist publication and downloads. This delivers mobile listening value without transporting vectors. Tonehavn needs a new sonic data contract when it performs its own selection, steering or replenishment, prepares a sound-aware offline pack, or displays sonic explanations. This is a concrete dependency, not a reason to move analysis into every app. A proposed first contract should contain:

- A format version, source identity, compatible catalog revision, analysis profile and metric version.
- Stable track identity mappings and analyzed audio identity/freshness evidence; no dependence on coincidentally equal numeric IDs across stores.
- Only the vectors or derived relationships required by the consumer, with coverage and clear unavailable/incompatible states.
- Atomic adoption after validation, retaining the last working compatible publication when refresh fails.
- Reconciliation for changed or removed tracks, bans and current eligibility when building a new queue.
- For the phone, the subset attached to actual completed downloads, including the information needed to interpret its vectors or neighbor lists.

Tonehavn should remain usable while Music Library is closed. Do not make every recommendation open a desktop process or read a live SQLite/WAL file across an unreliable connection. The transport can be chosen during implementation; the consistency and identity contract should come first.

### Share selection policy, not a second set of truths

Use one understandable selection pipeline:

1. Resolve seeds and required profile; explain unavailable analysis.
2. Retrieve a bounded candidate pool from relevant neighborhoods.
3. Apply current bans, metadata constraints, file freshness and playback availability.
4. Rank for the requested purpose: familiarity, novelty, representation, ordering, duration or offline breadth.
5. Apply explicit diversity and repeat constraints; widen retrieval when necessary or report insufficiency.
6. Preview or enqueue under the existing playlist/queue revision rules.

Do not make the distance stand in for every decision. A neighbor can be acoustically close but overplayed, unavailable, banned, the wrong edition, or inappropriate for the selected task.

Repeat control should also consider known recording relationships and identical audio hashes where available. Artist and album caps alone can still serve the same recording from a compilation, reissue and deluxe edition. Keep intentional repeated playlist entries, and treat different performances as distinct unless the user requests otherwise. Sonic proximity is not recording identity; missing relationships should remain unknown.

Keep explanations factual: “near these examples,” “not recorded in the selected history period,” or “included to represent this other region.” Do not show invented similarity percentages, guessed instruments, or confident mood labels. Language models are optional for interface wording; the first sixteen ideas do not inherently require sending audio to an external service.

### Preserve performance at collection scale

The existing index is valuable, but its exactness applies to its configured metric. Arbitrary rhythm/texture weighting controls cannot silently reuse the same tree as if the metric had not changed. Begin with broad retrieval and explicitly approximate reranking, or build an appropriate index for a supported alternative metric. Highly restrictive filters require enough retrieval depth or the existing fallback to avoid false “no matches.”

For atlas, diversity and reporting work, use bounded neighborhood retrieval, sampled or hierarchical clustering, and cached representatives. Do not compute a dense all-pairs distance matrix for the whole collection. Derived artifacts should be versioned, disposable and rebuilt incrementally where feasible; original completed analysis should survive.

The repository’s scale proof includes a real analyzed subset and a synthetic 1.1-million-vector fixture. It establishes useful engineering evidence, **not a fresh measurement of the now-nearly-complete live library**, a phone benchmark, or a promise for all proposed algorithms. Benchmark the real post-scan dataset before choosing latency targets. See [measurement scope and results][ml-index].

### Add richer analysis without throwing away this scan

For ideas 17–20, keep a separate capability/profile for additional measurements. Start on selected albums, favorites, or an offline pack, record extractor/model versions and confidence where supported, and preserve resumable work and portable backups. Missing extra features should degrade a specific option rather than hide a track from ordinary similarity.

Potential extra data includes short-term loudness, beat positions, tempo confidence, reviewed or classified vocal presence, time-window descriptors, and endpoint summaries. Existing gain/normalization metadata may already cover part of a need and should be checked before extracting it again. Essentia’s documentation is useful evidence of available techniques; its library, models and dependencies have separate [licensing conditions](https://essentia.upf.edu/licensing_information.html), so this report does not prescribe bundling them.

## How to decide whether the ideas work

Use a small, repeatable personal evaluation before building elaborate scoring systems. Prepare representative listening situations, compare the new selection with the current behavior, and retain the actual examples that succeed or fail.

| Dimension | Question to answer |
| --- | --- |
| Relevance | Do you actually want to keep listening? |
| Discovery | Does it uncover worthwhile music beyond recent favorites? |
| Diversity | Does a session cover different artists/albums without losing its purpose? |
| Control | Does changing a seed or preference have an understandable effect? |
| Trust | Are reasons accurate, constraints honored and missing data visible? |
| Durability | Do saved results, active queues and offline packages survive refresh and restart correctly? |
| Speed | Is the complete interaction responsive on the real library and target device? |

For technical validation, assert identities, exclusions, sequence preservation, duration/storage constraints, revision handling and complete offline files. For musical quality, listen. A lower average acoustic distance is useful diagnostic evidence but cannot prove a better mixtape.

Avoid optimizing only for more listening time or more ratings. Better outcomes include choosing an album more easily, keeping a new discovery, preparing a trip with less work, and enjoying a short game. A feature can be successful by helping you finish a satisfying session and stop.

## Evidence and scope

This report was prepared from repository inspection, delegated code review of each product’s relevant surfaces, and primary technical documentation. No live analysis database was scanned, no playback was auditioned, and no iPhone behavior was verified for this report. The statement that analysis is nearly complete comes from the user. Proposed benefits, effort sizes and priorities are product judgments to validate, not measured outcomes.

Repository snapshots inspected:

| Repository | Revision |
| --- | --- |
| Music Library | `b64690cbf0ad86340513c4f6b24e9642ee6da911` |
| Aurora | `bf38672` |
| Tonehavn / plexamp-replacement | `998f389` |

### Local implementation sources

- [Music Library sonic behavior, identity, album coverage and journeys][ml-sonic].
- [Music Library persistent index, fallback behavior and benchmark scope][ml-index].
- [Music Library analyzer output and selected feature version][ml-analyzer]; [shared profile and algorithms][ml-core].
- [Music Library and Aurora playlist ownership and authoring contract][ml-playlists].
- [Music Library current review/completion features][ml-changelog].
- [Aurora product features, including Tonight’s Album][au-readme]; [Ratings Studio contract][au-ratings]; [listening-history contract][au-history].
- [Tonehavn station behavior and the future sonic integration point][th-discovery]; [catalog source capabilities][th-catalog].
- [Tonehavn Trip Tape proposal/save behavior][th-trip]; [iOS complete-download selection][th-downloads].
- [Tonehavn source and player ownership specification][th-spec]; [current product and normalization behavior][th-readme].

Some sonic documentation retains historical prose about earlier retrieval implementations. The dedicated index documentation and current code take precedence: an exact index is already implemented. None of the proposed additions should require replacing it merely because an older paragraph describes streamed retrieval.

### External technical references

- [Bliss 0.13.0 AnalysisIndex](https://docs.rs/bliss-audio/0.13.0/bliss_audio/enum.AnalysisIndex.html): named dimensions for the pinned analyzer version.
- [Essentia RhythmExtractor2013](https://essentia.upf.edu/reference/streaming_RhythmExtractor2013.html): separate tempo, beat-location and confidence outputs.
- [Essentia KeyExtractor](https://essentia.upf.edu/reference/streaming_KeyExtractor.html): explicit key, scale and strength outputs.
- [Essentia LoudnessEBUR128](https://essentia.upf.edu/reference/streaming_LoudnessEBUR128.html): time-resolved and integrated loudness measurements.
- [Essentia models](https://essentia.upf.edu/models.html): examples of separately trained music classification capabilities.
- [Essentia licensing information](https://essentia.upf.edu/licensing_information.html): library, model and dependency considerations for any future implementation choice.

[ml-sonic]: https://github.com/soundtrackgeek/music_backup_v5/blob/b64690cbf0ad86340513c4f6b24e9642ee6da911/docs/sonic-analysis.md
[ml-index]: https://github.com/soundtrackgeek/music_backup_v5/blob/b64690cbf0ad86340513c4f6b24e9642ee6da911/docs/sonic-index-performance.md
[ml-analyzer]: https://github.com/soundtrackgeek/music_backup_v5/blob/b64690cbf0ad86340513c4f6b24e9642ee6da911/Tools/sonic-analyzer/src/main.rs#L37
[ml-core]: https://github.com/soundtrackgeek/music_backup_v5/blob/b64690cbf0ad86340513c4f6b24e9642ee6da911/crates/sonic-core/src/lib.rs#L5
[ml-playlists]: https://github.com/soundtrackgeek/music_backup_v5/blob/b64690cbf0ad86340513c4f6b24e9642ee6da911/docs/shared-playlists.md
[ml-changelog]: https://github.com/soundtrackgeek/music_backup_v5/blob/b64690cbf0ad86340513c4f6b24e9642ee6da911/CHANGELOG.md
[au-readme]: https://github.com/soundtrackgeek/aurora/blob/bf38672/README.md#L230
[au-ratings]: https://github.com/soundtrackgeek/aurora/blob/bf38672/docs/ratings-studio-contract.md
[au-history]: https://github.com/soundtrackgeek/aurora/blob/bf38672/docs/listening-history-contract.md
[th-discovery]: https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/crates/tonehavn-server/src/discovery.rs#L262
[th-catalog]: https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/crates/tonehavn-server/src/catalog.rs#L558
[th-trip]: https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/crates/tonehavn-server/src/trip_tape.rs#L234
[th-downloads]: https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/apps/ios/Tonehavn/Features/Downloads/DownloadStore.swift#L382
[th-spec]: https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/SPEC.md#L319
[th-readme]: https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/README.md
