use anyhow::{anyhow, bail, Context, Result};
use blowfish::Blowfish;
use cbc::cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use chrono::Utc;
use id3::frame::{ExtendedText, InvolvedPeopleList, InvolvedPeopleListItem, Picture, PictureType};
use id3::{Tag, TagLike, Version};
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
#[cfg(not(test))]
use tauri::{AppHandle, Emitter};
use url::Url;
use zeroize::Zeroizing;

const DEEZER_GATEWAY_URL: &str = "https://www.deezer.com/ajax/gw-light.php";
const DEEZER_MEDIA_URL: &str = "https://media.deezer.com/v1/get_url";
const DEEMIX_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 MusicLibrary/0.81";
const DOWNLOAD_EVENT: &str = "deemix-download-progress";
const STREAM_CHUNK_SIZE: usize = 2048;
const MAX_ARTWORK_BYTES: u64 = 20 * 1024 * 1024;
const MAX_ALBUM_TRACKS: usize = 500;
const MAX_PATH_SEGMENT_CHARS: usize = 96;
static DOWNLOAD_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeemixAlbumDownloadRequest {
    pub album_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeemixAlbumDownloadProgress {
    pub request_id: String,
    pub album_id: String,
    pub phase: String,
    pub message: String,
    pub current_track: Option<String>,
    pub completed_tracks: usize,
    pub total_tracks: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeemixAlbumDownloadSummary {
    pub request_id: String,
    pub album_id: String,
    pub artist: String,
    pub album: String,
    pub year: Option<i32>,
    pub quality: String,
    pub destination_path: String,
    pub cover_path: String,
    pub track_count: usize,
    pub completed_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadQuality {
    Mp3_128,
    Mp3_320,
}

impl DownloadQuality {
    fn from_setting(value: &str) -> Self {
        match value {
            "mp3_128" => Self::Mp3_128,
            _ => Self::Mp3_320,
        }
    }

    fn setting_value(self) -> &'static str {
        match self {
            Self::Mp3_128 => "mp3_128",
            Self::Mp3_320 => "mp3_320",
        }
    }

    fn deezer_format(self) -> &'static str {
        match self {
            Self::Mp3_128 => "MP3_128",
            Self::Mp3_320 => "MP3_320",
        }
    }

    fn filesize_field(self) -> &'static str {
        match self {
            Self::Mp3_128 => "FILESIZE_MP3_128",
            Self::Mp3_320 => "FILESIZE_MP3_320",
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::Mp3_128 => "MP3 128 kbps",
            Self::Mp3_320 => "MP3 320 kbps",
        }
    }
}

struct AuthenticatedSession {
    arl: Zeroizing<String>,
    api_token: Zeroizing<String>,
    license_token: Zeroizing<String>,
    can_stream_hq: bool,
}

#[derive(Debug, Clone)]
struct AlbumMetadata {
    id: String,
    title: String,
    artist: String,
    album_artists: Vec<String>,
    release_date: Option<String>,
    year: Option<i32>,
    label: Option<String>,
    genres: Vec<String>,
    upc: Option<String>,
    copyright: Option<String>,
    cover_url: String,
    disc_total: u32,
    tracks: Vec<TrackMetadata>,
}

#[derive(Debug, Clone)]
struct TrackMetadata {
    id: String,
    title: String,
    artists: Vec<String>,
    track_number: u32,
    disc_number: u32,
    duration_seconds: u32,
    isrc: Option<String>,
    explicit: bool,
    copyright: Option<String>,
    composers: Vec<String>,
    involved_people: Vec<(String, String)>,
    track_token: Zeroizing<String>,
}

#[derive(Debug, Clone)]
struct Artwork {
    bytes: Vec<u8>,
    mime_type: String,
    extension: &'static str,
}

