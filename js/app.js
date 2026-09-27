(() => {
  const SITE = window.SITE || {};
  const ARCHIVE_RE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz|iso|dmg|exe|msi|pkg)$/i;

  const state = {
    busy: false,
    asset: null,
  };

  function showNote(message) {
    const note = document.getElementById("note");
    if (!note) return;
    if (!message) {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    note.hidden = false;
    note.textContent = message;
  }

  function readQuery() {
    const q = new URLSearchParams(location.search);
    return {
      releaseUrl: q.get("release") || q.get("url") || SITE.releaseUrl || "",
      assetName: q.get("file") || SITE.assetName || "",
    };
  }

  function parseGithub(input) {
    if (!input) return null;
    try {
      const u = new URL(input);
      if (u.hostname !== "github.com") return { kind: "direct", url: input };
      const parts = u.pathname.replace(/^\/|\/$/g, "").split("/");
      const [owner, repo, section, a, b] = parts;
      if (!owner || !repo) return null;
      if (section === "releases" && a === "download" && b) {
        return {
          kind: "asset",
          owner,
          repo,
          tag: decodeURIComponent(b),
          file: decodeURIComponent(parts.slice(5).join("/")),
          page: `https://github.com/${owner}/${repo}`,
        };
      }
      if (section === "releases" && (a === "latest" || !a)) {
        return { kind: "latest", owner, repo, page: `https://github.com/${owner}/${repo}` };
      }
      if (section === "releases" && a === "tag" && b) {
        return {
          kind: "tag",
          owner,
          repo,
          tag: decodeURIComponent(b),
          page: `https://github.com/${owner}/${repo}`,
        };
      }
      return { kind: "latest", owner, repo, page: `https://github.com/${owner}/${repo}` };
    } catch {
      return null;
    }
  }

  async function githubJson(path) {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "Release not found."
          : res.status === 403
            ? "GitHub rate limit. Wait a minute and try again."
            : `GitHub error ${res.status}.`
      );
    }
    return res.json();
  }

  function pickAsset(release, wanted) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    if (wanted) {
      const match = assets.find(
        (a) => a.name.toLowerCase() === wanted.toLowerCase()
      );
      if (match) return match;
    }
    const archive = assets.find((a) => ARCHIVE_RE.test(a.name));
    if (archive) return archive;
    if (assets[0]) return assets[0];
    if (release.zipball_url) {
      return {
        name: `${release.tag_name || "source"}.zip`,
        browser_download_url: release.zipball_url,
        size: 0,
        sourceZip: true,
      };
    }
    return null;
  }

  async function resolveAsset(cfg) {
    const parsed = parseGithub(cfg.releaseUrl);
    if (!parsed) throw new Error("No release URL set.");

    if (parsed.kind === "direct") {
      const name = cfg.assetName || parsed.url.split("/").pop() || "download.bin";
      return {
        name,
        browser_download_url: parsed.url,
        size: 0,
        html_url: parsed.url,
      };
    }

    if (parsed.kind === "asset") {
      const release = await githubJson(
        `/repos/${parsed.owner}/${parsed.repo}/releases/tags/${encodeURIComponent(parsed.tag)}`
      );
      const wanted = cfg.assetName || parsed.file;
      const asset = pickAsset(release, wanted) || {
        name: parsed.file,
        browser_download_url: `https://github.com/${parsed.owner}/${parsed.repo}/releases/download/${parsed.tag}/${parsed.file}`,
        size: 0,
      };
      return asset;
    }

    const path =
      parsed.kind === "tag"
        ? `/repos/${parsed.owner}/${parsed.repo}/releases/tags/${encodeURIComponent(parsed.tag)}`
        : `/repos/${parsed.owner}/${parsed.repo}/releases/latest`;
    const release = await githubJson(path);
    const asset = pickAsset(release, cfg.assetName);
    if (!asset) throw new Error("No files in this release.");
    return asset;
  }

  function nativeSave(url, name) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name || "";
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function directFile(cfg) {
    const parsed = parseGithub(cfg.releaseUrl);
    if (!parsed) return null;
    if (parsed.kind === "direct") {
      return {
        name: cfg.assetName || parsed.url.split("/").pop() || "download.bin",
        url: parsed.url,
      };
    }
    if (parsed.kind === "asset") {
      return {
        name: cfg.assetName || parsed.file || "download.bin",
        url: cfg.releaseUrl,
      };
    }
    return null;
  }

  async function run() {
    if (state.busy) return;
    state.busy = true;
    showNote("");

    try {
      const cfg = readQuery();
      const direct = directFile(cfg);
      if (direct) {
        state.asset = direct;
        nativeSave(direct.url, direct.name);
        return;
      }
      const asset = await resolveAsset(cfg);
      state.asset = asset;
      nativeSave(asset.browser_download_url, asset.name || "release.zip");
    } catch (err) {
      showNote(err.message || "Download failed.");
    } finally {
      state.busy = false;
    }
  }

  const delay = Number.isFinite(SITE.autoStartDelay) ? SITE.autoStartDelay : 0;
  if (delay > 0) setTimeout(run, delay);
  else run();
})();
