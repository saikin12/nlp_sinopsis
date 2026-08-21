/**
 * Drop this folder on GitHub Pages.
 * Paste a GitHub release URL below — or pass it as ?release=
 *
 * Supported:
 *   https://github.com/owner/repo/releases/latest
 *   https://github.com/owner/repo/releases/tag/v1.0.0
 *   https://github.com/owner/repo/releases/download/v1.0.0/archive.zip
 */
window.SITE = {
  name: "Drop",
  kicker: "Latest release",
  title: "Your archive is on the way.",
  subtitle:
    "The download starts automatically. Keep this tab open until the file is saved.",

  // Paste a release page or a direct asset URL.
  releaseUrl: "",

  // Optional: pick a specific asset (e.g. "app-windows.zip"). Empty = first archive.
  assetName: "",

  // Optional CORS proxy prefix if GitHub blocks browser fetch (needed for a real byte progress bar).
  // Example: "https://corsproxy.io/?url="
  corsProxy: "",

  autoStartDelay: 1100,
};