#[cfg(not(test))]
pub fn download_album_for_app(
    app: &AppHandle,
    mut input: DeemixAlbumDownloadRequest,
) -> Result<DeemixAlbumDownloadSummary> {
    validate_request(&mut input)?;
    let _download_guard = DOWNLOAD_LOCK
        .lock()
        .map_err(|_| anyhow!("The Deemix download queue is unavailable."))?;
    let settings = crate::db::settings_for_app(app)?;
    let quality = DownloadQuality::from_setting(&settings.deemix_download_quality);
    let root = validate_download_root(&settings.deemix_download_path)?;

    emit_progress(
        app,
        &input,
        "metadata",
        "Validating Deezer and loading album metadata…",
        None,
        0,
        0,
    );

    let session = authenticate()?;
    if quality == DownloadQuality::Mp3_320 && !session.can_stream_hq {
        bail!(
            "This Deezer account does not report high-quality streaming. Choose MP3 128 kbps or reconnect an account with HQ access."
        );
    }
    let album = fetch_album(&session, &input.album_id, quality)?;
    let destination = destination_path(&root, &album, &settings.deemix_download_organization)?;
    if destination.exists() {
        bail!(
            "The destination album folder already exists: {}. Existing files were not changed.",
            destination.display()
        );
    }

    let stage_name = format!(".music-library-download-{}-{}", album.id, input.request_id);
    let stage_path = root.join(stage_name);
    if stage_path.exists() {
        bail!("A staging folder for this download already exists. Try the download again.");
    }
    fs::create_dir(&stage_path).context("Could not create the Deemix staging folder")?;

    let result = download_album_to_stage(app, &input, &session, quality, &album, &stage_path)
        .and_then(|cover_name| {
            if destination.exists() {
                bail!(
                    "The destination album folder was created by another process. Existing files were not changed."
                );
            }
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .context("Could not create the configured album folder structure")?;
            }
            fs::rename(&stage_path, &destination)
                .context("Could not finalize the downloaded album folder")?;
            let cover_path = destination.join(cover_name);
            Ok(DeemixAlbumDownloadSummary {
                request_id: input.request_id.clone(),
                album_id: album.id.clone(),
                artist: album.artist.clone(),
                album: album.title.clone(),
                year: album.year,
                quality: quality.setting_value().to_string(),
                destination_path: destination.to_string_lossy().into_owned(),
                cover_path: cover_path.to_string_lossy().into_owned(),
                track_count: album.tracks.len(),
                completed_at: Utc::now().to_rfc3339(),
            })
        });

    match result {
        Ok(summary) => {
            emit_progress(
                app,
                &input,
                "complete",
                &format!(
                    "Downloaded and tagged {} tracks as {}.",
                    summary.track_count,
                    quality.display_name()
                ),
                None,
                summary.track_count,
                summary.track_count,
            );
            Ok(summary)
        }
        Err(error) => {
            if stage_path.exists() {
                let _ = fs::remove_dir_all(&stage_path);
            }
            emit_progress(
                app,
                &input,
                "failed",
                "The album download failed; staged files were removed.",
                None,
                0,
                album.tracks.len(),
            );
            Err(error)
        }
    }
}

#[cfg(not(test))]
fn download_album_to_stage(
    app: &AppHandle,
    input: &DeemixAlbumDownloadRequest,
    session: &AuthenticatedSession,
    quality: DownloadQuality,
    album: &AlbumMetadata,
    stage_path: &Path,
) -> Result<String> {
    emit_progress(
        app,
        input,
        "artwork",
        "Downloading album artwork…",
        None,
        0,
        album.tracks.len(),
    );
    let artwork = download_artwork(&album.cover_url)?;
    let cover_name = format!("cover.{}", artwork.extension);
    fs::write(stage_path.join(&cover_name), &artwork.bytes)
        .context("Could not save the album cover")?;

    let mut used_names = HashSet::new();
    for (index, track) in album.tracks.iter().enumerate() {
        let completed = index;
        emit_progress(
            app,
            input,
            "downloading",
            &format!("Downloading track {} of {}…", index + 1, album.tracks.len()),
            Some(track.title.clone()),
            completed,
            album.tracks.len(),
        );
        let media_url = fetch_media_url(session, track, quality)?;
        let file_name = unique_track_filename(track, album.disc_total, &mut used_names);
        let final_path = stage_path.join(&file_name);
        let part_path = stage_path.join(format!("{file_name}.part"));
        download_and_decrypt_track(&media_url, &track.id, &part_path)
            .with_context(|| format!("Could not download {}", track.title))?;

        emit_progress(
            app,
            input,
            "tagging",
            &format!("Tagging track {} of {}…", index + 1, album.tracks.len()),
            Some(track.title.clone()),
            completed,
            album.tracks.len(),
        );
        write_mp3_tags(&part_path, album, track, &artwork)
            .with_context(|| format!("Could not tag {}", track.title))?;
        fs::rename(&part_path, &final_path)
            .with_context(|| format!("Could not finalize {}", file_name))?;
    }
    Ok(cover_name)
}

#[cfg(not(test))]
#[allow(clippy::too_many_arguments)]
fn emit_progress(
    app: &AppHandle,
    input: &DeemixAlbumDownloadRequest,
    phase: &str,
    message: &str,
    current_track: Option<String>,
    completed_tracks: usize,
    total_tracks: usize,
) {
    let _ = app.emit(
        DOWNLOAD_EVENT,
        DeemixAlbumDownloadProgress {
            request_id: input.request_id.clone(),
            album_id: input.album_id.clone(),
            phase: phase.to_string(),
            message: message.to_string(),
            current_track,
            completed_tracks,
            total_tracks,
        },
    );
}

fn validate_request(input: &mut DeemixAlbumDownloadRequest) -> Result<()> {
    input.album_id = input.album_id.trim().to_string();
    input.request_id = input.request_id.trim().to_string();
    if input.album_id.is_empty()
        || input.album_id.len() > 20
        || !input
            .album_id
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        bail!("The selected Deezer album ID is invalid.");
    }
    if input.request_id.is_empty()
        || input.request_id.len() > 64
        || !input
            .request_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        bail!("The Deemix download request ID is invalid.");
    }
    Ok(())
}

#[cfg(not(test))]
fn validate_download_root(value: &str) -> Result<PathBuf> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("Choose a Deemix download folder in Settings > Providers first.");
    }
    let root = PathBuf::from(trimmed);
    if !root.is_absolute() {
        bail!("The configured Deemix download folder must be an absolute path.");
    }
    if !root.is_dir() {
        bail!("The configured Deemix download folder does not exist or is not a folder.");
    }
    root.canonicalize()
        .context("Could not resolve the configured Deemix download folder")
}

