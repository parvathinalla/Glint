export type Appearance = "system" | "light" | "dark";
export function loadAppearance(): Appearance {
  try {
    const value = localStorage.getItem("glint-appearance");
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}
export function applyAppearance(value: Appearance, darkSystem: boolean) {
  document.documentElement.dataset.theme = value === "system" ? (darkSystem ? "dark" : "light") : value;
  try { localStorage.setItem("glint-appearance", value); } catch { /* Optional preference. */ }
}
