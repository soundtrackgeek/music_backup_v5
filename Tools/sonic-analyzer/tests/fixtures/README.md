# Generated MP3 fixtures

These fixtures contain six seconds of seeded synthetic noise, generated for
decoder regression tests. No library music or third-party recordings are included.
The generated audio is dedicated to the public domain (CC0).

`noise.mp3` was generated with:

```sh
ffmpeg -f lavfi -i 'anoisesrc=d=6:r=44100:a=0.2:seed=12345' -ac 2 \
  -codec:a libmp3lame -b:a 64k -write_xing 0 -map_metadata -1 \
  -id3v2_version 0 -write_id3v1 0 noise.mp3
```

`large-id3.mp3` prepends an ID3v2.3 APIC frame containing an opaque one-MiB
simulated JPEG payload. The ID3 size is synchsafe; the APIC size is big-endian.
Its MP3 payload is identical to `noise.mp3`. The build runs the finished native
sidecar on this file before bundling. Integration tests also construct ID3v2.3
and ID3v2.4 tags with MPEG-looking image data and compare the resulting features
with the untagged file.