fn authenticate() -> Result<AuthenticatedSession> {
    let arl = crate::deemix::stored_arl_for_download()?;
    let payload = gateway_request(&arl, "null", "deezer.getUserData", json!({}))?;
    let user_id = scalar_string(payload.pointer("/results/USER/USER_ID")).unwrap_or_default();
    if user_id.is_empty() || user_id == "0" {
        bail!("The stored Deezer ARL is invalid or expired.");
    }
    let api_token = required_string(payload.pointer("/results/checkForm"), "Deezer API token")?;
    let license_token = required_string(
        payload.pointer("/results/USER/OPTIONS/license_token"),
        "Deezer media license",
    )?;
    let options = payload
        .pointer("/results/USER/OPTIONS")
        .unwrap_or(&Value::Null);
    let can_stream_hq =
        flexible_bool(options.get("web_hq")) || flexible_bool(options.get("mobile_hq"));
    Ok(AuthenticatedSession {
        arl,
        api_token: Zeroizing::new(api_token),
        license_token: Zeroizing::new(license_token),
        can_stream_hq,
    })
}

fn gateway_request(arl: &str, api_token: &str, method: &str, args: Value) -> Result<Value> {
    let cookie = Zeroizing::new(format!("arl={arl}"));
    let response = api_agent()
        .post(DEEZER_GATEWAY_URL)
        .query("api_version", "1.0")
        .query("api_token", api_token)
        .query("input", "3")
        .query("method", method)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .set("Cookie", cookie.as_str())
        .set("User-Agent", DEEMIX_USER_AGENT)
        .send_json(args)
        .map_err(|error| network_error(error, "Deezer gateway"))?;
    let payload = response
        .into_json::<Value>()
        .context("Deezer gateway returned an unreadable response")?;
    if has_api_error(payload.get("error")) {
        bail!("Deezer rejected the authenticated metadata request.");
    }
    Ok(payload)
}

fn gateway_call(session: &AuthenticatedSession, method: &str, args: Value) -> Result<Value> {
    let payload = gateway_request(&session.arl, &session.api_token, method, args)?;
    payload
        .get("results")
        .cloned()
        .context("Deezer returned no result for the authenticated metadata request")
}

fn fetch_album(
    session: &AuthenticatedSession,
    album_id: &str,
    quality: DownloadQuality,
) -> Result<AlbumMetadata> {
    let url = format!("https://api.deezer.com/album/{album_id}");
    let response = api_agent()
        .get(&url)
        .set("Accept", "application/json")
        .set("User-Agent", DEEMIX_USER_AGENT)
        .call()
        .map_err(|error| network_error(error, "Deezer album metadata"))?;
    let public_album = response
        .into_json::<Value>()
        .context("Deezer returned unreadable album metadata")?;
    if public_album
        .get("error")
        .is_some_and(|value| !value.is_null())
    {
        bail!("Deezer could not load the selected album.");
    }
    let gateway_album = gateway_call(session, "album.getData", json!({ "ALB_ID": album_id }))?;
    let gateway_tracks = gateway_call(
        session,
        "song.getListByAlbum",
        json!({ "ALB_ID": album_id, "nb": -1 }),
    )?;
    parse_album_metadata(
        album_id,
        &public_album,
        &gateway_album,
        &gateway_tracks,
        quality,
    )
}

