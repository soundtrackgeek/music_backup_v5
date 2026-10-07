//! Typed events the backend pushes to the UI.
//!
//! Each event keeps its existing wire name (so nothing on the wire changes) and is
//! declared once, here, with its payload type. tauri-specta exports the payloads to
//! `src/bindings.ts` and generates a typed `events.<name>.listen(...)`, while Rust
//! emits through `Event::emit`, so the payload type of an emit is checked at compile
//! time. One macro generates both the event structs and the registry that
//! `bindings::mount_events` needs, so an event cannot be declared without being
//! registered (emitting an unregistered event would panic).

use crate::{
    artist_completion::LibraryCompletionArtistVerificationStatus,
    deemix_download::DeemixAlbumDownloadProgress,
    jobs::Job,
    library_completion::LibraryCompletionVerificationStatus,
    models::{
        CoverImportProgress, ImportProgress, MusicBrainzArtistInfoImportProgress,
        MusicBrainzOriginCountryImportProgress, MusicBrainzOverlaySyncResult, MusicToolProgress,
    },
    music_doctor::MusicDoctorSyncResult,
    published_charts::PublishedChartsImportProgress,
    soulseek::{
        ConnectionSnapshot, LocalSharesSnapshot, SearchEvent, TransferQueueSnapshot,
        UploadQueueSnapshot,
    },
    updater::{InstallProgress, UpdateSnapshot},
    usenet::UsenetTransferQueue,
};

macro_rules! wire_events {
    ($($name:ident($payload:ty) = $wire:literal;)*) => {
        $(
            /// Serializes exactly as its payload.
            #[derive(Clone, serde::Serialize, specta::Type)]
            pub struct $name(pub $payload);

            impl tauri_specta::Event for $name {
                const NAME: &'static str = $wire;
            }
        )*

        /// The registry handed to tauri-specta (generated from the same list).
        pub fn collect() -> tauri_specta::Events {
            tauri_specta::collect_events![$($name),*]
        }

        /// Every wire name, for the uniqueness test.
        #[cfg(test)]
        const WIRE_NAMES: &[&str] = &[$($wire),*];
    };
}

wire_events! {
    AppUpdateChecked(UpdateSnapshot) = "app-update-checked";
    AppUpdateInstallProgress(InstallProgress) = "app-update-install-progress";
    ActivityJobsChanged(Vec<Job>) = "activity-jobs-changed";
    PublishedChartsImportProgressEvent(PublishedChartsImportProgress) = "published-charts-import-progress";
    ImportProgressEvent(ImportProgress) = "import-progress";
    DeemixDownloadProgress(DeemixAlbumDownloadProgress) = "deemix-download-progress";
    UsenetTransfersChanged(UsenetTransferQueue) = "music-library://usenet-transfers";
    CoverImportProgressEvent(CoverImportProgress) = "cover-import-progress";
    MusicBrainzOriginCountryImportProgressEvent(MusicBrainzOriginCountryImportProgress) = "musicbrainz-origin-country-import-progress";
    MusicBrainzArtistInfoImportProgressEvent(MusicBrainzArtistInfoImportProgress) = "musicbrainz-artist-info-import-progress";
    MusicToolProgressEvent(MusicToolProgress) = "music-tool-progress";
    CatalogRevisionChanged(String) = "catalog-revision-changed";
    MusicDoctorSyncCompleted(MusicDoctorSyncResult) = "music-doctor-sync-completed";
    MusicBrainzOverlaySyncCompleted(MusicBrainzOverlaySyncResult) = "musicbrainz-overlay-sync-completed";
    LibraryCompletionVerificationProgress(LibraryCompletionVerificationStatus) = "library-completion-verification-progress";
    ArtistCompletionVerificationProgress(LibraryCompletionArtistVerificationStatus) = "artist-completion-verification-progress";
    SoulseekConnectionChanged(ConnectionSnapshot) = "music-library://soulseek-connection";
    SoulseekTransfersChanged(TransferQueueSnapshot) = "music-library://soulseek-transfers";
    SoulseekLocalSharesChanged(LocalSharesSnapshot) = "music-library://soulseek-local-shares";
    SoulseekUploadsChanged(UploadQueueSnapshot) = "music-library://soulseek-uploads";
    SoulseekSearchProgress(SearchEvent) = "music-library://soulseek-search";
}

#[cfg(test)]
mod tests {
    use super::WIRE_NAMES;

    #[test]
    fn wire_names_are_unique_and_non_empty() {
        let mut seen = std::collections::HashSet::new();
        for name in WIRE_NAMES {
            assert!(!name.is_empty());
            assert!(seen.insert(*name), "duplicate event name {name}");
        }
        assert_eq!(WIRE_NAMES.len(), 21);
    }
}
