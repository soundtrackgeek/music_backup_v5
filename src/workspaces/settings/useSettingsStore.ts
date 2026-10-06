import {
  type AppSettings,
  type DatabaseBackup,
  type DatabaseRestoreSummary,
  type PerformanceProbeResponse,
  type MusicBrainzCacheStatus,
  type MusicBrainzOriginCountryStatus,
  type MusicBrainzOriginCountryPreview,
  type MusicBrainzOriginCountryImportSummary,
  type MusicBrainzOriginCountryImportProgress,
  type MusicBrainzArtistInfoStatus,
  type MusicBrainzArtistInfoPreview,
  type MusicBrainzArtistInfoImportSummary,
  type MusicBrainzArtistInfoImportProgress,
  type MusicBrainzOverlaySyncResult,
  type MusicBrainzOverlaySyncLogEntry,
} from "../../types";
import {
  type OriginReportFilter,
  type ArtistInfoReportFilter,
  type AppUpdateStatus,
  createDefaultSettings,
} from "../../app/defaults";
import {
  type AppUpdateInfo,
  type AppUpdateInstallProgress,
  type AppUpdateCheckResult,
} from "../../app/updater";
import {
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
} from "../../backend";
import {
  overlayAutoSyncMinutesValue,
  updateAutoCheckMinutesValue,
} from "./settingsDisplay";
import { useMemo, useRef } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type SettingsState = {
  settings: AppSettings;
  persistedSettings: AppSettings;
  databaseBackups: DatabaseBackup[];
  backupError: string | null;
  isRestoringBackup: boolean;
  restoreSummary: DatabaseRestoreSummary | null;
  performanceProbe: PerformanceProbeResponse | null;
  performanceProbeError: string | null;
  isPerformanceProbeRunning: boolean;
  musicBrainzStatus: MusicBrainzCacheStatus | null;
  musicBrainzStatusError: string | null;
  isMusicBrainzChecking: boolean;
  musicBrainzOriginStatus: MusicBrainzOriginCountryStatus | null;
  musicBrainzOriginPreview: MusicBrainzOriginCountryPreview | null;
  musicBrainzOriginImportSummary: MusicBrainzOriginCountryImportSummary | null;
  musicBrainzOriginProgress: MusicBrainzOriginCountryImportProgress | null;
  musicBrainzOriginLog: MusicBrainzOriginCountryImportProgress[];
  musicBrainzOriginError: string | null;
  musicBrainzOriginReportFilter: OriginReportFilter;
  musicBrainzOriginReportSearch: string;
  isMusicBrainzOriginPreviewing: boolean;
  isMusicBrainzOriginImporting: boolean;
  musicBrainzArtistInfoStatus: MusicBrainzArtistInfoStatus | null;
  musicBrainzArtistInfoPreview: MusicBrainzArtistInfoPreview | null;
  musicBrainzArtistInfoImportSummary: MusicBrainzArtistInfoImportSummary | null;
  musicBrainzArtistInfoProgress: MusicBrainzArtistInfoImportProgress | null;
  musicBrainzArtistInfoLog: MusicBrainzArtistInfoImportProgress[];
  musicBrainzArtistInfoError: string | null;
  musicBrainzArtistInfoReportFilter: ArtistInfoReportFilter;
  musicBrainzArtistInfoReportSearch: string;
  isMusicBrainzArtistInfoPreviewing: boolean;
  isMusicBrainzArtistInfoImporting: boolean;
  musicBrainzCachePathDraft: string;
  musicBrainzOverlaySyncPathDraft: string;
  musicBrainzOverlayAutoSyncDraft: string;
  appUpdateAutoCheckDraft: string;
  appUpdateStatus: AppUpdateStatus;
  appUpdateInfo: AppUpdateInfo | null;
  appUpdateError: string | null;
  appUpdateLastCheckedAt: string | null;
  appUpdateProgress: AppUpdateInstallProgress | null;
  isAppUpdateBannerDismissed: boolean;
  musicBrainzOverlaySyncResult: MusicBrainzOverlaySyncResult | null;
  musicBrainzOverlaySyncLog: MusicBrainzOverlaySyncLogEntry[];
  musicBrainzOverlaySyncError: string | null;
  isMusicBrainzOverlaySyncing: boolean;
  settingsError: string | null;
  isSavingSettings: boolean;
};

