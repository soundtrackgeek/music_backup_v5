# Generated MP3 fixtures

These fixtures contain six seconds of seeded synthetic noise, generated for
decoder regression tests. No library music or third-party recordings are included.
The generated audio is dedicated to the public domain (CC0).

`mpeg-layer2.mp3` uses the same source command with `-codec:a mp2 -b:a 128k -f mp2`,
without MP3-specific tag options. Its intentional `.mp3` suffix reproduces
cataloged MPEG layer II files that previously failed as unsupported codecs.

`no-duration.mp3` prepends a 208-byte MPEG1 stereo metadata frame to `noise.mp3`:
header `ff fb 50 64`, `Xing` at byte 36, and zero flags/padding. The frame contains
no frame-count/duration field and no audio. Bliss's normal decoder rejects the
unknown duration; the fallback must produce exactly the bare fixture's features.

`noise.mp3` was generated with:

```sh
ffmpeg -f lavfi -i 'anoisesrc=d=6:r=44100:a=0.2:seed=12345' -ac 2 \
  -codec:a libmp3lame -b:a 64k -write_xing 0 -map_metadata -1 \
  -id3v2_version 0 -write_id3v1 0 noise.mp3
```

`large-id3.mp3` prepends an ID3v2.3 APIC frame containing an opaque one-MiB
simulated JPEG payload. The ID3 size is synchsafe; the APIC size is big-endian.
Its MP3 payload is identical to `noise.mp3`. The build runs the finished native
sidecar on the tagged, layer II and missing-duration fixtures before bundling.
Integration tests also construct ID3v2.3
and ID3v2.4 tags with MPEG-looking image data and compare the resulting features
with the untagged file.