fn parse_album_metadata(
    requested_id: &str,
    public_album: &Value,
    gateway_album: &Value,
    gateway_tracks: &Value,
    quality: DownloadQuality,
) -> Result<AlbumMetadata> {
    let id = required_string(public_album.get("id"), "album ID")?;
    if id != requested_id {
        bail!("Deezer returned metadata for a different album.");
    }
    let title = required_trimmed(public_album.get("title"), "album title")?;
    let artist = required_trimmed(public_album.pointer("/artist/name"), "album artist")?;
    let mut album_artists = public_album
        .pointer("/contributors")
        .and_then(Value::as_array)
        .map(|contributors| {
            contributors
                .iter()
                .filter(|contributor| {
                    contributor
                        .get("role")
                        .and_then(Value::as_str)
                        .is_none_or(|role| role.eq_ignore_ascii_case("main"))
                })
                .filter_map(|contributor| string_value(contributor.get("name")))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    album_artists.dedup();
    if album_artists.is_empty() {
        album_artists.push(artist.clone());
    }
    let release_date = first_nonempty([
        string_value(gateway_album.get("ORIGINAL_RELEASE_DATE")),
        string_value(gateway_album.get("PHYSICAL_RELEASE_DATE")),
        string_value(public_album.get("release_date")),
    ]);
    let year = release_date.as_deref().and_then(parse_year);
    let label = first_nonempty([
        string_value(public_album.get("label")),
        string_value(gateway_album.get("LABEL_NAME")),
    ]);
    let upc = first_nonempty([
        string_value(public_album.get("upc")),
        string_value(gateway_album.get("UPC")),
    ]);
    let mut genres = public_album
        .pointer("/genres/data")
        .and_then(Value::as_array)
        .map(|values| string_list_from_objects(Some(values), "name"))
        .unwrap_or_default();
    genres.sort();
    genres.dedup();
    let album_copyright = string_value(gateway_album.get("COPYRIGHT"));
    let cover_url = first_nonempty([
        string_value(public_album.get("cover_xl")),
        string_value(public_album.get("cover_big")),
    ])
    .context("Deezer did not provide album artwork")?;

    let gw_values = gateway_tracks
        .get("data")
        .and_then(Value::as_array)
        .context("Deezer returned no downloadable tracks for this album")?;
    if gw_values.is_empty() || gw_values.len() > MAX_ALBUM_TRACKS {
        bail!("The selected album has an unsupported number of tracks.");
    }
    let public_by_id = public_album
        .pointer("/tracks/data")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|track| scalar_string(track.get("id")).map(|id| (id, track)))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    let mut tracks = Vec::with_capacity(gw_values.len());
    for (index, gateway_track) in gw_values.iter().enumerate() {
        let track_id = required_string(gateway_track.get("SNG_ID"), "track ID")?;
        let public_track = public_by_id.get(&track_id).copied().unwrap_or(&Value::Null);
        let version = string_value(gateway_track.get("VERSION")).unwrap_or_default();
        let mut track_title = first_nonempty([
            string_value(gateway_track.get("SNG_TITLE")),
            string_value(public_track.get("title")),
        ])
        .with_context(|| format!("Deezer omitted the title for track {track_id}"))?;
        if !version.is_empty() && !track_title.contains(&version) {
            track_title = format!("{} {}", track_title.trim(), version.trim());
        }
        let mut artists = string_list_from_gateway_artists(gateway_track.get("ARTISTS"));
        if artists.is_empty() {
            if let Some(name) = string_value(public_track.pointer("/artist/name")) {
                artists.push(name);
            }
        }
        if artists.is_empty() {
            artists.push(artist.clone());
        }
        let track_number = scalar_u32(gateway_track.get("TRACK_NUMBER"))
            .unwrap_or_else(|| u32::try_from(index + 1).unwrap_or(1))
            .max(1);
        let disc_number = scalar_u32(gateway_track.get("DISK_NUMBER"))
            .unwrap_or(1)
            .max(1);
        let track_token = required_string(gateway_track.get("TRACK_TOKEN"), "track token")?;
        let requested_filesize =
            scalar_u64(gateway_track.get(quality.filesize_field())).unwrap_or(0);
        if requested_filesize == 0 {
            bail!(
                "{} is unavailable as {}. No lower-quality file was substituted.",
                track_title,
                quality.display_name()
            );
        }
        let (composers, involved_people) = contributor_tags(gateway_track.get("SNG_CONTRIBUTORS"));
        tracks.push(TrackMetadata {
            id: track_id,
            title: track_title,
            artists,
            track_number,
            disc_number,
            duration_seconds: scalar_u32(gateway_track.get("DURATION"))
                .or_else(|| scalar_u32(public_track.get("duration")))
                .unwrap_or(0),
            isrc: string_value(gateway_track.get("ISRC")),
            explicit: flexible_bool(gateway_track.get("EXPLICIT_LYRICS"))
                || flexible_bool(public_track.get("explicit_lyrics")),
            copyright: string_value(gateway_track.get("COPYRIGHT"))
                .or_else(|| album_copyright.clone()),
            composers,
            involved_people,
            track_token: Zeroizing::new(track_token),
        });
    }
    tracks.sort_by_key(|track| (track.disc_number, track.track_number));
    let disc_total = scalar_u32(gateway_album.get("NUMBER_DISK"))
        .unwrap_or_else(|| {
            tracks
                .iter()
                .map(|track| track.disc_number)
                .max()
                .unwrap_or(1)
        })
        .max(1);

    Ok(AlbumMetadata {
        id,
        title,
        artist,
        album_artists,
        release_date,
        year,
        label,
        genres,
        upc,
        copyright: album_copyright,
        cover_url,
        disc_total,
        tracks,
    })
}

fn fetch_media_url(
    session: &AuthenticatedSession,
    track: &TrackMetadata,
    quality: DownloadQuality,
) -> Result<String> {
    let cookie = Zeroizing::new(format!("arl={}", session.arl.as_str()));
    let response = api_agent()
        .post(DEEZER_MEDIA_URL)
        .set("Accept", "application/json")
        .set("Content-Type", "application/json")
        .set("Cookie", cookie.as_str())
        .set("User-Agent", DEEMIX_USER_AGENT)
        .send_json(json!({
            "license_token": session.license_token.as_str(),
            "media": [{
                "type": "FULL",
                "formats": [{ "cipher": "BF_CBC_STRIPE", "format": quality.deezer_format() }]
            }],
            "track_tokens": [track.track_token.as_str()]
        }))
        .map_err(|error| network_error(error, "Deezer media authorization"))?;
    let payload = response
        .into_json::<Value>()
        .context("Deezer returned an unreadable media authorization response")?;
    if has_api_error(payload.pointer("/data/0/errors")) {
        bail!(
            "Deezer did not authorize {} as {}.",
            track.title,
            quality.display_name()
        );
    }
    let media_url = required_string(
        payload.pointer("/data/0/media/0/sources/0/url"),
        "Deezer media URL",
    )?;
    validate_deezer_cdn_url(&media_url, false)?;
    Ok(media_url)
}

fn download_and_decrypt_track(url: &str, track_id: &str, path: &Path) -> Result<()> {
    validate_deezer_cdn_url(url, false)?;
    let response = download_agent()
        .get(url)
        .set("User-Agent", DEEMIX_USER_AGENT)
        .call()
        .map_err(|error| network_error(error, "Deezer audio download"))?;
    let expected = response
        .header("Content-Length")
        .and_then(|value| value.parse::<u64>().ok());
    let mut reader = response.into_reader();
    let mut file = File::create(path).context("Could not create the staged audio file")?;
    let written = decrypt_stream(&mut reader, &mut file, track_id)?;
    file.flush()
        .context("Could not flush the staged audio file")?;
    if written < 1024 {
        bail!("Deezer returned an empty or incomplete audio file.");
    }
    if expected.is_some_and(|length| {
        written > length || length.saturating_sub(written) > STREAM_CHUNK_SIZE as u64
    }) {
        bail!("Deezer returned an incomplete audio stream.");
    }
    Ok(())
}

fn decrypt_stream(reader: &mut dyn Read, writer: &mut dyn Write, track_id: &str) -> Result<u64> {
    let key = blowfish_key(track_id);
    let mut chunk_index = 0usize;
    let mut written = 0u64;
    let mut is_start = true;
    loop {
        let mut buffer = [0u8; STREAM_CHUNK_SIZE];
        let mut filled = 0usize;
        while filled < buffer.len() {
            let count = reader
                .read(&mut buffer[filled..])
                .context("Could not read the encrypted Deezer stream")?;
            if count == 0 {
                break;
            }
            filled += count;
        }
        if filled == 0 {
            break;
        }
        if chunk_index % 3 == 0 && filled == STREAM_CHUNK_SIZE {
            decrypt_chunk(&mut buffer, &key)?;
        }
        let start = if is_start && buffer[0] == 0 && (filled < 8 || &buffer[4..8] != b"ftyp") {
            buffer[..filled]
                .iter()
                .position(|byte| *byte != 0)
                .unwrap_or(filled)
        } else {
            0
        };
        is_start = false;
        writer
            .write_all(&buffer[start..filled])
            .context("Could not write the decrypted Deezer stream")?;
        written += (filled - start) as u64;
        chunk_index += 1;
        if filled < STREAM_CHUNK_SIZE {
            break;
        }
    }
    Ok(written)
}

fn blowfish_key(track_id: &str) -> [u8; 16] {
    let digest = Md5::digest(track_id.as_bytes());
    let hex_digest = hex::encode(digest);
    let secret = b"g4el58wc0zvf9na1";
    let bytes = hex_digest.as_bytes();
    let mut key = [0u8; 16];
    for index in 0..16 {
        key[index] = bytes[index] ^ bytes[index + 16] ^ secret[index];
    }
    key
}

fn decrypt_chunk(chunk: &mut [u8], key: &[u8; 16]) -> Result<()> {
    let iv = [0u8, 1, 2, 3, 4, 5, 6, 7];
    cbc::Decryptor::<Blowfish>::new_from_slices(key, &iv)
        .map_err(|_| anyhow!("Could not initialize Deezer stream decryption"))?
        .decrypt_padded_mut::<NoPadding>(chunk)
        .map_err(|_| anyhow!("Could not decrypt the Deezer audio stream"))?;
    Ok(())
}

fn download_artwork(url: &str) -> Result<Artwork> {
    validate_deezer_cdn_url(url, true)?;
    let response = download_agent()
        .get(url)
        .set("Accept", "image/jpeg,image/png")
        .set("User-Agent", DEEMIX_USER_AGENT)
        .call()
        .map_err(|error| network_error(error, "Deezer album artwork"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_ARTWORK_BYTES + 1)
        .read_to_end(&mut bytes)
        .context("Could not read the Deezer album artwork")?;
    if bytes.len() as u64 > MAX_ARTWORK_BYTES {
        bail!("The Deezer album artwork exceeded the safe size limit.");
    }
    let (mime_type, extension) = if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        ("image/jpeg", "jpg")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        ("image/png", "png")
    } else {
        bail!("Deezer returned album artwork in an unsupported format.");
    };
    Ok(Artwork {
        bytes,
        mime_type: mime_type.to_string(),
        extension,
    })
}

fn write_mp3_tags(
    path: &Path,
    album: &AlbumMetadata,
    track: &TrackMetadata,
    artwork: &Artwork,
) -> Result<()> {
    let mut tag = Tag::new();
    tag.set_title(&track.title);
    tag.set_artist(track.artists.join("; "));
    tag.set_album(&album.title);
    tag.set_album_artist(album.album_artists.join("; "));
    tag.set_track(track.track_number);
    tag.set_total_tracks(u32::try_from(album.tracks.len()).unwrap_or(u32::MAX));
    tag.set_disc(track.disc_number);
    tag.set_total_discs(album.disc_total);
    if !album.genres.is_empty() {
        tag.set_genre(album.genres.join("; "));
    }
    if let Some(year) = album.year {
        tag.set_year(year);
    }
    if let Some(date) = &album.release_date {
        tag.set_text("TDRC", date);
    }
    if let Some(label) = &album.label {
        tag.set_text("TPUB", label);
    }
    if let Some(isrc) = &track.isrc {
        tag.set_text("TSRC", isrc);
    }
    if let Some(copyright) = track.copyright.as_ref().or(album.copyright.as_ref()) {
        tag.set_text("TCOP", copyright);
    }
    if track.duration_seconds > 0 {
        tag.set_text(
            "TLEN",
            (u64::from(track.duration_seconds) * 1000).to_string(),
        );
    }
    if !track.composers.is_empty() {
        tag.set_text("TCOM", track.composers.join("; "));
    }
    if !track.involved_people.is_empty() {
        tag.add_frame(InvolvedPeopleList {
            items: track
                .involved_people
                .iter()
                .map(|(role, name)| InvolvedPeopleListItem {
                    involvement: role.clone(),
                    involvee: name.clone(),
                })
                .collect(),
        });
    }
    if let Some(upc) = &album.upc {
        tag.add_frame(ExtendedText {
            description: "BARCODE".to_string(),
            value: upc.clone(),
        });
    }
    tag.add_frame(ExtendedText {
        description: "ITUNESADVISORY".to_string(),
        value: if track.explicit { "1" } else { "0" }.to_string(),
    });
    tag.add_frame(ExtendedText {
        description: "SOURCE".to_string(),
        value: "Deezer".to_string(),
    });
    tag.add_frame(ExtendedText {
        description: "SOURCEID".to_string(),
        value: track.id.clone(),
    });
    tag.add_frame(Picture {
        mime_type: artwork.mime_type.clone(),
        picture_type: PictureType::CoverFront,
        description: "cover".to_string(),
        data: artwork.bytes.clone(),
    });
    tag.write_to_path(path, Version::Id3v24)
        .context("Could not write ID3 tags")?;
    Ok(())
}

fn destination_path(root: &Path, album: &AlbumMetadata, organization: &str) -> Result<PathBuf> {
    let artist = safe_windows_segment(&album.artist);
    let album_name = safe_windows_segment(&album.title);
    let year_suffix = album
        .year
        .map(|year| format!(" ({year})"))
        .unwrap_or_default();
    let destination = if organization == "artist_album_year_folders" {
        root.join(artist).join(format!("{album_name}{year_suffix}"))
    } else {
        root.join(format!("{artist} - {album_name}{year_suffix}"))
    };
    if destination.to_string_lossy().chars().count() > 245 {
        bail!("The generated album path is too long for reliable Windows file handling.");
    }
    Ok(destination)
}

fn unique_track_filename(
    track: &TrackMetadata,
    disc_total: u32,
    used_names: &mut HashSet<String>,
) -> String {
    let title = safe_windows_segment(&track.title);
    let prefix = if disc_total > 1 {
        format!("{}-{:02}", track.disc_number, track.track_number)
    } else {
        format!("{:02}", track.track_number)
    };
    let mut file_name = format!("{prefix} {title}.mp3");
    let key = file_name.to_lowercase();
    if !used_names.insert(key) {
        file_name = format!("{prefix} {title} [{}].mp3", track.id);
        used_names.insert(file_name.to_lowercase());
    }
    file_name
}

fn safe_windows_segment(value: &str) -> String {
    let mut normalized = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches([' ', '.'])
        .chars()
        .take(MAX_PATH_SEGMENT_CHARS)
        .collect::<String>()
        .trim_matches([' ', '.'])
        .to_string();
    if normalized.is_empty() {
        normalized = "Unknown".to_string();
    }
    let stem = normalized
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0');
    if reserved {
        normalized.push('_');
    }
    normalized
}

fn validate_deezer_cdn_url(value: &str, artwork: bool) -> Result<()> {
    let parsed = Url::parse(value).context("Deezer returned an invalid CDN URL")?;
    if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() {
        bail!("Deezer returned an unsafe CDN URL.");
    }
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    if !(host == "dzcdn.net" || host.ends_with(".dzcdn.net")) {
        bail!("Deezer returned an unexpected CDN host.");
    }
    if artwork && !parsed.path().to_ascii_lowercase().contains("/images/") {
        bail!("Deezer returned an unexpected artwork URL.");
    }
    Ok(())
}

fn api_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(45))
        .redirects(0)
        .build()
}