function createInitialState(): SettingsState {
  const settings: AppSettings = (() => createDefaultSettings())();
  const persistedSettings: AppSettings = settings;
  const databaseBackups: DatabaseBackup[] = [];
  const backupError: string | null = null;
  const isRestoringBackup: boolean = false;
  const restoreSummary: DatabaseRestoreSummary | null = null;
  const performanceProbe: PerformanceProbeResponse | null = null;
  const performanceProbeError: string | null = null;
  const isPerformanceProbeRunning: boolean = false;
  const musicBrainzStatus: MusicBrainzCacheStatus | null = null;
  const musicBrainzStatusError: string | null = null;
  const isMusicBrainzChecking: boolean = false;
  const musicBrainzOriginStatus: MusicBrainzOriginCountryStatus | null = null;
  const musicBrainzOriginPreview: MusicBrainzOriginCountryPreview | null = null;
  const musicBrainzOriginImportSummary: MusicBrainzOriginCountryImportSummary | null =
    null;
  const musicBrainzOriginProgress: MusicBrainzOriginCountryImportProgress | null =
    null;
  const musicBrainzOriginLog: MusicBrainzOriginCountryImportProgress[] = [];
  const musicBrainzOriginError: string | null = null;
  const musicBrainzOriginReportFilter: OriginReportFilter = "needsAttention";
  const musicBrainzOriginReportSearch: string = "";
  const isMusicBrainzOriginPreviewing: boolean = false;
  const isMusicBrainzOriginImporting: boolean = false;
  const musicBrainzArtistInfoStatus: MusicBrainzArtistInfoStatus | null = null;
  const musicBrainzArtistInfoPreview: MusicBrainzArtistInfoPreview | null =
    null;
  const musicBrainzArtistInfoImportSummary: MusicBrainzArtistInfoImportSummary | null =
    null;
  const musicBrainzArtistInfoProgress: MusicBrainzArtistInfoImportProgress | null =
    null;
  const musicBrainzArtistInfoLog: MusicBrainzArtistInfoImportProgress[] = [];
  const musicBrainzArtistInfoError: string | null = null;
  const musicBrainzArtistInfoReportFilter: ArtistInfoReportFilter =
    "needsAttention";
  const musicBrainzArtistInfoReportSearch: string = "";
  const isMusicBrainzArtistInfoPreviewing: boolean = false;
  const isMusicBrainzArtistInfoImporting: boolean = false;
  const musicBrainzCachePathDraft: string =
    settings.musicBrainzCachePath || defaultMusicBrainzCachePath;
  const musicBrainzOverlaySyncPathDraft: string =
    settings.musicBrainzOverlaySyncPath || defaultMusicBrainzOverlaySyncPath;
  const musicBrainzOverlayAutoSyncDraft: string = String(
    overlayAutoSyncMinutesValue(settings.musicBrainzOverlayAutoSyncMinutes),
  );
  const appUpdateAutoCheckDraft: string = String(
    updateAutoCheckMinutesValue(settings.updateAutoCheckMinutes),
  );
  const appUpdateStatus: AppUpdateStatus = "idle";
  const appUpdateInfo: AppUpdateInfo | null = null;
  const appUpdateError: string | null = null;
  const appUpdateLastCheckedAt: string | null = null;
  const appUpdateProgress: AppUpdateInstallProgress | null = null;
  const isAppUpdateBannerDismissed: boolean = false;
  const musicBrainzOverlaySyncResult: MusicBrainzOverlaySyncResult | null =
    null;
  const musicBrainzOverlaySyncLog: MusicBrainzOverlaySyncLogEntry[] = [];
  const musicBrainzOverlaySyncError: string | null = null;
  const isMusicBrainzOverlaySyncing: boolean = false;
  const settingsError: string | null = null;
  const isSavingSettings: boolean = false;
  return {
    settings,
    persistedSettings,
    databaseBackups,
    backupError,
    isRestoringBackup,
    restoreSummary,
    performanceProbe,
    performanceProbeError,
    isPerformanceProbeRunning,
    musicBrainzStatus,
    musicBrainzStatusError,
    isMusicBrainzChecking,
    musicBrainzOriginStatus,
    musicBrainzOriginPreview,
    musicBrainzOriginImportSummary,
    musicBrainzOriginProgress,
    musicBrainzOriginLog,
    musicBrainzOriginError,
    musicBrainzOriginReportFilter,
    musicBrainzOriginReportSearch,
    isMusicBrainzOriginPreviewing,
    isMusicBrainzOriginImporting,
    musicBrainzArtistInfoStatus,
    musicBrainzArtistInfoPreview,
    musicBrainzArtistInfoImportSummary,
    musicBrainzArtistInfoProgress,
    musicBrainzArtistInfoLog,
    musicBrainzArtistInfoError,
    musicBrainzArtistInfoReportFilter,
    musicBrainzArtistInfoReportSearch,
    isMusicBrainzArtistInfoPreviewing,
    isMusicBrainzArtistInfoImporting,
    musicBrainzCachePathDraft,
    musicBrainzOverlaySyncPathDraft,
    musicBrainzOverlayAutoSyncDraft,
    appUpdateAutoCheckDraft,
    appUpdateStatus,
    appUpdateInfo,
    appUpdateError,
    appUpdateLastCheckedAt,
    appUpdateProgress,
    isAppUpdateBannerDismissed,
    musicBrainzOverlaySyncResult,
    musicBrainzOverlaySyncLog,
    musicBrainzOverlaySyncError,
    isMusicBrainzOverlaySyncing,
    settingsError,
    isSavingSettings,
  };
}

function useSettingsStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<SettingsState>,
    undefined,
    createInitialState,
  );
  const {
    settings,
    persistedSettings,
    databaseBackups,
    backupError,
    isRestoringBackup,
    restoreSummary,
    performanceProbe,
    performanceProbeError,
    isPerformanceProbeRunning,
    musicBrainzStatus,
    musicBrainzStatusError,
    isMusicBrainzChecking,
    musicBrainzOriginStatus,
    musicBrainzOriginPreview,
    musicBrainzOriginImportSummary,
    musicBrainzOriginProgress,
    musicBrainzOriginLog,
    musicBrainzOriginError,
    musicBrainzOriginReportFilter,
    musicBrainzOriginReportSearch,
    isMusicBrainzOriginPreviewing,
    isMusicBrainzOriginImporting,
    musicBrainzArtistInfoStatus,
    musicBrainzArtistInfoPreview,
    musicBrainzArtistInfoImportSummary,
    musicBrainzArtistInfoProgress,
    musicBrainzArtistInfoLog,
    musicBrainzArtistInfoError,
    musicBrainzArtistInfoReportFilter,
    musicBrainzArtistInfoReportSearch,
    isMusicBrainzArtistInfoPreviewing,
    isMusicBrainzArtistInfoImporting,
    musicBrainzCachePathDraft,
    musicBrainzOverlaySyncPathDraft,
    musicBrainzOverlayAutoSyncDraft,
    appUpdateAutoCheckDraft,
    appUpdateStatus,
    appUpdateInfo,
    appUpdateError,
    appUpdateLastCheckedAt,
    appUpdateProgress,
    isAppUpdateBannerDismissed,
    musicBrainzOverlaySyncResult,
    musicBrainzOverlaySyncLog,
    musicBrainzOverlaySyncError,
    isMusicBrainzOverlaySyncing,
    settingsError,
    isSavingSettings,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<SettingsState>(dispatch, [
        "settings",
        "persistedSettings",
        "databaseBackups",
        "backupError",
        "isRestoringBackup",
        "restoreSummary",
        "performanceProbe",
        "performanceProbeError",
        "isPerformanceProbeRunning",
        "musicBrainzStatus",
        "musicBrainzStatusError",
        "isMusicBrainzChecking",
        "musicBrainzOriginStatus",
        "musicBrainzOriginPreview",
        "musicBrainzOriginImportSummary",
        "musicBrainzOriginProgress",
        "musicBrainzOriginLog",
        "musicBrainzOriginError",
        "musicBrainzOriginReportFilter",
        "musicBrainzOriginReportSearch",
        "isMusicBrainzOriginPreviewing",
        "isMusicBrainzOriginImporting",
        "musicBrainzArtistInfoStatus",
        "musicBrainzArtistInfoPreview",
        "musicBrainzArtistInfoImportSummary",
        "musicBrainzArtistInfoProgress",
        "musicBrainzArtistInfoLog",
        "musicBrainzArtistInfoError",
        "musicBrainzArtistInfoReportFilter",
        "musicBrainzArtistInfoReportSearch",
        "isMusicBrainzArtistInfoPreviewing",
        "isMusicBrainzArtistInfoImporting",
        "musicBrainzCachePathDraft",
        "musicBrainzOverlaySyncPathDraft",
        "musicBrainzOverlayAutoSyncDraft",
        "appUpdateAutoCheckDraft",
        "appUpdateStatus",
        "appUpdateInfo",
        "appUpdateError",
        "appUpdateLastCheckedAt",
        "appUpdateProgress",
        "isAppUpdateBannerDismissed",
        "musicBrainzOverlaySyncResult",
        "musicBrainzOverlaySyncLog",
        "musicBrainzOverlaySyncError",
        "isMusicBrainzOverlaySyncing",
        "settingsError",
        "isSavingSettings",
      ]),
    [dispatch],
  );
  const {
    setSettings,
    setPersistedSettings,
    setDatabaseBackups,
    setBackupError,
    setIsRestoringBackup,
    setRestoreSummary,
    setPerformanceProbe,
    setPerformanceProbeError,
    setIsPerformanceProbeRunning,
    setMusicBrainzStatus,
    setMusicBrainzStatusError,
    setIsMusicBrainzChecking,
    setMusicBrainzOriginStatus,
    setMusicBrainzOriginPreview,
    setMusicBrainzOriginImportSummary,
    setMusicBrainzOriginProgress,
    setMusicBrainzOriginLog,
    setMusicBrainzOriginError,
    setMusicBrainzOriginReportFilter,
    setMusicBrainzOriginReportSearch,
    setIsMusicBrainzOriginPreviewing,
    setIsMusicBrainzOriginImporting,
    setMusicBrainzArtistInfoStatus,
    setMusicBrainzArtistInfoPreview,
    setMusicBrainzArtistInfoImportSummary,
    setMusicBrainzArtistInfoProgress,
    setMusicBrainzArtistInfoLog,
    setMusicBrainzArtistInfoError,
    setMusicBrainzArtistInfoReportFilter,
    setMusicBrainzArtistInfoReportSearch,
    setIsMusicBrainzArtistInfoPreviewing,
    setIsMusicBrainzArtistInfoImporting,
    setMusicBrainzCachePathDraft,
    setMusicBrainzOverlaySyncPathDraft,
    setMusicBrainzOverlayAutoSyncDraft,
    setAppUpdateAutoCheckDraft,
    setAppUpdateStatus,
    setAppUpdateInfo,
    setAppUpdateError,
    setAppUpdateLastCheckedAt,
    setAppUpdateProgress,
    setIsAppUpdateBannerDismissed,
    setMusicBrainzOverlaySyncResult,
    setMusicBrainzOverlaySyncLog,
    setMusicBrainzOverlaySyncError,
    setIsMusicBrainzOverlaySyncing,
    setSettingsError,
    setIsSavingSettings,
  } = setters;
  const settingsRef = useRef(settings);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settingsSaveSequenceRef = useRef(0);
  const pendingSettingsSaveCountRef = useRef(0);
  const lastAutoSavedImportPathsRef = useRef<string | null>(null);
  const appUpdateRef = useRef<AppUpdateCheckResult["update"] | null>(null);
  const isAppUpdateCheckingRef = useRef(false);
  const isAppUpdateInstallingRef = useRef(false);
  const hasAppliedLayoutDefaults = useRef(false);
  const isMusicBrainzOverlaySyncingRef = useRef(false);
  return {
    settings,
    setSettings,
    persistedSettings,
    setPersistedSettings,
    settingsRef,
    settingsSaveQueueRef,
    settingsSaveSequenceRef,
    pendingSettingsSaveCountRef,
    lastAutoSavedImportPathsRef,
    appUpdateRef,
    isAppUpdateCheckingRef,
    isAppUpdateInstallingRef,
    databaseBackups,
    setDatabaseBackups,
    backupError,
    setBackupError,
    isRestoringBackup,
    setIsRestoringBackup,
    restoreSummary,
    setRestoreSummary,
    performanceProbe,
    setPerformanceProbe,
    performanceProbeError,
    setPerformanceProbeError,
    isPerformanceProbeRunning,
    setIsPerformanceProbeRunning,
    musicBrainzStatus,
    setMusicBrainzStatus,
    musicBrainzStatusError,
    setMusicBrainzStatusError,
    isMusicBrainzChecking,
    setIsMusicBrainzChecking,
    musicBrainzOriginStatus,
    setMusicBrainzOriginStatus,
    musicBrainzOriginPreview,
    setMusicBrainzOriginPreview,
    musicBrainzOriginImportSummary,
    setMusicBrainzOriginImportSummary,
    musicBrainzOriginProgress,
    setMusicBrainzOriginProgress,
    musicBrainzOriginLog,
    setMusicBrainzOriginLog,
    musicBrainzOriginError,
    setMusicBrainzOriginError,
    musicBrainzOriginReportFilter,
    setMusicBrainzOriginReportFilter,
    musicBrainzOriginReportSearch,
    setMusicBrainzOriginReportSearch,
    isMusicBrainzOriginPreviewing,
    setIsMusicBrainzOriginPreviewing,
    isMusicBrainzOriginImporting,
    setIsMusicBrainzOriginImporting,
    musicBrainzArtistInfoStatus,
    setMusicBrainzArtistInfoStatus,
    musicBrainzArtistInfoPreview,
    setMusicBrainzArtistInfoPreview,
    musicBrainzArtistInfoImportSummary,
    setMusicBrainzArtistInfoImportSummary,
    musicBrainzArtistInfoProgress,
    setMusicBrainzArtistInfoProgress,
    musicBrainzArtistInfoLog,
    setMusicBrainzArtistInfoLog,
    musicBrainzArtistInfoError,
    setMusicBrainzArtistInfoError,
    musicBrainzArtistInfoReportFilter,
    setMusicBrainzArtistInfoReportFilter,
    musicBrainzArtistInfoReportSearch,
    setMusicBrainzArtistInfoReportSearch,
    isMusicBrainzArtistInfoPreviewing,
    setIsMusicBrainzArtistInfoPreviewing,
    isMusicBrainzArtistInfoImporting,
    setIsMusicBrainzArtistInfoImporting,
    musicBrainzCachePathDraft,
    setMusicBrainzCachePathDraft,
    musicBrainzOverlaySyncPathDraft,
    setMusicBrainzOverlaySyncPathDraft,
    musicBrainzOverlayAutoSyncDraft,
    setMusicBrainzOverlayAutoSyncDraft,
    appUpdateAutoCheckDraft,
    setAppUpdateAutoCheckDraft,
    appUpdateStatus,
    setAppUpdateStatus,
    appUpdateInfo,
    setAppUpdateInfo,
    appUpdateError,
    setAppUpdateError,
    appUpdateLastCheckedAt,
    setAppUpdateLastCheckedAt,
    appUpdateProgress,
    setAppUpdateProgress,
    isAppUpdateBannerDismissed,
    setIsAppUpdateBannerDismissed,
    musicBrainzOverlaySyncResult,
    setMusicBrainzOverlaySyncResult,
    musicBrainzOverlaySyncLog,
    setMusicBrainzOverlaySyncLog,
    musicBrainzOverlaySyncError,
    setMusicBrainzOverlaySyncError,
    isMusicBrainzOverlaySyncing,
    setIsMusicBrainzOverlaySyncing,
    settingsError,
    setSettingsError,
    isSavingSettings,
    setIsSavingSettings,
    hasAppliedLayoutDefaults,
    isMusicBrainzOverlaySyncingRef,
  };
}

export const { Provider: SettingsStoreProvider, useStore: useSettingsStore } =
  createWorkspaceContext(useSettingsStoreValue, "settings");
