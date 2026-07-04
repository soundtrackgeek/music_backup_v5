import { settingsStorageKey } from "../backend";

try {
  const stored = window.localStorage.getItem(settingsStorageKey);
  if (stored) {
    const settings = JSON.parse(stored) as { darkMode?: unknown };
    if (typeof settings.darkMode === "boolean") {
      document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
    }
  }
} catch {
  // The persisted theme is a best-effort startup hint.
}
