# What Songstress could add: stereo and a per-second timeline

## Five more additions for Music Library, Aurora and Tonehavn

**Prepared: 2026-10-29.** This note reviews [RezRitz/songstress](https://github.com/RezRitz/songstress) (MIT, Python, "ear" v0.2) against the two October sonic reports: [What a fully analyzed music library can become](sonic-analysis-opportunities-2026-10.md) (ideas 01–20) and [What the first sonic report missed](sonic-analysis-gaps-and-opportunities-2026-10.md) (21–40). The new additions are numbered **41–45**.

Everything here is a proposal. Nothing has been built, no measurements were taken on this library, and Songstress was read, not run. Numbers about Songstress come from its README, `listen.py` and `examples/`.

## The short version

Songstress is worth borrowing ideas from, not worth adding as a dependency.

- **New to all three apps:** stereo measurement (width and left/right correlation) and a compact per-second feature timeline with section boundaries. Music Library's analysis is whole-track only, and it folds stereo to mono before Bliss sees the audio.
- **Not an improvement:** its tempo and key estimates. The tempo method has the same octave errors that made the gaps report set BPM aside, and its key reads come with modest confidence.
- **Not usable as is:** it reads WAV only, runs as a Python script, and keeps 83 values per second. Music Library is a Rust/Tauri app with about 1.1 million mostly-MP3 tracks.

If I built one thing from this note, it would be **41 Stereo health check**. It works on whole tracks, needs no new storage format, and gives recording twins (28) a way to tell mono and stereo versions apart.

## What Songstress measures

`listen.py` resamples to 22,050 Hz, takes a 2,048-point STFT with a 512-sample hop, and writes two files per track:

| Output | Contents |
| --- | --- |
| `<name>-summary.json` | Duration, tempo and three alternative tempo candidates, whole-track key with a Krumhansl–Schmuckler correlation, mean level, dynamic range, mean spectral centroid, novelty-based sections (each with level, key and stereo width), a 10-second energy arc, and a stereo block with anomaly flags |
| `<name>-features.npy` | One row per second: 64 log-mel bands, 12 chroma bins, spectral centroid, RMS, Side/Mid width in dB, left/right correlation, and width in three bands (below 250 Hz, 250 Hz–4 kHz, above 4 kHz). 83 float32 values per row |

Its design principles match the October reports closely. It reports measurements, not judgments ("derived, not felt"). It never folds stereo silently. It labels every estimate with its confidence. And it keeps the stored data small.

## How it compares with what we have

| Capability | Music Library today | Songstress | Verdict |
| --- | --- | --- | --- |
| Whole-track timbre, level, harmony | Bliss 0.13, 23 values, exact k-d tree | Similar statistics, not a similarity space | Keep Bliss |
| Stereo | None. `Tools/sonic-analyzer/src/decode.rs` averages channels before analysis | Width, correlation, three band widths, per second and per section | **New** (41, 42) |
| Time-resolved data | None stored. Aurora's 640-peak waveform cache is a partial level envelope | Per-second matrix, about 61 KB per track | **New, too big as is** (43) |
| Sections inside a track | None | Novelty curve over the timeline, boundaries at least 10 s apart | **New** (44) |
| Tempo | Bliss tempo, weighted 0.25 and not displayed (set aside in the gaps report) | Spectral-flux autocorrelation, 40–200 BPM | Not better. Its own example lists candidates from 69.8 to 143.6 BPM |
| Key | Harmony values are interval and triad proportions, explicitly not keys | Krumhansl–Schmuckler, whole track and per section | Weak. The example's whole-track correlation is 0.575, sections range from 0.30 to 0.69, and the README admits some reads land a half-step low on detuned material |
| Loudness | Aurora 0.38.0 levels untagged MP3s from the stored level, calibrated to EBU R128 (mean error 0.89 dB) | RMS dB and dynamic range | Already covered |
| Input formats | MP3 through Symphonia | WAV only (`scipy.io.wavfile`) | Port the method, not the script |

## The five additions

| ID | Addition | Best first home | Data | Effort |
| --- | --- | --- | --- | --- |
| 41 | Stereo health check | Music Library (Music Doctor) | Extra, whole-track | S–M |
| 42 | Stereo as twin evidence | Music Library (Recording twins) | Extra, whole-track | S |
| 43 | A small timeline per track | Music Library, read by Aurora | Extra, time-resolved | M–L |
| 44 | Sections inside a track | Aurora, then Tonehavn | Derived from 43 | M |
| 45 | A listening card for Luna and Jev | Music Library | Existing + 41/43 | S–M |

### 41. Stereo health check

**The experience.** Music Doctor gains a **Stereo** column and a filter for files with a stereo problem. Each flag names the evidence, for example *"Left and right are identical: mono in a stereo file"* or *"Channels largely cancel (correlation −0.93): check for a phase-inverted channel."*

**What it measures.** For each file, from the decoded channels before the mono fold: Side/Mid energy ratio in dB, left/right correlation, and per-channel level. Each rule is deterministic:

| Flag | Rule (to be tuned on a probe) |
| --- | --- |
| Mono in a stereo file | Side energy effectively zero for the whole track |
| One silent channel | One channel below about −80 dBFS while the other carries signal |
| Phase problem | Correlation strongly negative over most of the track |
| Very wide or unstable | Width far above the library's own distribution, reported but never called an error |

**Why it earns a place.** Music Library is a catalog and backup app, and these are faults a listener only hears on the wrong speakers or in mono. Rules like these are cheap to verify and rarely wrong.

**How it fits.** The isolated analyzer already decodes every channel in `decode.rs` before averaging them. A small stereo summary can be computed in the same pass and returned beside the Bliss vector. Store it as a separate versioned capability, as the first report recommends for richer analysis, so the Bliss profile and the exact index stay unchanged. Re-running only for stereo still needs a decode per track, so it belongs in the normal idle-time job, not a separate scan.

**First version and limits.** Mono-source tracks (older recordings, many score cues) are not faults; "mono in a stereo file" is information, not an error. Lossy MP3 joint stereo can thin out the Side signal, especially in the high band. Songstress's README warns that MP3 discounts its brightness and width reads. Use whole-band and low/mid figures first, and validate the high band before showing it.

**Proof of value.** A read-only probe on a few thousand tracks, like the one in the gaps report, shows how many files each rule flags. A listening spot check confirms a sample of each flag.

### 42. Stereo as twin evidence

**The experience.** No new page. In **Recording twins (28)**, a candidate pair that differs clearly in width or correlation is labeled *"likely mono and stereo versions"* instead of being left unknown.

**Why it earns a place.** The gaps report notes that remasters and mono/stereo versions "may sit just above the threshold," and its advice is to leave them unknown. Bliss cannot separate a mono mix from a stereo mix, because it only ever sees the mono fold. The stereo summary from 41 can.

**First version and limits.** This only adds a label. It never merges, deletes or carries a rating across copies without the existing human review.

**Proof of value.** Among candidate pairs between 0.02 and 0.05 that share a normalized title, a meaningful share split cleanly by width. If they don't, drop the idea.

### 43. A small timeline per track

**The experience.** None directly. This is the shared data that 19 *More like this moment*, 20 *Transitions that hear the ending*, 35 *Album shape*, 36 *Theme tracker* and 44 all need, and which both reports list as missing.

**The storage problem.** Songstress keeps 83 float32 values per second, about 332 bytes. At its own average of 186 seconds that is about 61 KB per track. Across 1.1 million tracks that is roughly **67 GB**, too large for a library-wide store or a portable backup.

**A smaller format.** Keep only what the planned features use, at lower precision:

| Choice | Bytes per second | Per 186 s track | 1.1 M tracks |
| --- | --- | --- | --- |
| Songstress as is (83 × float32, 1 s) | 332 | ~61 KB | ~67 GB |
| 12 chroma + centroid + level + width + correlation (16 × float16, 1 s) | 32 | ~6 KB | ~6.5 GB |
| Same 16 values at one row per 2 s | 16 | ~3 KB | ~3.3 GB |

A further option is to compute timelines only for favorites, rated albums or an offline pack. That is the same staged scope the first report recommends for extra analysis. Scores are often long, so measure the library's real duration distribution before choosing.

**Limits.** Chroma bins are pitch-class energy, not notes or keys. Per-second averages hide transients, which is fine for sections and moments but not for beat alignment.

### 44. Sections inside a track

**The experience.** Aurora's waveform shows faint section boundaries. **More like this moment (19)** can start from a section instead of a whole track. Tonehavn can choose a preview start point at the first high-energy section instead of 0:00.

**How it works.** Songstress compares the five seconds before and after each second of the timeline (cosine novelty over standardized features), keeps peaks above mean + 0.5 standard deviations, and spaces them at least 10 seconds apart. This is about 20 lines of numeric code and runs on stored timelines, not audio.

**First version and limits.** Boundaries are acoustic changes, not "verse" or "chorus"; never label them that way. In through-composed score cues, novelty peaks may be frequent and meaningless. Report section counts per family and leave scores out if the boundaries don't hold up in listening.

**Proof of value.** On a hand-marked set of songs and score cues, most boundaries fall within a few seconds of a real change.

### 45. A listening card for Luna and Jev

**The experience.** When Luna or a Jev feature reasons about a track, it can read a short, factual card: level against the library, brightness percentile, stereo summary, and (once 43 exists) the energy arc and section map. This is the **Give Luna and Jev ears (40)** idea with a concrete format.

**Why it earns a place.** Songstress was built to give an AI collaborator measured numbers instead of adjectives. Its JSON summary is a working example of a bounded, honest input format.

**First version and limits.** The card holds numbers with their confidence and acoustic words only, never mood or quality. It must stay small enough to sit inside a prompt for many tracks at once. Card fields come from stored analysis; the assistant never triggers decoding.

## Tested and set aside

These were considered from the Songstress code and not carried forward.

- **Songstress tempo.** Autocorrelation of spectral flux has the octave ambiguity the gaps report already found in Bliss's tempo (a median of 128 BPM in a library that is half orchestral score). The Songstress example's four candidates span a factor of two.
- **Songstress key.** Krumhansl–Schmuckler correlation on mean chroma is a reasonable baseline, but confidences in the example are modest. Score music is often tonally ambiguous. If keys are ever needed, for example for harmonic transitions in 20, evaluate a dedicated extractor (the first report mentions Essentia's key extractor; Aurora's roadmap lists `stratum-dsp`) and keep the confidence visible.
- **Running Songstress itself.** WAV only, Python, and 83 dimensions per second. Port the specific methods into the Rust analyzer instead. Its MIT licence allows that with attribution.
- **Its loudness figures.** Aurora's EBU R128-calibrated leveling already covers this better.

## Where it fits across the apps

- **Music Library** owns the measurements: the stereo summary (41, 42) and, later, timelines (43). Both are new versioned capabilities beside the Bliss profile, so existing results, the exact index and backups keep working.
- **Aurora** reads them. Its roadmap already recommends **one analysis worker** that decodes each file once and fans the samples out to every analyzer, and that is where stereo and timeline extraction should run if Aurora ever computes its own.
- **Tonehavn** consumes published results only: section-aware preview starts (44) and stereo information in a future published sonic contract. Tonehavn was not re-inspected for this note.

## Method and evidence

Read on 2026-10-29: the Songstress README, `listen.py` and `examples/weight-summary.json` from the repository's default branch. Local sources: `Tools/sonic-analyzer/src/decode.rs` (channel fold before Bliss), the two October sonic reports, Aurora's `README.md` and `docs/improvement-roadmap.md`.

| Repository | Revision |
| --- | --- |
| Music Library | `250127ce` |
| Aurora | `3fbec91` |

No analysis data was queried, no audio was decoded, and Songstress was not run. Storage figures are arithmetic from Songstress's documented row size and average duration, not measurements of this library.
