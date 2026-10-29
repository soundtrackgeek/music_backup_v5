# What the first sonic report missed

## Measured gaps, and 20 more additions for Music Library, Aurora, and Tonehavn

**Prepared: 2026-10-21.** This is a companion to [What a fully analyzed music library can become](sonic-analysis-opportunities-2026-10.md), referred to below as *the first report*. It does two things the first report did not: it **measures the live analysis** on this library (read-only, see [Method](#method-and-evidence)), and it focuses on what the first report **leaves out**. The 20 new additions are numbered **21–40** so they can sit beside the first report's 01–20 without ambiguity.

A follow-up note, [What Songstress could add](songstress-stereo-and-timeline-2026-10.md), proposes additions 41–45: stereo measurement and a per-second timeline.

Everything here is a proposal. Nothing in this document has been built, and no listening tests were run. The measurements describe this library on this date. They are not general claims about Bliss or about music.

## The short version

The first report is careful and mostly right about *what not to promise*. Its blind spot is that it reasons about the analysis without looking at it. Looking at it changes the plan in four ways:

1. **Your ratings matter more than your play history.** Music Library holds 155,283 rated tracks and 5,817 loved ones, but only 7,341 plays, all from Aurora, covering 22 August to 21 October 2026. A model trained only on the 23 sound values separates your 5★ tracks from your ≤3★ tracks with **AUC 0.775**, tested on album artists it had never seen. The first report uses ratings only as filters and anchors; it never learns from them.
2. **Similarity already crosses every boundary.** Of a track's ten nearest neighbors, 0.9% come from its album, 2.0% from its album artist and 10.7% from its genre (3.9% by chance). The first report treats crossing boundaries as a special feature. In practice it is the default, and the missing control is *staying* in a style.
3. **The library is half film, TV and game score, and the first report barely designs for that.** 530,368 analyzed tracks fall in Music Library's own `scores` genre group, and 126,289 of the rated tracks are scores. Scores are 38% more varied inside an album than song albums, and median 2.9–7.6 dB quieter than songs from the same decade.
4. **Some everyday wins need no new modeling at all.** Aurora's audit found ReplayGain on 7 of 250 sampled MP3s, but the analysis stores a level for 1,086,273 tracks. There are 3,122 groups of byte-identical audio, 17 of them with conflicting ratings. And roughly 1% of tracks have a re-encoded twin that the sound vector detects.

If I could build only five things from both reports, I would start with:

- **27 Level every track**: fixes volume jumps of 5–6 dB between eras and between scores and songs.
- **24 A taste model trained on your ratings**: makes the first report's 01 and 02, and Tonight's Album, work without a long play history.
- **21 Why these sound alike**: exact explanations, which make every other feature trustworthy.
- **30 Smooth and Spread shuffle**: improves the most common way music is actually played.
- **37 Sonic hot & cold**: the most fun per line of code.

## What the data says

Every number below comes from a read-only snapshot of the current analysis profile joined to the catalog. Sample sizes are in [Method](#method-and-evidence).

| Measurement | Result | What it changes |
| --- | --- | --- |
| Coverage | 1,086,273 of 1,111,444 catalog tracks have current-profile analysis (97.7%) | Library-wide features are realistic now |
| Preference evidence | 154,273 rated analyzed tracks (126,289 scores, 24,170 songs, 3,814 soundtracks); 5,738 loved; 7,341 plays over two months; 12 saved playlists | Ratings are the strong signal; history and playlists are weak for now |
| Ratings shape (whole catalog) | 62,007 five-star, 64,486 four-star, 26,048 three-star, 2,414 two-star, 325 one-star | 81% of ratings are 4–5★; models must compare 5★ with ≤3★, not "rated vs unrated" |
| Neighbors and metadata | Top-10 neighbors: 0.9% same album, 2.0% same album artist, 10.7% same genre (3.9% by chance) | Coherence needs a control (31); crossing is free |
| Crowding | Median distance to the 1st / 10th / 100th / 1,000th / 10,000th nearest track: 0.085 / 0.108 / 0.134 / 0.167 / 0.221; random pair 0.598 | The top of every list is a crowd of near-ties; selection policy decides more than rank |
| Hubs | 30,000 top-10 slots from 3,000 random queries held 29,440 distinct tracks; none appeared more than three times | No hub correction needed |
| Taste signal | Sound-only model, 5★ vs ≤3★, grouped by album artist: AUC 0.753 (logistic) and 0.775 (boosted trees); top tenth of held-out tracks 94.5% five-star vs 67.8% overall | A ratings-trained model is worth building (24) |
| Neighbor ratings | A track's rating correlates with the ratings of its 50 nearest *other-artist* neighbors (Spearman 0.26) | Taste is partly audible across artists |
| Rating tendencies in scores | Rating rises with major triads (ρ 0.20) and fourths/fifths (0.18); falls with semitone clashes (−0.21), diminished triads (−0.18) and augmented triads (−0.13) | A legible "five-star sound" story (25) |
| Family from sound | Score vs everything else: 82% correct from neighbors (chance 50%). Library root folder: 82% (majority guess 54%). Synthwave root: 0 of 40 | Scores-vs-General destination hints work; Synthwave hints do not (29) |
| Film genre from sound | Majority genre of neighbors: 14.7% correct vs 11.1% by always guessing the largest genre; Thriller 3%, Sci-Fi 2% | Do not auto-tag genres |
| Level | Track level, 1st–99th percentile: −29.3 to −6.5 dBFS. Songs: −15.7 (1980s) → −9.4 (2010s). Scores 2.9 to 7.6 dB below songs every decade | Leveling is needed and possible (27) |
| Byte-identical audio | 3,122 groups covering 6,841 tracks; 2,997 groups span albums; 328 partly rated; 17 with conflicting ratings | Rating carry-over and repeat control (28) |
| Re-encoded twins | 29 of 3,000 sampled tracks (≈1%) have a different-bytes neighbor within 0.02; about four in five share a normalized title and duration. From 0.02 to 0.05 only 26% do; beyond 0.05, 1% | A sharp, usable threshold (28) |
| Album shape | Score albums: first and last tracks 1.0 and 0.8 dB above the album median, and only 19% of closers in the album's quietest quarter. Song albums: closers 0.3 dB below the median, 40% in the quietest quarter | Arcs are visible from whole-track values (35) |
| Album variety | Median spread of tracks around their album mean: 0.306 for scores, 0.222 for songs (67,541 albums with 8+ tracks) | Scores need per-album structure (34) |
| Loud old masters | 7,941 of 193,946 pre-1990 song tracks are at or above the median 2005+ level; 644 of 19,124 pre-1990 song albums are mostly that loud | A remaster story for the almanac (39) |
| Near-silent files | 85 tracks with a mean level below −50 dBFS | A cheap health check (29) |

**About the distances.** They use the profile's own weights, where 0.6 is a typical distance between two random tracks. They are not percentages and should never be shown as such.

## What the first report leaves out

### 1. It never measured the analysis, and three of its premises do not hold here

The first report says so itself: "No live analysis database was scanned." Three of its ideas rest on assumptions that this library contradicts.

| First report | What it assumes | What the data says | What to do instead |
| --- | --- | --- | --- |
| 09 Same sound, different world | "Ordinary nearest-neighbor lists often keep you in the same artist, era or genre" | 98% of top-10 neighbors are other album artists; 89% are other genres | Crossing is the default; add a coherence control in both directions (31) |
| 01 Hidden favorites | Suggestions "neglected in the available listening history" | History covers two months; "no recorded play" is true of more than 99% of tracks | Use rating evidence and a taste model (24) |
| 13 Your year in sound | A year of observed listening | Two months exist | Build a collection-based almanac first (39); add the listening layer when history is long enough |

### 2. Ratings are used as filters, never as evidence to learn from

The first report's 02 recommends what to audition "not what rating to assign," which is right. But it never uses the 154,273 ratings as training data, and it describes "a percentage chance you will love a song" only as something to avoid. A held-out test shows a sound-only model is strongly predictive of your 5★ vs ≤3★ split (AUC 0.775). That is the best preference signal any of the three apps has. It belongs underneath Hidden favorites, What should I rate next?, Tonight's Album, Daily Edition Deep Cuts and Ratings Studio queues. Explaining your own ratings (25) and teaching the app your own words (26) come from the same idea.

### 3. The metric is treated as a black box

The profile's weight matrix is diagonal: tempo 0.25, nine timbre and level values at 1.0, thirteen harmony values at 3/13 each ([Bliss source](https://docs.rs/bliss-audio/0.13.0/src/bliss_audio/lib.rs.html)). That has three consequences the first report misses:

- **Exact explanations.** Squared distance is a plain sum of per-dimension terms, so "how much of this match is harmony, brightness, level" is exact rather than estimated (21).
- **Steering without reweighting.** The first report correctly warns that arbitrary weighting cannot reuse the exact index. Moving the *query point* ("like this, but darker") keeps the metric and the index unchanged (22).
- **Cheap alternative profiles.** Any diagonal weighting is a rescaling of coordinates. A second exact k-d tree for a named profile is one more build: the [scale benchmark](sonic-index-performance.md) built a 1.1-million-vector index in about 100 seconds. Approximate reranking is not needed (23).

### 4. There is no automated evaluation, and the top of every list is a crowd

The first report's evaluation is listening, which is necessary but slow. It misses two structural facts. First, the nearest 1,000 tracks are only twice as far away as the single nearest. Second, there is no hub problem: no track dominates other tracks' neighbor lists. Together, these mean small changes to weights or filters can reshuffle the top results without anyone noticing whether things got better. The library already has free labels: 154k ratings, 72k albums, 20k album artists, genres and loves. An offline harness (23) catches regressions before anyone listens.

### 5. Loudness is treated as a comfort problem, not an everyday one

The first report's 17 says normalization "is not a new sonic feature" and that existing gain metadata "may already cover part of a need." In Aurora it covers about 3%: the [audio output audit](https://github.com/soundtrackgeek/aurora/blob/bf38672/docs/audio-output-contract.md#replaygain) found ReplayGain in 7 of 250 MP3s, and Aurora never calculates it. Tonehavn has [on-demand EBU R128 analysis](https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/README.md). Meanwhile the analysis has a level for every track, and the spread is large. A shuffle that moves from a 1980s song to a 2010s song typically jumps about 6 dB, and a song-to-score jump is similar (27).

### 6. Music Library's role as a catalog and backup app is underused

The first report's 14 (outlier detective) is the only library-care idea. The analysis also knows about byte-identical audio across albums, re-encoded twins, near-silent files, and how new albums fit before they are filed. Music Library already has the review surfaces for these: Music Tools, Failed tracks, Music Doctor quality, Updates, Inbox (27–29).

### 7. New music is where attention is highest, and analysis is not part of intake

Aurora Inbox and the Wish List's Deemix, Soulseek and Usenet downloads are where new albums arrive. Today analysis picks up new imports only when you start another batch. The moment an album arrives is when "where does this fit?", "is this a copy of something I own?" and "Scores or General?" are most useful (29).

### 8. The everyday playback modes are missing

Most listening is shuffle, a station, or whatever is already on the phone. The first report improves deliberate, edited sessions (05, 07) and stations steered by examples (06). It does not touch shuffle (30), the coherence of a station (31), the skip evidence Tonehavn already classifies (32), or keeping downloads fresh without effort (33).

### 9. The apps' existing AI assistants stay deaf

Music Library's Luna, the Jev features (two-sided mixtapes, Trip Tape) and Aurora's Tonight's Album already reason over titles, genres, years and ratings. The first report mentions language models only for "interface wording." Giving those assistants bounded sonic tools is a small, high-leverage step (40).

### 10. There is one game, and no collection-level fun

Blind tasting (10) is a good idea, but it is the only game. The analysis, the chart links (Billboard, Official UK, VG-lista, Norsktoppen), publishers and album years also support daily puzzles, path games and an almanac of your own collection (37–39).

### 11. Existing data sources go unmentioned

The first report treats time-resolved data as future work. A few sources already exist:

- **Aurora's waveform cache:** a 640-peak whole-song envelope for every track Aurora has displayed. This is a partial, free source of time-resolved level for the first report's 19 and 20.
- **Tonehavn's stored R128 measurements:** calibration data for 27.
- **Tonehavn's classified early explicit skips:** with a 90-day half-life, already used in station scoring. Input for 32.
- **Music Doctor bitrate data:** picks the better copy of a twin (28).

## The 20 additions at a glance

**Data:** Existing = current vectors plus catalog metadata; Derived = new summaries computed from those; Extra = new audio measurements. **Effort** is a relative judgment, as in the first report.

| ID | Addition | Best first home | Data | Effort | Gap it fills |
| --- | --- | --- | --- | --- | --- |
| 21 | Why these sound alike | All three | Existing | S | Black-box metric |
| 22 | Like this, but… | Aurora, then Tonehavn | Existing | M | Steering without examples or reweighting |
| 23 | Metric lab | Music Library | Existing | M | No automated evaluation |
| 24 | A taste model trained on your ratings | Music Library + Aurora | Existing | M | Ratings never learned from |
| 25 | Your five-star sound | Music Library + Aurora | Existing | S–M | Self-knowledge from ratings |
| 26 | Teach it a word | Music Library + Aurora | Existing | M | Personal concepts, with an honesty check |
| 27 | Level every track | Aurora, then Tonehavn | Existing + calibration | M | 97% of MP3s without ReplayGain |
| 28 | Recording twins | Music Library | Existing | M | Duplicates, repeats, rating carry-over |
| 29 | Sound check on arrival | Aurora Inbox + Music Library | Existing, new trigger | M | Analysis absent from intake |
| 30 | Smooth and Spread shuffle | Aurora + Tonehavn | Existing | S–M | Shuffle untouched |
| 31 | Crowd + ear, with a coherence dial | Aurora + Tonehavn | Existing + Last.fm cache | M | Crossing is the default |
| 32 | Skips that steer, visibly | Tonehavn | Existing + skip evidence | M | Classified skips unused |
| 33 | Smart downloads | Tonehavn | Existing, published | M–L | Offline pool goes stale |
| 34 | Score suite | Aurora + Tonehavn | Derived | M | Long scores, short evenings |
| 35 | Album shape | Aurora + Music Library | Existing | S | No at-a-glance arc |
| 36 | Theme tracker | Aurora + Music Library | Extra | L | Leitmotifs across a franchise |
| 37 | Sonic hot & cold | Aurora + Tonehavn | Existing | S–M | Only one game |
| 38 | Sonic golf and Odd one out | Aurora + Tonehavn | Existing | S–M | Learning the space by playing |
| 39 | The sound of your collection | Music Library | Existing | S–M | Collection-level stats, charts, labels |
| 40 | Give Luna and Jev ears | Music Library + Tonehavn | Existing | M | Assistants blind to sound |

## The ideas in detail

### A. Make the sound legible and steerable

#### 21. Why these sound alike

**The experience.** Under any sonic result, in Discovery, More like this, radio queues or Tonehavn's existing **Why this track?**, one line: *"Closest in harmony and brightness; differs mainly in level (about 6 dB quieter)."* Every track and album also gets a small sound card with five bars: **Pace, Brightness, Texture, Level, Harmony.** Each bar is placed against your own library: "darker than 82% of your collection."

**Why it earns a place.** A match can be right for the wrong reason, for example close in level and tempo but nothing else. Seeing which part of the sound carried a match lets you trust it, discard it, or steer with 22. It also makes the rest of the analysis visible without inventing labels.

**What the data allows.** The profile's distance is a weighted sum of squared per-dimension differences, so each group's share is exact and non-negative:

| Group | Dimensions | Weight in the profile |
| --- | --- | --- |
| Pace | tempo | 0.25 |
| Brightness | spectral centroid mean/std, rolloff mean/std | 1.0 each |
| Texture | zero-crossing rate, spectral flatness mean/std | 1.0 each |
| Level | loudness mean/std | 1.0 each |
| Harmony | 13 interval-class and triad proportions | 3/13 each |

**Gap it fills.** The first report asks for factual explanations such as "near these examples." A per-group breakdown is equally factual and far more informative.

**Across the apps.** Add one function to the MIT `sonic-core` crate that returns the group shares for any pair, plus percentile tables computed once per index build. All three apps use the same text templates.

**First version and limits.** Show at most two "closest in" groups and one "differs in." Words stay acoustic: "bright" never becomes "happy." Level is recording level, not perceived energy. Harmony describes interval and triad proportions, not key (see the [interval-class paper Bliss cites](https://speech.di.uoa.gr/ICMC-SMC-2014/images/VOL_2/1461.pdf)). Pace carries a visible "estimate" label.

**Proof of value.** Group shares sum to 100% and match a direct calculation. In a small blind test, you can tell which of two matches an explanation describes.

#### 22. Like this, but…

**The experience.** Beside **More like this** and in a running station: **Brighter · Darker · Quieter · Louder · More tense · More consonant**, plus **Faster/Slower** labeled experimental. Each press moves the station's target. Active nudges show as removable chips. Aurora can add a two-axis pad (Brightness × Tension) for exploring around a seed.

**Why it earns a place.** You often know *how* you want the next track to differ ("same, but less brassy") without having a second example to hand. The first report's 06 steers with examples; this steers with direction.

**How it works.** Shift the query vector along a group by a percentile step measured in the seed's neighborhood, then retrieve exactly as today. Only the query point changes, so the exact index and its guarantees remain intact. "More tense" moves weight toward semitone and diminished/augmented proportions; "More consonant" moves toward fifths and major triads.

**Gap it fills.** The first report notes that reweighting breaks the index assumption. Moving the query point does not.

**Across the apps.** Aurora proves it on sonic radio. Tonehavn adopts it once it has a sonic publication. Music Library's **Sounds like** can save a nudged seed as part of a sonic recipe (the first report's 04).

**First version and limits.** Steps are percentile-based, because dimensions differ several-fold in spread. Brightness dimensions move together, since centroid and rolloff are correlated. If a nudge lands in an empty region, pull the target toward the nearest real tracks and say "few tracks sound like that." Leave Pace off by default; the tempo estimate is weak (see [Tested and set aside](#tested-and-set-aside)).

**Proof of value.** After **Darker**, the next five additions really are darker than the previous five, and the listener agrees in an A/B comparison.

#### 23. Metric lab

**The experience.** **Tools → Audio analysis → Metric lab** runs named checks against the library's own labels and prints a report card per *metric profile*. Examples: the default; a "coherent radio" profile; a "surprise" profile; a "score cues" profile. Each surface (radio, Discovery, journeys) can be pinned to a profile, and every profile is versioned.

**Why it earns a place.** Every other similarity feature depends on decisions nobody currently measures. With a crowded top of list, a small change can reshuffle results invisibly.

**What a first lab already shows.** Six diagonal variants were compared on 1,400 queries (700 rated, 700 random). The third column is the rating agreement of other-artist neighbors (Spearman):

| Profile | Same artist in top 10 | Same genre in top 10 | Neighbor rating agreement |
| --- | --- | --- | --- |
| Bliss v2 default | 2.3% | 11.9% | 0.17 |
| Equal weights | 2.1% | 11.9% | 0.18 |
| Tempo removed | 2.2% | 11.8% | 0.11 |
| Standardized dimensions | 2.1% | 11.7% | 0.20 |
| Timbre and level only | 1.5% | 10.1% | 0.18 |
| Harmony only | 1.1% | 8.3% | 0.14 |

With about 450 rated pairs per profile, the sampling error on those correlations is about ±0.05. A quick probe like this cannot separate most of the profiles. That is exactly why the lab needs larger samples, confidence intervals and saved baselines. The one fairly clear signal is that harmony alone is the weakest, and that removing tempo seems to hurt even though the tempo estimate itself is unreliable.

**Gap it fills.** Listening tests stay; this is the cheap layer that runs before them and after every change.

**Across the apps.** Music Library owns the profiles and builds one exact index per profile by rescaling the stored vectors. Today's index file is 77 MB, so a handful of profiles is affordable. Aurora and Tonehavn reference profiles by name and version.

**First version and limits.** Start with four checks: same album artist, same genre family, rating agreement of other-artist neighbors, and twin recall (28). Add playlist co-membership when there are more than 12 saved playlists. Labels are proxies. A profile that maximizes same-genre neighbors would *kill* discovery, so each surface gets its own target, not one global score. The one-off read-only probe used for this report, kept outside the repository, is a starting point.

**Proof of value.** A change that makes the default worse is caught before release, and each surface's profile choice is backed by a saved, reproducible result.

### B. Learn from 154,000 ratings

#### 24. A taste model trained on your ratings

**Implementation update, 2026-10-22:** Opportunity 01 now includes a bounded,
artist-held-out logistic ranking prior in Music Library 0.195.0, consumed by
Aurora 0.40.0. See [Hidden favorites](hidden-favorites.md). This is the first
consumer, not the full scheduled, family-evaluated model and tier-publication
contract proposed here. Opportunity 02 also consumes the same ranking implementation
in Music Library 0.196.0 and Aurora 0.41.0's [rating missions](rating-missions.md);
other recommendation surfaces retain their current ranking. Recording-twin
rating carry-over (28) remains separate future work.

**The experience.** No new page. Anywhere you choose what to audition, a quiet ordering signal appears: **Strong fit · Possible · Stretch**. That covers Ratings Studio queues, **Finish what you love**, Tonight's Album Discovery, Daily Edition Deep Cuts, and the first report's 01 and 02. It never shows predicted stars.

**Why it earns a place.** About 86% of the library is unrated. The ratings you have already given are a large, honest record of your taste. A short play history cannot do this job, and distance to a few favorites captures much less than a model trained on all your ratings, including the negative ones.

**What the data says.** The held-out test used 61,427 five-star and 28,698 one-to-three-star analyzed tracks. Four-star tracks were excluded so the model learns a clear contrast. Folds were grouped by album artist, so every test artist was unseen.

| Model on the 23 sound values only | Held-out AUC |
| --- | --- |
| Logistic regression | 0.753 |
| Gradient-boosted trees | 0.775 |

In one held-out fold, 94.5% of the top-scored tenth were five-star tracks, against 24.7% of the bottom tenth and 67.8% overall. Adding whether a track is a score barely changes the result (0.777).

**Gap it fills.** The first report's 02 prioritizes by sound without any model. Its 01 relies on history that does not exist yet. This is the shared engine for both.

**Across the apps.** Music Library trains the model on a schedule and stores the version and its held-out metrics. It publishes per-track fit tiers. Aurora and Tonehavn read the tiers and never retrain.

**First version and limits.** Treat it as a ranking prior, never a rating. Rated tracks are self-selected: you chose those albums. Of the rated tracks, 82% are scores, so the model is mostly a *score* taste model; report its accuracy separately for songs. Always keep exploration slots, so the model does not narrow what you hear. Retrain after large rating changes. Explanations come from 21, never from the model's internals.

**Proof of value.** Albums suggested as Strong fit are finished and rated higher than Possible ones over the following month. The share of Stretch picks you keep stays above zero.

#### 25. Your five-star sound

**The experience.** **Statistics → Ratings → What your ratings sound like.** For each family (scores, songs, soundtracks) and for chosen genres or decades, it shows which sound traits rise with your stars, illustrated with a few real tracks. Two lists: **Loved exceptions** (five-star tracks unlike your usual five-star sound) and **Surprising low ratings** (tracks that sound like your favorites but got one or two stars). There is also a share card in the style of In Review.

**Why it earns a place.** It is fun to learn something true about your own taste, and the exceptions are a natural re-listening list.

**What the data says.** In scores, with 126,289 rated tracks, the clearest tendencies are about harmony:

| Trait | Rank correlation with your rating |
| --- | --- |
| Semitone clashes (interval class 1) | −0.21 |
| Major triads | +0.20 |
| Fourths and fifths (interval class 5) | +0.18 |
| Diminished triads | −0.18 |
| Augmented triads | −0.13 |

In short, you rate consonant, triadic score music higher than dissonant or atonal cues. In songs (24,170 rated tracks), the strongest trait is level (+0.14). That is probably confounded with era and genre and should be presented as such.

**Gap it fills.** Taste drift is genre-based. The first report deliberately avoids inferring anything about the person, and this report keeps to that. It describes the *music you rated*, not you.

**Across the apps.** Music Library computes and exports the report. Aurora opens the evidence tracks and plays them as playlists.

**First version and limits.** Correlations of 0.2 are tendencies, not rules. Show them as "slightly more often" with example tracks, never as a formula. Compare within a family or decade to limit confounding. Never use the words "mood" or "personality."

**Proof of value.** The evidence playlists make the stated tendency audible, and the exceptions lists lead to re-listening or re-rating.

#### 26. Teach it a word

**The experience.** Create a personal sonic tag such as "Rainy," "Workbench" or "Big finish." Mark ten tracks *yes* and ten *no*. The app then asks about the ten tracks it is least sure of, and you answer for three short rounds. The tag becomes a filter everywhere: Aurora search `sonictag:rainy`, Smart playlist rules, radio constraints. It is stored in the app, not written to MP3s, unless you explicitly promote it.

**Why it earns a place.** Your best categories are not genres. A few minutes of yes/no answers turns a private word into a reusable tool for the whole library.

**What the data says.** The same probe that kills genre auto-tagging guides this design. Neighbors recover film genre barely better than always guessing the largest genre (14.7% vs 11.1%), because a thriller score does not *sound* like a thriller. So the tool must report, after the rounds, whether your word is learnable from sound: *"Rainy: 84% on held-out answers"* versus *"Big finish doesn't seem to be about sound."*

**Gap it fills.** The first report's 04 uses positive and negative examples for one playlist. This produces a reusable attribute, asks the questions that teach it most, and is honest about failure.

**Across the apps.** Music Library stores tags and their versions. Aurora runs the question rounds, because they require listening. Tonehavn uses published tags as filters.

**First version and limits.** For the first round, weight dimensions by how consistent your "yes" examples are. Bliss's own `variance_based_weight_matrix` does exactly this ([source](https://docs.rs/bliss-audio/0.13.0/src/bliss_audio/playlist.rs.html)). Later rounds can use a simple classifier. Show a confidence level for each tagged track, and refuse to publish a tag below a stated accuracy.

**Proof of value.** Tags pass their own held-out test and are reused in at least one playlist or station.

### C. Look after the library

#### 27. Level every track

**The experience.** Aurora's loudness setting gains a third source: **ReplayGain when present, otherwise the sonic estimate.** The player shows "Level −3.2 dB (estimated)." Album mode uses one estimate for the whole album, so album dynamics survive.

**Why it earns a place.** This fixes the most common everyday annoyance in a 1.1-million-track library: having to reach for the volume knob.

**What the data says.** Typical levels by decade (median dBFS):

| Decade | Songs | Scores |
| --- | --- | --- |
| 1950s | −15.6 | −19.0 |
| 1960s | −15.3 | −18.2 |
| 1970s | −14.8 | −18.5 |
| 1980s | −15.7 | −19.3 |
| 1990s | −13.0 | −20.2 |
| 2000s | −9.7 | −17.3 |
| 2010s | −9.4 | −15.9 |
| 2020s | −9.8 | −15.7 |

The 1st–99th percentile spread is 23 dB. Aurora's audit found ReplayGain in 7 of 250 MP3s.

**Gap it fills.** The first report's 17 treats normalization as already solved. In Aurora it is solved for about 3% of files.

**Across the apps.** Music Library publishes an estimated gain per track and per album with the analysis. Aurora applies it through its existing gain stage and clipping prevention. Tonehavn can use it for the first play before its own R128 measurement completes, and for planning downloads.

**First version and limits.** The analysis level is an unweighted power mean of 1,024-sample frames. That is close to RMS, but it is not K-weighted LUFS ([ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770)), so bass-heavy material will be misjudged slightly. Calibrate it with a small regression against tracks whose loudness is known: Tonehavn's R128 results and ReplayGain-tagged files, with brightness as a second input to approximate K-weighting. Publish the remaining error. The analysis stores no peak value, so start attenuate-only (turn loud tracks down, never boost) and allow small boosts only behind Aurora's limiter. Keep this a separate, visible setting.

**Proof of value.** Calibration error is published and small. A one-hour mixed-era shuffle needs no manual volume changes. No new clipping appears.

#### 28. Recording twins

**The experience.** **Music Tools → Recording twins** lists groups of files that are the same recording, in two kinds:

- **Identical audio:** byte-identical payload, certain.
- **Sonic twins:** distance under 0.02 and matching title and duration, a strong candidate.

For each group you can carry a rating across copies (explicitly), mark a preferred copy (Music Doctor shows the bitrates), or mark the group as one recording for repeat control.

**Why it earns a place.** Compilations, reissues and deluxe editions repeat recordings. Twins get rated twice or inconsistently, and they appear twice in radio, journeys and Trip Tapes.

**What the data says.** There are 3,122 identical-audio groups covering 6,841 tracks. 2,997 groups span different albums, 328 are partly rated, and 17 have conflicting ratings for the same bytes. Beyond those, about 1% of sampled tracks have a different-bytes neighbor within 0.02, and about four in five of those share a title and duration. That suggests roughly 10,000 re-encoded twins library-wide. The threshold is sharp: between 0.02 and 0.05 only a quarter share a title, and beyond 0.05 almost none do.

**Gap it fills.** The first report says that "sonic proximity is not recording identity" and that missing relationships should stay unknown. As proof that is right. As *evidence* it is unusually strong at very small distances, and repeat control in its 06, 07 and 15 needs exactly this.

**Across the apps.** Music Library finds groups and owns review. Aurora and Tonehavn read group IDs for repeat limits and shuffle (30).

**First version and limits.** Identical-audio groups need no review for repeat control. Sonic twins need title and duration agreement and a human for anything that changes ratings. A radius query of 0.02 against the existing k-d tree is cheap, so a full scan is a background job, not a project. Remasters, mono/stereo versions and alternate takes may sit just above the threshold; leave them unknown. Never delete or merge files.

**Proof of value.** Conflicting ratings are resolved. Radio and Trip Tapes stop repeating the same recording from different albums. False groups stay rare in review.

#### 29. Sound check on arrival

**The experience.** When an album enters Aurora Inbox, or a Wish List download completes, a **Sound check** panel appears:

- Where the album lands: its nearest owned albums.
- How varied it is.
- Tracks that are near-silent or far from the rest of the album.
- Tracks that are sonic twins of music you already own (re-encodes that the byte-identical check misses).
- A suggested destination: **Scores** or **General**.
- A first-listen idea: "play after *X*."

Once the album is imported, its analysis is already done. As a secondary entry point, Aurora can accept any audio file dropped onto search ("what do I own that sounds like this?").

**Why it earns a place.** Attention peaks when music arrives. A check at that moment avoids filing duplicates, catches broken rips, and gives a new album a place to start.

**What the data says.** Sound alone puts a track in the right root folder 82% of the time: General 89%, Scores 79%. It fails for Synthwave (0 of 40), which sounds like general electronic music. So destination hints should cover only Scores vs General. Across the library, 85 tracks have a mean level below −50 dBFS: hidden-track padding, silent placeholders or broken files.

**Gap it fills.** The first report works only on music that is already filed and analyzed. Today new imports wait for the next manual analysis batch.

**Across the apps.** Aurora Inbox shows the panel. Music Library runs the analyzer through the existing worker and lock, at about 0.45 seconds per file, so a 30-track album takes around 15 seconds. It also records results so intake does not analyze the same files twice. A library-wide run of the same checks produces a one-time health list.

**First version and limits.** Make it advisory and never block intake. Coordinate with Music Doctor to avoid duplicate warnings. Respect the one-writer lock. If a full library job is running, queue intake files first.

**Proof of value.** Duplicates caught before filing, broken files found before backup, and fewer albums moved between roots after import.

### D. Better everyday listening

#### 30. Smooth and Spread shuffle

**The experience.** Shuffle gets two new modes beside today's Random:

- **Smooth:** each next track is drawn at random from the *nearest part* of what remains, so the session drifts instead of lurching.
- **Spread:** similar-sounding tracks and twins (28) are kept apart, so a playlist of 40 does not play four near-identical cues in a row.

Both work on anything: albums, playlists, Aurora's Random sort, and Tonehavn's Advanced Search **Shuffle**.

**Why it earns a place.** Shuffle is how much of a large library is actually heard. A random shuffle jumps a typical 0.6 between tracks, about seven times the distance to a nearest neighbor.

**Gap it fills.** The first report's 05 is a deliberate editing tool with locks and saved versions. This is a playback mode: different every time, and requiring no editing.

**Across the apps.** One shared algorithm in `sonic-core` with a seed, so Tonehavn's materialized shuffle stays reproducible within its queue-revision rules.

**First version and limits.** Smooth uses a randomized nearest-remaining choice, with a lookahead so the far-away tracks do not all pile up at the end. Spread penalizes small distances within a three-track window. Tracks without analysis are placed randomly. Keep Random as the default until listening confirms the new modes.

**Proof of value.** Listeners prefer Smooth for background sessions, and Spread visibly removes clumps without making sessions feel disjointed.

#### 31. Crowd + ear, with a coherence dial

**Related implementation, 2026-10-23:** Opportunity 09 now ships a three-position
metadata control for decade, album-artist credit and catalog genre in Aurora's
listening challenge. This addresses the correction above in both directions;
it does not implement Last.fm blending or change station behavior. See
[Same sound, different world](same-sound-different-world.md).

**The experience.** One control on stations: **Stay in style ⟷ Cross borders.** Every queued track carries its evidence: *sound + listeners*, *sound only*, or *listeners only*.

**Why it earns a place.** Pure sonic radio crosses borders constantly; Tonehavn's Last.fm Artist Radio stays coherent but cannot hear anything. You want to choose where you are on that line tonight.

**What the data says.** The default metric's top ten are 98% other album artists and 89% other genres. Sound cannot supply "style" for scores: neighbors recover film genre at 14.7%. So coherence must come from metadata: genre family, decade, Last.fm relationships and album-artist links.

**Gap it fills.** The first report's 09 assumes crossing must be added. The data says coherence must be added. Its 06 steers by examples but has no coherence control. Music Library Discovery already blends sound with Last.fm for *albums*, "agreements between sound and Last.fm rank first"; stations in Aurora (sound-only) and Tonehavn (Last.fm-only) do not.

**Across the apps.** Aurora's sonic radio adds metadata reranking. Tonehavn's stations add sonic candidates once publication exists. Both reuse Music Library's agreement-first logic.

**First version and limits.** Three dial positions before a slider. Last.fm coverage is thin for obscure scores, so treat *listeners only* as unavailable rather than negative. Keep the existing repeat windows.

**Proof of value.** At "Stay in style" sessions are rated coherent, and at "Cross borders" they lead to saves from unfamiliar artists.

#### 32. Skips that steer, visibly

**The experience.** In a Tonehavn station, after two early skips of tracks that share a sonic direction, a small banner appears: *"Steering away from bright brass fanfares for this session — Undo."*

**Why it earns a place.** You often skip because the station has drifted. Saying so explicitly (the first report's 06) is good, but most people just press Next.

**What the data says.** Tonehavn already separates listening evidence carefully: "skipped only on an early explicit Next," with a 90-day half-life. Today that evidence scores tracks and artists, not sound neighborhoods.

**Gap it fills.** The first report rejects implicit steering because "ordinary skipping is ambiguous." Tonehavn's classification removes much of the ambiguity, and visibility plus Undo handles the rest.

**Across the apps.** Tonehavn first. It needs per-track vectors or neighborhood IDs in its sonic publication.

**First version and limits.** Act only when at least two early skips sit close together in sound and the station's recent picks differ from them. The effect is session-only: never touch ratings, Ban, or long-term affinity. Undo restores the previous target.

**Proof of value.** Fewer consecutive early skips after steering, and Undo used rarely.

#### 33. Smart downloads

**The experience.** **Downloads → Smart downloads: keep 10 GB of music I'm likely to want.** On Wi-Fi and while charging, Tonehavn refreshes a rolling set drawn from:

- the neighborhoods of what you have played recently;
- Strong-fit tracks from 24;
- favorites due a revisit;
- a few deliberate stretches.

Pinned and manual downloads are never evicted, and a short "What changed" list shows the rotation.

**Why it earns a place.** Offline libraries go stale. The first report's 15 is a deliberate, one-time pack, and its 16 needs a good pool to work with. This keeps the pool good without effort.

**Across the apps.** Selection runs on the Tonehavn server using published sonic data; the phone only downloads a list. That is simpler than on-device recommendation.

**First version and limits.** Respect the existing shared-file accounting, so a track in two collections counts once. Respect iOS background limits and metered networks. Report honestly what is offline. Bound the rotation so a favorite does not vanish on the day you want it.

**Proof of value.** In airplane mode, sessions draw on Smart downloads and lead to saves. Storage stays within budget across weeks.

### E. For the score collector

#### 34. Score suite

**The experience.** On a long score: **Suite: 20 / 30 / 45 minutes.** The app builds an in-order selection that keeps the opening and the finale or end credits. It includes your highest-rated cues, then fills the remaining time with cues that cover the album's range. It skips near-duplicate alternates and, optionally, very short stingers. Save it as a playlist, or download it in Tonehavn.

**Why it earns a place.** Expanded and complete editions often run two or three hours. A suite is the collector's equivalent of the original album program: the shape of the whole score in an evening's time.

**What the data says.** Score albums are internally more varied: median spread 0.306 versus 0.222 for song albums, from 23,237 score albums and 41,709 song albums with eight or more tracks. A single representative or a mean loses most of that.

**Gap it fills.** The first report's 03 picks two or three representatives as entry points for discovery. This produces a playable, narrative-ordered, time-budgeted listen.

**Across the apps.** Music Library computes per-album structure, which it shares with the first report's 03. Aurora previews and plays the suite. Tonehavn downloads it.

**First version and limits.** Use complete tracks only: a suite is a selection, not an edit. Order by disc and track. Title rules can mark "alternate," "film version" and "source" cues for optional exclusion. Short albums get no suite.

**Proof of value.** Suites are finished more often than full expanded editions started the same week, and they lead to saved favorite cues.

#### 35. Album shape

**The experience.** A thin strip beneath every tracklist shows each track's level, brightness and tension as small bars. Hover to read a value; click to play. The same strip appears on playlists and mixtape sides.

**Why it earns a place.** You can see the arc at a glance: the loud main title, the quiet middle, the big finish, or the one track that does not belong.

**What the data says.** Arcs are real even in whole-track values. In score albums with 12 or more tracks, the first track sits 1.0 dB above the album median and the last 0.8 dB above. Only 19% of score closers are in their album's quietest quarter. Song albums end softly: closers are 0.3 dB below the median, and 40% are in the quietest quarter. These figures come from 21,374 score albums and 18,353 song albums.

**Gap it fills.** Nothing in either app shows an album's shape. The first report's 05 highlights transitions only inside a workshop.

**Across the apps.** Aurora's album and playlist views, and Music Library's album detail. Aurora's waveform cache can add a within-track envelope for tracks it has already displayed.

**First version and limits.** Whole-track values only, and three rows at most. Missing analysis shows as a gap, never as zero.

**Proof of value.** People use it to pick an entry point into an album or to spot a misfiled track.

#### 36. Theme tracker

**The experience.** On a cue: **Find this theme.** It lists other cues, on the same album and across a franchise, where the melody or progression returns, with timestamps. A **Theme map** shows where a leitmotif appears across every *Star Wars*, *Lord of the Rings* or *Zelda* score you own.

**Why it earns a place.** For a score collector, tracking themes is the deepest kind of listening. It answers questions like "Where does this motif first appear?" and "Which sequel score quotes the original?"

**What it needs.** New, time-resolved harmony data: beat-synchronized 12-bin chroma, matched with methods from cover-song identification. These are transposition-invariant and tempo-tolerant, for example [chroma with dynamic programming](https://www.ee.columbia.edu/~dpwe/pubs/EllisP07-coversongs.pdf). The current harmony values summarize proportions across the whole track and contain no time order.

**Gap it fills.** The first report's 19 retrieves passages that *sound* alike (timbre and texture). Themes are melodic and harmonic sequences, which is a different capability.

**Across the apps.** Music Library runs a separate, opt-in extraction profile on chosen franchises and stores compact chroma: about 1 KB per minute at two frames per second. Aurora shows matches with seekable timestamps.

**First version and limits.** One franchise, offline, every match confirmed by a person. Reorchestration and fragmentary quotes are hard cases, so report confidence. This is research-grade work: worth a prototype, not a promise.

**Proof of value.** For a handful of themes you know well, the tracker finds most known appearances and few false ones.

### F. Play and almanac

#### 37. Sonic hot & cold

**The experience.** Each day there is a hidden album from your library. Guess any album, and the game tells you how close you are by rank ("#1,204 of 67,541") and which sound group is warm ("harmony: hot · level: cold"). Hints unlock after ten guesses: first the decade, then the family. When you find it, play it. A shared daily seed keeps Aurora and Tonehavn in step, so a streak survives switching devices.

**Why it earns a place.** It takes two minutes a day, it teaches you the shape of your own collection, and every solution is an album you own and might have forgotten.

**Gap it fills.** The first report has a single game (10).

**Across the apps.** Music Library chooses the daily album and publishes its mean vector. Aurora and Tonehavn host the guessing; ranks come from album means through the existing index.

**First version and limits.** Choose secrets with at least 80% analysis coverage. Offer an **Easy** pool (rated or loved albums) and a **Discovery** pool (unrated ones). Because the space is crowded, show rank bands rather than exact distances. Explanations reuse 21.

**Proof of value.** People come back daily, and solved albums get played.

#### 38. Sonic golf and Odd one out

**The experience.** **Golf:** get from track A to track B. Each turn offers the six nearest neighbors of the current track, from different artists. Pick one and hear a preview. The game shows par, the shortest route the app found, and keeps a scorecard. **Odd one out:** four tracks, three of them close in sound and one from far away but in the same genre. Find the outsider by ear.

**Why it earns a place.** Journeys are built automatically; golf lets you make the path yourself. It is a game that doubles as a tour of the space between two pieces of music you know.

**Across the apps.** Aurora first. Tonehavn later, with downloaded rounds.

**First version and limits.** Nearest-neighbor links are not symmetric, so some positions are dead ends: allow a "mulligan." Previews start at a fixed position and never claim to be the best excerpt. Compute par with the existing journey builder or a breadth-first search over neighbor lists.

**Proof of value.** Rounds are finished, and holes lead to saves.

#### 39. The sound of your collection

**The experience.** A **Statistics → Sound** page, plus sound cards in In Review:

- the loudness war, as it shows up in your own collection;
- your **Loud old masters**;
- chart hits against other songs from the same decade;
- label and publisher sound signatures (which labels are most consistent and which most varied);
- superlatives: the most varied album, the quietest score, the most consonant composer, the brightest decade.

Every chart point opens its tracks.

**Why it earns a place.** It is a museum of your own collection, and it works today. The first report's 13 needs a year of listening that does not exist yet.

**What the data says.**

- **The loudness war.** Songs held at about −15 dB through the 1980s and reached −9.4 dB by the 2010s. Scores rose later and less.
- **Dynamics.** Frame-level variation relative to level fell from −0.35 to −1.29 dB for songs over the same period, while scores stayed positive throughout.
- **Loud old masters.** 644 pre-1990 song albums have most tracks at modern levels, most likely loud remasters.
- **Chart hits.** Hits are 0.4–1.7 dB louder than other songs from the same decade in every decade except the 1980s, and marginally brighter. That is a charming fact, not a predictor.

**Across the apps.** Music Library computes it. In Review's existing share card adds a sound panel. Aurora opens the evidence.

**First version and limits.** Album year comes from tags, so remasters keep the original year, which is exactly what reveals them. Show sample sizes and use medians. Avoid causal language ("hits are louder *because*…").

**Proof of value.** The charts can be reproduced from a named snapshot, and every superlative names its track.

### G. Assistants

#### 40. Give Luna and Jev ears

**The experience.** Ask Luna things like *"Which of my five-star score albums are the darkest and quietest?"* or *"Find 1970s rock that sounds like this cue."* Ask for *"a 40-minute Trip Tape that starts bright and ends dark."* Luna and Jev call bounded sonic tools:

- describe a track or album (the descriptors from 21);
- find neighbors with filters and nudges (22);
- summarize a region;
- list twin groups.

**Why it earns a place.** The assistants already turn questions into catalog queries. Without sound they cannot answer the questions this analysis makes possible.

**Gap it fills.** The first report mentions language models only for wording. Jev's 0–4 suitability rubric for Trip Tape and mixtapes could also respect a sonic arc rather than title evidence alone.

**Across the apps.** Music Library exposes the tools to Luna. Tonehavn exposes the same tool contract to its Jev integration for Trip Tape. Results reference catalog IDs; the model sees only descriptors and titles.

**First version and limits.** Only derived numbers and titles leave the machine, never audio. Follow the existing opt-in, bounded-shortlist rules: at most about 50 items per call, and no bulk vectors. Include a descriptor glossary in each tool schema so the model does not turn "bright" into "happy." Keep factual explanation templates, as Tonehavn already does for Jev.

**Proof of value.** Answers cite real tracks that pass the stated sound constraint when checked with 21.

## How the new ideas strengthen the first 20

| First report idea | Strengthened by | How |
| --- | --- | --- |
| 01 Hidden favorites | 24, 28 | The taste model replaces thin history; twins prevent "discovering" a copy of a known favorite |
| 02 What should I rate next? | 24, 28 | A better audition order; carry-over removes rating work for exact copies |
| 03 An album's many sides | 34, 35 | Shared per-album structure and display |
| 04 Sonic smart playlists | 22, 26 | Nudged seeds and learned tags become recipe rules |
| 05 Playlist flow workshop | 21, 27, 35 | Explains why a handoff is rough; level-matched auditions; a shape strip |
| 06 Radio you can steer | 22, 31, 32 | Direction, coherence and visible skip steering |
| 07 A journey that fits your time | 27, 28 | Level-matched sessions; no repeated recordings |
| 09 Same sound, different world | 31 | Crossing is the default; the dial works in both directions |
| 10 Blind tasting | 27, 21 | **Level-match the candidates**, or the louder one tends to win; explain at the reveal |
| 11 A playable sonic atlas | 21, 23 | Readable axes; a metric profile chosen for mapping |
| 13 Your year in sound | 39 | A collection-based version first |
| 14 Sonic outlier detective | 28, 29 | Twins and arrival checks cover the most useful cases |
| 15 Pack my collection | 24, 28 | Pack strong fits; do not spend storage on twins |
| 16 Pocket sonic radio | 30, 33 | Shuffle modes offline; a fresh pool |
| 17 Sound comfort sessions | 27 | Leveling is the first comfort feature |
| 18 Music that matches your pace | 23 | Validate tempo before trusting it |
| 19 More like this moment | 36 | Shared time-resolved extraction; Aurora's waveform cache |
| 20 Transitions that hear the ending | 27 | Level-matched handoffs; Aurora's waveform cache for track endings |

**Implementation update, 2026-10-22:** Idea 03 now has shared, versioned
per-album representatives and groups in Music Library 0.197.0 and an Aurora
0.42.0 listening panel. See [An album’s many sides](album-many-sides.md).
The structure is available for future 34/35 work; score suites and album-shape
strips themselves remain proposals.

**Implementation update, 2026-10-22:** First-report idea 04 now ships in Music
Library 0.198.0 and Aurora 0.43.0 with positive examples, native filters and
explicit refresh semantics. See [Sonic Smart playlists](sonic-smart-playlists.md).
Ideas 22 and 26 remain proposals: saved recipes do not yet use query nudges or
learned personal tags.

## Tested and set aside

These looked promising and the data says not yet, or not this way.

- **Genre auto-tagging from neighbors.** It is right 14.7% of the time against 11.1% for always guessing the largest genre. Thriller, Sci-Fi and Soundtrack are recovered 2–3% of the time. Film genre is not audible in these features. Use 26 for personal concepts that are actually about sound.
- **Synthwave destination hints.** 0 of 40. Synthwave neighbors are general electronic music.
- **Hub correction** ([Schnitzer et al., 2012](https://jmlr.org/papers/v13/schnitzer12a.html)). Not needed: no track appeared more than three times in 30,000 neighbor slots.
- **Showing BPM.** The median estimate is 128 BPM, and 90% of tracks fall between 97 and 163, in a library that is half orchestral score. That compression is typical of beat-tracker octave errors, and Bliss itself weights tempo at 0.25 for this reason. Removing tempo did lower rating agreement in 23, so keep it as a feature, but do not display it as a number.
- **Fake-bitrate detection.** Spectral rolloff marks where 95% of the energy lies, far below an encoder's low-pass cut. Music Doctor is the right tool.
- **Predicting chart hits.** Hits differ from other songs of the same decade by about a decibel of level and slightly in brightness. That is fine for the almanac (39) and useless as a predictor.

## What I would build first

### First: existing data, everyday value

1. **27 Level every track** in Aurora. Calibrate against Tonehavn's R128 values; attenuate only at first.
2. **21 Why these sound alike** in `sonic-core`, adopted by all three apps' existing evidence lines.
3. **23 Metric lab**, starting from the read-only probe used for this report. Save today's default as the baseline before anything else changes.
4. **28 Recording twins**, starting with the 3,122 identical-audio groups (certain) and the 17 rating conflicts.
5. **30 Smooth and Spread shuffle**, using twin groups for Spread.

### Next: the rating engine and its uses

**24 Taste model** is the shared engine. Turn the first report's **01** and **02** onto it, then Tonight's Album Discovery and Ratings Studio queues. **25 Your five-star sound** is the fun output of the same work. **31 Coherence dial** follows naturally once evidence labels exist. **29 Sound check on arrival** fits wherever Inbox work is next scheduled.

### In parallel: something to play with

**37 Sonic hot & cold** needs only album means and the index. **39 The sound of your collection** is mostly queries over data that already exists.

### Then

- **22 Like this, but…**, **34 Score suite**, **35 Album shape**, **26 Teach it a word**, **40 Give Luna and Jev ears**.
- For Tonehavn, after the publication contract the first report proposes: **33 Smart downloads** and **32 Skips that steer**.
- **36 Theme tracker** as a contained research prototype on one franchise.

## Shared technical notes

### Treat the diagonal metric as an asset

Because the profile is diagonal:

- Per-group explanations are exact (21).
- Query nudges preserve exactness (22).
- Alternative profiles are coordinate rescales with their own exact index (23).

Keep these facts in `sonic-core`'s contract and tests. If a future profile adds off-diagonal terms, explanations need a different decomposition, and the tests should fail loudly.

### Selection beats rank order

With near-ties across the top few hundred results, a radio, a shelf or a puzzle should retrieve broadly and then decide on purpose: fit tier, coherence, diversity, twins, repeat windows. That supports the first report's six-step selection pipeline and gives it a measured reason to exist.

### Calibrate, version, and say what is estimated

Estimated gains (27), fit tiers (24), learned tags (26) and destination hints (29) are all models. Store each with a version, its held-out accuracy, and the snapshot it was trained on. Label them "estimated" in the interface, and let a model refresh change results only when the user can see that it happened.

### Keep the boundaries the first report set

Music Library remains the source of analysis, models and recipes. Aurora remains the listening and auditioning surface. Tonehavn owns its queues, downloads and playlists. Nothing here needs audio to leave the PC. Assistant tools (40) send bounded descriptors under the existing opt-in rules.

## Method and evidence

**Snapshot.** On 2026-10-21, `music-analysis.sqlite3` and `music-library.sqlite3` were opened read-only (SQLite `mode=ro`, `query_only`) and copied into memory. Rows were joined on Music Library's own track-key normalization. The live databases were not modified, the analyzer kept running, and every later calculation used the in-memory copy. At that point 1,086,524 tracks had current-profile results, of which 1,086,273 matched catalog rows.

**Distances.** The profile's own weights. Brute-force exact nearest neighbors in 32-bit floats, with the top 50 re-ranked in 64-bit precision.

**Samples.**

- 3,000 random tracks for neighbor, twin, hub, genre and root statistics.
- 1,400 tracks (700 rated, 700 random) for the metric variants.
- 150 tracks for the crowding ranks.
- 20,000 random pairs for the typical distance.
- Rank correlations based on a few hundred pairs carry about ±0.05 sampling error.

**Taste model.** 90,125 analyzed tracks rated 5★ (61,427) or 1–3★ (28,698); four-star tracks excluded. Five folds grouped by album artist. Logistic regression and histogram gradient boosting (scikit-learn 1.7.1) on the 23 sound values only. AUC is averaged across folds; the decile figures come from one fold.

**Families.** Music Library's own `scores` genre group (action, animation, comedy, documentary, drama, fantasy, horror, sci-fi, thriller, tv, video game, western, anime). "Soundtrack" is kept separate, and everything else counts as songs. Decades use the tagged album year.

**Levels.** Bliss's loudness mean converted back to dBFS. It is an unweighted power mean of 1,024-sample frames ([source](https://docs.rs/bliss-audio/0.13.0/src/bliss_audio/misc.rs.html)), not LUFS. "Relative dynamics" is the loudness standard deviation minus the mean, both in dB.

**Not done.** No listening tests and no app code changes. Tonehavn's service-protected data was not read, and no external service was called. Product effects, effort sizes and priorities are judgments to validate.

**Repository snapshots inspected.**

| Repository | Revision |
| --- | --- |
| Music Library | `c0ab3310` |
| Aurora | `bf38672` |
| Tonehavn / plexamp-replacement | `998f389` |

**Local sources.**

- [Shared sonic contract and diagonal-weight distance](../crates/sonic-core/src/lib.rs)
- [Analyzer output](../Tools/sonic-analyzer/src/main.rs)
- [Sonic behavior, coverage and backups](sonic-analysis.md)
- [Index build and scale proof](sonic-index-performance.md)
- [The first report](sonic-analysis-opportunities-2026-10.md)
- Music Library README sections on Discovery, Statistics, Wish List, Music Doctor and Luna
- Aurora [README](https://github.com/soundtrackgeek/aurora/blob/bf38672/README.md), [audio output and ReplayGain audit](https://github.com/soundtrackgeek/aurora/blob/bf38672/docs/audio-output-contract.md) and [listening-history contract](https://github.com/soundtrackgeek/aurora/blob/bf38672/docs/listening-history-contract.md)
- Tonehavn [README](https://github.com/soundtrackgeek/plexamp-replacement/blob/998f389/README.md): station evidence, Trip Tape and Jev, R128 normalization, downloads

**External references.**

- Bliss 0.13.0 source: [feature weights](https://docs.rs/bliss-audio/0.13.0/src/bliss_audio/lib.rs.html), [loudness](https://docs.rs/bliss-audio/0.13.0/src/bliss_audio/misc.rs.html), [playlist helpers including variance-based weighting](https://docs.rs/bliss-audio/0.13.0/src/bliss_audio/playlist.rs.html)
- [Interval-class chroma features](https://speech.di.uoa.gr/ICMC-SMC-2014/images/VOL_2/1461.pdf), the paper Bliss cites for its harmony dimensions
- [ITU-R BS.1770](https://www.itu.int/rec/R-REC-BS.1770): K-weighted loudness, the basis of EBU R128
- [Schnitzer, Flexer, Schedl and Widmer, 2012](https://jmlr.org/papers/v13/schnitzer12a.html): hubness in music similarity spaces
- [Ellis and Poliner, 2007](https://www.ee.columbia.edu/~dpwe/pubs/EllisP07-coversongs.pdf): cover-song identification with chroma and beat tracking

**Implementation update, 2026-10-23:** First-report idea 07 now ships as
[timed sonic journeys](timed-sonic-journeys.md), including repeat exclusion for
identical MP3 payload hashes from the existing analysis store. This does not
ship the reviewed near-twin tooling from 28 or the calibrated level estimate
from 27. Existing player normalization remains in charge of playback gain.


**Implementation update, 2026-10-23:** Idea 10 now has [Blind tasting](blind-tasting.md) in Aurora 0.46.0 and Tonehavn 0.53.0 / iOS build 70. Tonehavn now has the sonic publication contract introduced in 0.51.0. The game provides concealed A/B listening, explicit reveal/save/album actions and one downloadable iPhone round. Level handling reuses Aurora's calibrated estimate and Tonehavn's measured normalization; estimates and device verification limits remain explicit.


**Implementation update, 2026-10-23:** First-report idea 11 now ships as a
[playable local sonic atlas](sonic-atlas.md) in Music Library 0.201.0 and Aurora
0.47.0. Brightness and average frame-level axes make the view readable; region
selection retains the original full-profile metric. Snapshots, recording
fingerprints and explicit rebuilds keep layouts stable. This uses the baseline
weights; it does not claim to ship the alternative metric validation from 23
or the full descriptor system from 21.
