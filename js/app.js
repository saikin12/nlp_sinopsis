(() => {
  const SITE = window.SITE || {};
  const ARCHIVE_RE = /\.(zip|7z|rar|tar|gz|tgz|bz2|xz|iso|dmg|exe|msi|pkg)$/i;

  const $ = (id) => document.getElementById(id);
  const ui = {
    card: $("card"),
    brand: $("brandName"),
    kicker: $("kicker"),
    title: $("title"),
    subtitle: $("subtitle"),
    status: $("status"),
    bar: $("bar"),
    fill: $("fill"),
    bytes: $("bytes"),
    pct: $("pct"),
    speed: $("speed"),
    fileName: $("fileName"),
    primary: $("primary"),
    fallback: $("fallback"),
    repoLink: $("repoLink"),
  };

  const state = {
    visual: 0,
    target: 0,
    raf: 0,
    busy: false,
    asset: null,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function lerpLoop() {
    state.visual += (state.target - state.visual) * 0.14;
    if (Math.abs(state.target - state.visual) < 0.08) state.visual = state.target;
    paint(state.visual);
    state.raf = requestAnimationFrame(lerpLoop);
  }

  function paint(value) {
    const pct = Math.max(0, Math.min(100, value));
    ui.fill.style.width = `${pct}%`;
    ui.pct.textContent = `${Math.round(pct)}%`;
    ui.bar.setAttribute("aria-valuenow", String(Math.round(pct)));
  }

  function setBarMode(mode) {
    ui.bar.classList.toggle("indeterminate", mode === "indeterminate");
  }

  function setTone(tone) {
    ui.card.classList.toggle("done", tone === "done");
    ui.card.classList.toggle("err", tone === "err");
  }

  function formatBytes(n) {
    if (!Number.isFinite(n) || n < 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function formatSpeed(bps) {
    if (!Number.isFinite(bps) || bps <= 0) return "—";
    return `${formatBytes(bps)}/s`;
  }

  function applyCopy() {
    ui.brand.textContent = SITE.name || "Download";
    ui.kicker.textContent = SITE.kicker || "Release";
    ui.title.textContent = SITE.title || "Download";
    ui.subtitle.textContent =
      SITE.subtitle || "The file starts downloading automatically.";
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
      ui.repoLink.href = parsed.url;
      return {
        name,
        browser_download_url: parsed.url,
        size: 0,
        html_url: parsed.url,
      };
    }

    ui.repoLink.href = parsed.page;

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

  function proxied(url) {
    const prefix = SITE.corsProxy || "";
    return prefix ? prefix + encodeURIComponent(url) : url;
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

  function saveBlob(blob, name) {
    const href = URL.createObjectURL(blob);
    nativeSave(href, name);
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  }

  async function fetchWithProgress(url, onProgress) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body) {
      const blob = await res.blob();
      onProgress(blob.size, blob.size || total);
      return blob;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    return new Blob(chunks);
  }

  async function downloadAsset(asset) {
    const url = asset.browser_download_url;
    const name = asset.name || "release.zip";
    let last = 0;
    let lastT = performance.now();
    let ema = 0;

    const onProgress = (loaded, total) => {
      const now = performance.now();
      const dt = (now - lastT) / 1000;
      if (dt > 0.12) {
        const inst = (loaded - last) / dt;
        ema = ema ? ema * 0.72 + inst * 0.28 : inst;
        last = loaded;
        lastT = now;
        ui.speed.textContent = formatSpeed(ema);
      }
      if (total > 0) {
        state.target = (loaded / total) * 100;
        ui.bytes.textContent = `${formatBytes(loaded)} of ${formatBytes(total)}`;
      } else {
        state.target = Math.min(92, 12 + loaded / 180000);
        ui.bytes.textContent = `${formatBytes(loaded)} of —`;
      }
    };

    const tooLarge = asset.size > 80 * 1024 * 1024;

    if (!tooLarge) {
      try {
        const blob = await fetchWithProgress(proxied(url), onProgress);
        saveBlob(blob, name);
        return "saved";
      } catch {
        /* GitHub often blocks cross-origin reads; fall through to a native save. */
      }
    }

    setBarMode("determinate");
    ui.status.textContent = "Saving file…";
    const start = state.visual;
    const t0 = performance.now();
    nativeSave(url, name);
    await new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 900);
        state.target = start + (100 - start) * (1 - (1 - t) ** 3);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    return "handoff";
  }

  async function run() {
    if (state.busy) return;
    state.busy = true;
    setTone("");
    setBarMode("indeterminate");
    state.target = 8;
    ui.primary.disabled = true;
    ui.primary.textContent = "Downloading";
    ui.status.textContent = "Looking up release";
    ui.speed.textContent = "—";

    try {
      const cfg = readQuery();
      const asset = await resolveAsset(cfg);
      state.asset = asset;
      ui.fileName.textContent = asset.name;
      ui.fallback.hidden = false;
      ui.fallback.href = asset.browser_download_url;
      ui.fallback.setAttribute("download", asset.name);
      ui.status.textContent = "Downloading";
      setBarMode("determinate");
      state.target = 4;

      const mode = await downloadAsset(asset);
      state.target = 100;
      setBarMode("determinate");
      await sleep(280);
      setTone("done");
      ui.status.textContent =
        mode === "saved" ? "Done." : "If nothing started, use the direct link.";
      ui.primary.textContent = "Download again";
      ui.speed.textContent = mode === "saved" ? "done" : "—";
      ui.bytes.textContent =
        asset.size > 0 ? formatBytes(asset.size) : ui.bytes.textContent;
    } catch (err) {
      setTone("err");
      setBarMode("determinate");
      state.target = 100;
      ui.status.textContent = err.message || "Download failed.";
      ui.primary.textContent = "Try again";
      ui.fileName.textContent = "—";
      ui.speed.textContent = "—";
    } finally {
      ui.primary.disabled = false;
      state.busy = false;
    }
  }

  applyCopy();
  lerpLoop();
  ui.primary.addEventListener("click", run);

  const delay = Number.isFinite(SITE.autoStartDelay) ? SITE.autoStartDelay : 1100;
  window.addEventListener(
    "load",
    () => {
      ui.status.textContent = "Loading";
      setTimeout(run, delay);
    },
    { once: true }
  );
})();