fn download_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(120))
        .timeout_write(Duration::from_secs(30))
        .redirects(0)
        .build()
}

fn network_error(error: ureq::Error, operation: &str) -> anyhow::Error {
    match error {
        ureq::Error::Status(status, _) => anyhow!("{operation} failed ({status})."),
        ureq::Error::Transport(_) => anyhow!("Could not reach Deezer for {operation}."),
    }
}

fn has_api_error(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::Array(values)) => !values.is_empty(),
        Some(Value::Object(values)) => !values.is_empty(),
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(_) => true,
    }
}

fn scalar_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn string_value(value: Option<&Value>) -> Option<String> {
    scalar_string(value)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "0")
}

fn required_string(value: Option<&Value>, field: &str) -> Result<String> {
    string_value(value).with_context(|| format!("Deezer omitted the {field}"))
}

fn required_trimmed(value: Option<&Value>, field: &str) -> Result<String> {
    required_string(value, field).map(|value| value.chars().take(500).collect())
}

fn scalar_u64(value: Option<&Value>) -> Option<u64> {
    match value? {
        Value::Number(value) => value.as_u64(),
        Value::String(value) => value.parse().ok(),
        _ => None,
    }
}

fn scalar_u32(value: Option<&Value>) -> Option<u32> {
    scalar_u64(value).and_then(|value| u32::try_from(value).ok())
}

