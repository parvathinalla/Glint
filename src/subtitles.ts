/**
 * Fullscreen-camera subtitle preference. Subtitles default on; the choice
 * persists per browser like any other display setting.
 */
const KEY = "glint-subtitles";
export function loadSubtitlesEnabled(): boolean {
  try {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}
export function saveSubtitlesEnabled(enabled: boolean) {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(KEY, enabled ? "1" : "0");
  } catch {
    // Private mode: the toggle still works for this visit.
  }
}
