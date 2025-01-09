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
      if (element.type === "checkbox") {
        values[key] = element.checked;
      } else {
        values[key] = parseInt(element.value, 10);
      }
    });

    await settings.save();
    showStatusMessage("Settings saved successfully!", values.fadeoutDelay || settings.defaults.fadeoutDelay);
  });

  // Load settings from storage and populate the form
  await settings.load();
  const data = settings.data;
  settingKeys.forEach((key) => {
    const element = document.getElementById(key);
    if (element.type === "checkbox") {
      element.checked = data[key];
    } else {
      element.value = data[key];
    }
  });
});
