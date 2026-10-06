import { ActivityCenter } from "../components/ActivityCenter";
import {
  ChevronRight,
  Sparkles,
  ChevronLeft,
  Library,
  ListMusic,
  Download,
  RotateCcw,
  X,
} from "lucide-react";
import { LunaPanel } from "../components/LunaPanel";
import { MusicResearchPanel } from "../components/MusicResearchPanel";
import { navigation } from "./config";
import type { AppModel } from "./useAppController";
import { WorkspaceRouter } from "./WorkspaceRouter";
import { WorkspaceDetails } from "./WorkspaceDetails";
import { WorkspaceErrorBoundary } from "../components/WorkspaceErrorBoundary";
export function AppShell({ model }: { model: AppModel }) {
  const {
    appShellClassName,
    isLeftSidebarHidden,
    setLeftSidebarMode,
    isLunaOpen,
    isDetailsDrawerLayout,
    closeDetailsDrawer,
    setIsLunaOpen,
    hasUsefulDetailContent,
    detailToggleRef,
    isRightSidebarHidden,
    rightSidebarToggleLabel,
    toggleRightSidebar,
    activeSection,
    request,
    total,
    chartRows,
    status,
    musicResearchContext,
    openLunaMode,
    openLunaHistory,
    isDetailsDrawerOpen,
    closeDetailDrawerAndRestoreFocus,
    leftIconOnlyToggleLabel,
    leftSidebarMode,
    setActiveSection,
    appUpdateBannerVisible,
    appUpdateStatus,
    appUpdateBannerTitle,
    appUpdateBannerMessage,
    appUpdateProgress,
    appUpdateCanInstall,
    runAppUpdateInstall,
    appUpdateIsBusy,
    checkAppUpdate,
    setIsAppUpdateBannerDismissed,
    detailDrawerRef,
    handleDetailDrawerKeyDown,
  } = model;
  return (
    <main className={appShellClassName}>
      <ActivityCenter />
      {isLeftSidebarHidden ? (
        <button
          className="icon-button edge-toggle left-sidebar-toggle"
          type="button"
          aria-label="Show navigation"
          title="Show navigation"
          onClick={() => setLeftSidebarMode("expanded")}
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
      <button
        className={`icon-button music-research-trigger${isLunaOpen ? " active" : ""}`}
        type="button"
        aria-label="Open Luna"
        aria-pressed={isLunaOpen}
        title="Open Luna"
        onClick={() => {
          if (!isLunaOpen && isDetailsDrawerLayout) {
            closeDetailsDrawer();
          }
          setIsLunaOpen((previous) => !previous);
        }}
      >
        <Sparkles size={18} />
      </button>
      {hasUsefulDetailContent ? (
        <button
          ref={detailToggleRef}
          className="icon-button edge-toggle right-sidebar-toggle"
          type="button"
          aria-controls="workspace-details"
          aria-expanded={!isRightSidebarHidden}
          aria-label={rightSidebarToggleLabel}
          title={rightSidebarToggleLabel}
          onClick={toggleRightSidebar}
        >
          {isRightSidebarHidden ? (
            <ChevronLeft size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
        </button>
      ) : null}
      <WorkspaceErrorBoundary
        name="Luna"
        fallbackClassName="luna-panel"
        showFallback={isLunaOpen}
        onDismiss={() => setIsLunaOpen(false)}
      >
        <LunaPanel
          isOpen={isLunaOpen}
          activeSection={activeSection}
          currentView={request.view}
          currentResultCount={total}
          chartResultCount={chartRows}
          albumCount={status?.albumCount ?? 0}
          trackCount={status?.trackCount ?? 0}
          researchContext={musicResearchContext}
          researchPanel={(snapshotToOpen) => (
            <MusicResearchPanel
              isOpen
              embedded
              showSnapshotHistory={false}
              snapshotToOpen={snapshotToOpen}
              context={musicResearchContext}
              onClose={() => setIsLunaOpen(false)}
            />
          )}
          onClose={() => setIsLunaOpen(false)}
          onOpenMode={openLunaMode}
          onOpenHistory={openLunaHistory}
        />
      </WorkspaceErrorBoundary>
      {isDetailsDrawerLayout && isDetailsDrawerOpen ? (
        <button
          className="detail-drawer-backdrop"
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={closeDetailDrawerAndRestoreFocus}
        />
      ) : null}
      <aside
        className="sidebar"
        aria-label="Main navigation"
        aria-hidden={isLeftSidebarHidden}
      >
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <Library size={20} />
            </div>
            <div>
              <strong>Music Library</strong>
              <span>Local music catalog</span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button
              className="icon-button sidebar-action"
              type="button"
              aria-label={leftIconOnlyToggleLabel}
              title={leftIconOnlyToggleLabel}
              onClick={() =>
                setLeftSidebarMode(
                  leftSidebarMode === "iconOnly" ? "expanded" : "iconOnly",
                )
              }
            >
              <ListMusic size={16} />
            </button>
            <button
              className="icon-button sidebar-action"
              type="button"
              aria-label="Collapse navigation"
              title="Collapse navigation"
              onClick={() => setLeftSidebarMode("hidden")}
            >
              <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === activeSection;
            return (
              <button
                className={isActive ? "active" : ""}
                key={item.label}
                type="button"
                disabled={!item.enabled}
                onClick={() => item.enabled && setActiveSection(item.label)}
                aria-keyshortcuts={item.shortcut}
                title={item.label}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="workspace-column">
        {appUpdateBannerVisible ? (
          <section
            className={`app-update-banner app-update-banner-${appUpdateStatus}`}
            aria-live="polite"
          >
            <div className="app-update-banner-icon" aria-hidden="true">
              <Download size={18} />
            </div>
            <div className="app-update-banner-copy">
              <strong>{appUpdateBannerTitle}</strong>
              <span>{appUpdateBannerMessage}</span>
              {appUpdateStatus === "downloading" &&
              appUpdateProgress?.percent != null ? (
                <div className="app-update-progress" aria-hidden="true">
                  <div style={{ width: `${appUpdateProgress.percent}%` }} />
                </div>
              ) : null}
            </div>
            <div className="app-update-banner-actions">
              {appUpdateCanInstall ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void runAppUpdateInstall()}
                >
                  <Download size={16} />
                  <span>Update now</span>
                </button>
              ) : null}
              {appUpdateStatus === "error" ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={appUpdateIsBusy}
                  onClick={() => void checkAppUpdate("manual")}
                >
                  <RotateCcw size={16} />
                  <span>Check now</span>
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                aria-label="Dismiss update message"
                onClick={() => setIsAppUpdateBannerDismissed(true)}
              >
                <X size={16} />
              </button>
            </div>
          </section>
        ) : null}

        {
          <WorkspaceErrorBoundary key={activeSection} name={activeSection}>
            <WorkspaceRouter model={model} />
          </WorkspaceErrorBoundary>
        }
      </div>

      <section
        ref={detailDrawerRef}
        id="workspace-details"
        className="detail-column"
        role={
          isDetailsDrawerLayout && isDetailsDrawerOpen ? "dialog" : undefined
        }
        aria-modal={
          isDetailsDrawerLayout && isDetailsDrawerOpen ? true : undefined
        }
        aria-label={
          isDetailsDrawerLayout && isDetailsDrawerOpen
            ? "Workspace details"
            : undefined
        }
        aria-hidden={isRightSidebarHidden}
        tabIndex={isDetailsDrawerLayout ? -1 : undefined}
        onKeyDown={handleDetailDrawerKeyDown}
      >
        {
          <WorkspaceErrorBoundary
            key={activeSection}
            name={`${activeSection} details`}
          >
            <WorkspaceDetails model={model} />
          </WorkspaceErrorBoundary>
        }
      </section>
    </main>
  );
}
