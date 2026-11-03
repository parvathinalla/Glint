/**
 * Upfront API-key gate. First-visit users are asked for a key when the site
 * opens; dismissing the dialog records that choice per browser. Connect the
 * key later from the top bar. Storage failure keeps asking (fail-ask).
 */
const KEY = "glint-key-gate";
export function loadKeyGateDismissed(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function saveKeyGateDismissed() {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, "1");
  } catch {
    // Private mode: the gate simply asks again next visit.
  }
}
