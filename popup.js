document.addEventListener("DOMContentLoaded", async () => {
  const hostNameDisplay = document.getElementById("hostName");
  const statusDisplay = document.getElementById("status");
  const disableControls = document.getElementById("disableControls");
  const scopeSelect = document.getElementById("scopeSelect");
  const enableButton = document.getElementById("enableAgain");

  await settings.load();

  const tabs = await new Promise((resolve) =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );

  let hostname = null;
  try {
    const url = new URL(tabs[0].url);
    if (url.protocol === "http:" || url.protocol === "https:")
      hostname = url.hostname;
  } catch {
    // No usable tab URL (new tab page, browser UI, ...)
  }

  if (!hostname) {
    hostNameDisplay.textContent = "This page";
    statusDisplay.textContent = "Prefetching is not applicable here.";
    disableControls.style.display = "none";
    enableButton.style.display = "none";
    return;
  }

  hostNameDisplay.textContent = hostname;

  // Offer the exact host and every parent domain down to the
  // registrable one, so blocking can be as narrow or broad as needed.
  Blacklist.scopesFor(hostname).forEach((scope) => {
    const option = document.createElement("option");
    option.value = scope;
    option.textContent = scope;
    scopeSelect.appendChild(option);
  });

  const render = () => {
    const entries = settings.data.blacklist || {};
    if (Blacklist.covers(entries, hostname, Date.now())) {
      const covering = Blacklist.entryFor(entries, hostname);
      const expiry = Blacklist.expiryFor(entries, hostname);
      statusDisplay.textContent =
        expiry === Blacklist.PERMANENT
          ? `Prefetching is disabled for ${covering}.`
          : `Prefetching is disabled for ${covering} until ${new Date(expiry).toLocaleTimeString()}.`;
      disableControls.style.display = "none";
      enableButton.style.display = "";
    } else {
      statusDisplay.textContent = "Prefetching is active on this site.";
      disableControls.style.display = "";
      enableButton.style.display = "none";
    }
  };

  const disableFor = async (durationMs) => {
    const now = Date.now();
    settings.data.blacklist = Blacklist.add(
      Blacklist.purgeExpired(settings.data.blacklist || {}, now),
      scopeSelect.value || hostname,
      durationMs,
      now
    );
    await settings.save();
    render();
  };

  document.getElementById("disable5").addEventListener("click", () => disableFor(5 * 60_000));
  document.getElementById("disable30").addEventListener("click", () => disableFor(30 * 60_000));
  document.getElementById("disable60").addEventListener("click", () => disableFor(60 * 60_000));
  document.getElementById("disablePermanent").addEventListener("click", () => disableFor(null));

  enableButton.addEventListener("click", async () => {
    const covering = Blacklist.entryFor(settings.data.blacklist || {}, hostname);
    if (covering !== null) {
      settings.data.blacklist = Blacklist.remove(settings.data.blacklist, covering);
      await settings.save();
    }
    render();
  });

  render();
});