fn flexible_bool(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::Number(value)) => value.as_i64().is_some_and(|value| value != 0),
        Some(Value::String(value)) => matches!(value.as_str(), "1" | "true" | "TRUE"),
        _ => false,
    }
}

fn parse_year(value: &str) -> Option<i32> {
    let year = value.get(0..4)?.parse::<i32>().ok()?;
    (1000..=3000).contains(&year).then_some(year)
}

fn first_nonempty<const N: usize>(values: [Option<String>; N]) -> Option<String> {
    values.into_iter().flatten().find(|value| !value.is_empty())
}

fn string_list_from_objects(values: Option<&Vec<Value>>, field: &str) -> Vec<String> {
    let mut result = Vec::new();
    for value in values.into_iter().flatten() {
        if let Some(text) = string_value(value.get(field)) {
            if !result.iter().any(|existing| existing == &text) {
                result.push(text);
            }
        }
    }
    result
}

fn string_list_from_gateway_artists(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|values| string_list_from_objects(Some(values), "ART_NAME"))
        .unwrap_or_default()
}

fn contributor_tags(value: Option<&Value>) -> (Vec<String>, Vec<(String, String)>) {
    let Some(contributors) = value.and_then(Value::as_object) else {
        return (Vec::new(), Vec::new());
    };
    let mut composers = Vec::new();
    let mut involved = Vec::new();
    for (role, names) in contributors {
        let normalized_role = role.trim().to_ascii_lowercase();
        let names = names
            .as_array()
            .map(|values| {
                values
                    .iter()
                    .filter_map(|value| value.as_str())
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if normalized_role == "composer" {
            for name in &names {
                if !composers.contains(name) {
                    composers.push(name.clone());
                }
            }
        }
        if matches!(
            normalized_role.as_str(),
            "author" | "engineer" | "mixer" | "producer" | "writer"
        ) {
            for name in names {
                involved.push((normalized_role.clone(), name));
            }
        }
    }
    (composers, involved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cbc::cipher::{BlockEncryptMut, KeyIvInit};
    use std::io::Cursor;

    #[test]
    fn validates_ids_and_rejects_staging_path_characters() {
        let mut valid = DeemixAlbumDownloadRequest {
            album_id: " 240766 ".to_string(),
            request_id: "request-123_abc".to_string(),
        };
        validate_request(&mut valid).expect("valid request");
        assert_eq!(valid.album_id, "240766");
        let mut invalid = DeemixAlbumDownloadRequest {
            album_id: "240766".to_string(),
            request_id: "../escape".to_string(),
        };
        assert!(validate_request(&mut invalid).is_err());
    }

    #[test]
    fn sanitizes_windows_names_and_reserved_devices() {
        assert_eq!(safe_windows_segment("AC/DC: Live?"), "AC_DC_ Live_");
        assert_eq!(safe_windows_segment("CON"), "CON_");
        assert_eq!(safe_windows_segment("  Album...  "), "Album");
    }

    #[test]
    fn builds_flat_and_nested_album_destinations() {
        let album = fixture_album();
        assert_eq!(
            destination_path(Path::new(r"D:\Downloads"), &album, "flat_artist_album_year")
                .expect("flat"),
            PathBuf::from(r"D:\Downloads\Helmet - Meantime (1992)")
        );
        assert_eq!(
            destination_path(
                Path::new(r"D:\Downloads"),
                &album,
                "artist_album_year_folders"
            )
            .expect("nested"),
            PathBuf::from(r"D:\Downloads\Helmet\Meantime (1992)")
        );
    }

    #[test]
    fn parses_download_and_tag_metadata() {
        let public = json!({
            "id": 240766,
            "title": "Meantime",
            "artist": { "name": "Helmet" },
            "contributors": [{ "name": "Helmet", "role": "Main" }],
            "release_date": "1992-01-01",
            "label": "Interscope",
            "upc": "606949216221",
            "cover_xl": "https://cdn-images.dzcdn.net/images/cover/hash/1000x1000.jpg",
            "genres": { "data": [{ "name": "Alternative" }, { "name": "Metal" }] },
            "tracks": { "data": [{
                "id": 2445707,
                "title": "In The Meantime",
                "duration": 188,
                "explicit_lyrics": false,
                "artist": { "name": "Helmet" }
            }] }
        });
        let gateway_album = json!({
            "NUMBER_DISK": 1,
            "COPYRIGHT": "1992 Interscope",
            "ORIGINAL_RELEASE_DATE": "1992-06-23"
        });
        let gateway_tracks = json!({ "data": [{
            "SNG_ID": 2445707,
            "SNG_TITLE": "In The Meantime",
            "TRACK_NUMBER": 1,
            "DISK_NUMBER": 1,
            "DURATION": 188,
            "ISRC": "USIR19200541",
            "TRACK_TOKEN": "token",
            "FILESIZE_MP3_320": 123456,
            "ARTISTS": [{ "ART_NAME": "Helmet" }],
            "SNG_CONTRIBUTORS": {
                "composer": ["Page Hamilton"],
                "producer": ["Steve Albini"]
            }
        }] });
        let album = parse_album_metadata(
            "240766",
            &public,
            &gateway_album,
            &gateway_tracks,
            DownloadQuality::Mp3_320,
        )
        .expect("album metadata");
        assert_eq!(album.year, Some(1992));
        assert_eq!(album.release_date.as_deref(), Some("1992-06-23"));
        assert_eq!(album.label.as_deref(), Some("Interscope"));
        assert_eq!(album.genres, vec!["Alternative", "Metal"]);
        assert_eq!(album.tracks[0].isrc.as_deref(), Some("USIR19200541"));
        assert_eq!(album.tracks[0].composers, vec!["Page Hamilton"]);
        assert_eq!(
            album.tracks[0].involved_people,
            vec![("producer".to_string(), "Steve Albini".to_string())]
        );
    }

    #[test]
    fn decrypts_every_third_deezer_stream_chunk() {
        let track_id = "2445707";
        let key = blowfish_key(track_id);
        let iv = [0u8, 1, 2, 3, 4, 5, 6, 7];
        let plaintext = (0..(STREAM_CHUNK_SIZE * 4 + 73))
            .map(|index| ((index % 250) + 1) as u8)
            .collect::<Vec<_>>();
        let mut encrypted = plaintext.clone();
        for chunk_index in [0usize, 3usize] {
            let start = chunk_index * STREAM_CHUNK_SIZE;
            let end = start + STREAM_CHUNK_SIZE;
            cbc::Encryptor::<Blowfish>::new_from_slices(&key, &iv)
                .expect("cipher")
                .encrypt_padded_mut::<NoPadding>(&mut encrypted[start..end], STREAM_CHUNK_SIZE)
                .expect("encrypt");
        }
        let mut reader = Cursor::new(encrypted);
        let mut decrypted = Vec::new();
        let written = decrypt_stream(&mut reader, &mut decrypted, track_id).expect("decrypt");
        assert_eq!(written as usize, plaintext.len());
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn writes_complete_mp3_tags_and_embedded_cover() {
        let mut album = fixture_album();
        let track = TrackMetadata {
            id: "2445707".to_string(),
            title: "In The Meantime".to_string(),
            artists: vec!["Helmet".to_string()],
            track_number: 1,
            disc_number: 1,
            duration_seconds: 188,
            isrc: Some("USIR19200541".to_string()),
            explicit: false,
            copyright: Some("1992 Interscope".to_string()),
            composers: vec!["Page Hamilton".to_string()],
            involved_people: vec![("producer".to_string(), "Steve Albini".to_string())],
            track_token: Zeroizing::new("token".to_string()),
        };
        album.tracks.push(track.clone());
        let artwork = Artwork {
            bytes: vec![0xFF, 0xD8, 0xFF, 0xD9],
            mime_type: "image/jpeg".to_string(),
            extension: "jpg",
        };
        let path = std::env::temp_dir().join(format!(
            "music-library-deemix-tag-test-{}-{}.mp3",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        fs::write(&path, [0xFF, 0xFB, 0x90, 0x64, 0, 0, 0, 0]).expect("seed mp3");
        write_mp3_tags(&path, &album, &track, &artwork).expect("write tags");

        let tag = Tag::read_from_path(&path).expect("read tags");
        assert_eq!(tag.title(), Some("In The Meantime"));
        assert_eq!(tag.artist(), Some("Helmet"));
        assert_eq!(tag.album(), Some("Meantime"));
        assert_eq!(tag.album_artist(), Some("Helmet"));
        assert_eq!(tag.track(), Some(1));
        assert_eq!(tag.total_tracks(), Some(1));
        assert_eq!(tag.disc(), Some(1));
        assert_eq!(tag.year(), Some(1992));
        assert_eq!(
            tag.get("TPUB").and_then(|frame| frame.content().text()),
            Some("Interscope")
        );
        assert_eq!(
            tag.get("TSRC").and_then(|frame| frame.content().text()),
            Some("USIR19200541")
        );
        assert_eq!(tag.pictures().count(), 1);
        fs::remove_file(&path).expect("remove tag test file");
    }

    fn fixture_album() -> AlbumMetadata {
        AlbumMetadata {
            id: "240766".to_string(),
            title: "Meantime".to_string(),
            artist: "Helmet".to_string(),
            album_artists: vec!["Helmet".to_string()],
            release_date: Some("1992-06-23".to_string()),
            year: Some(1992),
            label: Some("Interscope".to_string()),
            genres: vec!["Alternative".to_string()],
            upc: Some("606949216221".to_string()),
            copyright: Some("1992 Interscope".to_string()),
            cover_url: "https://cdn-images.dzcdn.net/images/cover/hash/1000x1000.jpg".to_string(),
            disc_total: 1,
            tracks: Vec::new(),
        }
    }
}
