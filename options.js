document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settingsForm");
  const statusMessage = document.getElementById("statusMessage");

  // Function to show the status message with fade-in and fade-out effects
  function showStatusMessage(message, fadeoutDelay) {
    statusMessage.textContent = message;
    statusMessage.classList.add("visible");

    // Fade out after x ms
    setTimeout(() => {
      statusMessage.classList.remove("visible");
    }, fadeoutDelay + 500); // 500ms fade-in
  }

  // Dynamically derive setting keys from the defaults object
  const settingKeys = Object.keys(settings.defaults);

  // Save settings on form submission
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = settings.data;
    settingKeys.forEach((key) => {
      const element = document.getElementById(key);
      if (!element)
        return;

      if (element.type === "checkbox") {
        values[key] = element.checked;
        return;
      }

      // Reject non-numeric input and clamp to the field's minimum so
      // values like NaN or a negative interval never reach storage.
      const parsed = parseInt(element.value, 10);
      const min = element.min === "" ? Number.NEGATIVE_INFINITY : parseInt(element.min, 10);
      values[key] = Number.isFinite(parsed) ? Math.max(parsed, min) : settings.defaults[key];
      element.value = values[key];
    });

    await settings.save();
    showStatusMessage("Settings saved successfully!", values.fadeoutDelay || settings.defaults.fadeoutDelay);
  });

  // Render the per-site disable list with the option to re-enable
  function renderBlacklist() {
    const container = document.getElementById("blacklistContainer");
    if (!container)
      return;

    container.textContent = "";
    const entries = settings.data.blacklist || {};
    const hosts = Object.keys(entries).sort();
    if (hosts.length === 0) {
      container.textContent = "No sites are currently disabled. Use the toolbar button to disable prefetching on a site.";
      return;
    }

    const now = Date.now();
    hosts.forEach((host) => {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 5px;";

      const label = document.createElement("span");
      const expiry = entries[host];
      label.textContent =
        expiry === Blacklist.PERMANENT ? `${host} — disabled permanently` :
        expiry > now ? `${host} — disabled until ${new Date(expiry).toLocaleString()}` :
        `${host} — expired`;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Re-enable";
      removeButton.addEventListener("click", async () => {
        settings.data.blacklist = Blacklist.remove(settings.data.blacklist, host);
        await settings.save();
        renderBlacklist();
      });

      row.appendChild(label);
      row.appendChild(removeButton);
      container.appendChild(row);
    });
  }

  // Load settings from storage and populate the form
  await settings.load();
  const data = settings.data;
  settingKeys.forEach((key) => {
    const element = document.getElementById(key);
    if (!element)
      return;

    if (element.type === "checkbox") {
      element.checked = data[key];
    } else {
      element.value = data[key];
    }
  });
  renderBlacklist();
});
