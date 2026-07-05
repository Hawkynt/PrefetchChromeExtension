class PrefetchUI {
  constructor(fadeoutDelay, menuDelay, expanded = false) {
    this.fadeoutDelay = fadeoutDelay;
    this.menuDelay = menuDelay;
    this.expanded = Boolean(expanded);
    this.tableEntries = {};
    this.abortRequestedCallbacks = [];
    this.expandToggledCallbacks = [];
    // Cumulative per-page counters for the progress bar: hrefs ever
    // seen and hrefs that reached a terminal state (or were removed).
    this.knownHrefs = new Set();
    this.processedHrefs = new Set();
    this.initTable();
  }

  /**
   * Subscribe to abort requests (user clicked an entry). The UI never
   * mutates resources itself; the controller decides what happens.
   */
  onAbortRequested(callback) {
    this.abortRequestedCallbacks.push(callback);
  }

  /**
   * Subscribe to expand/collapse toggles so the controller can persist
   * the state across pages.
   */
  onExpandToggled(callback) {
    this.expandToggledCallbacks.push(callback);
  }

  initTable() {
    this.tableContainer = document.createElement("div");
    this.tableContainer.id = "prefetchTable";
    // pointer-events is toggled with visibility: an invisible overlay
    // must never swallow clicks meant for the page beneath it.
    this.tableContainer.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #000;
      color: #fff;
      border: 1px solid #ccc;
      border-radius: 5px;
      padding: 10px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      font-family: Arial, sans-serif;
      font-size: 12px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 500ms;
      z-index: 9999;
      width: 250px;
    `;

    // Header: expand/collapse indicator plus the statistics summary.
    this.headerRow = document.createElement("div");
    this.headerRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-weight: bold;
      margin-bottom: 6px;
    `;
    this.headerRow.addEventListener("click", () => this.setExpanded(!this.expanded));

    this.toggleIndicator = document.createElement("span");

    this.statisticsDisplay = document.createElement("div");
    this.statisticsDisplay.style.cssText = `
      flex: 1;
      text-align: center;
    `;

    this.headerRow.appendChild(this.toggleIndicator);
    this.headerRow.appendChild(this.statisticsDisplay);
    this.tableContainer.appendChild(this.headerRow);

    // Slim progress bar: processed share of all links found so far.
    this.progressTrack = document.createElement("div");
    this.progressTrack.style.cssText = `
      height: 6px;
      background: #333;
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 6px;
    `;
    this.progressFill = document.createElement("div");
    this.progressFill.style.cssText = `
      height: 100%;
      width: 0%;
      background: Lime;
      transition: width 300ms;
    `;
    this.progressTrack.appendChild(this.progressFill);
    this.tableContainer.appendChild(this.progressTrack);

    // The detailed queue lives in its own container so collapsing is
    // just hiding this element; entries keep updating underneath.
    this.entriesContainer = document.createElement("div");
    this.tableContainer.appendChild(this.entriesContainer);

    this.applyExpandedState();
    this.updateStatisticsDisplay();

    document.body.appendChild(this.tableContainer);
  }

  setExpanded(expanded) {
    if (expanded === this.expanded)
      return;

    this.expanded = expanded;
    this.applyExpandedState();
    this.expandToggledCallbacks.forEach((callback) => callback(expanded));
  }

  applyExpandedState() {
    this.entriesContainer.style.display = this.expanded ? "" : "none";
    this.toggleIndicator.textContent = this.expanded ? "▾" : "▸";
  }

  updateStatisticsDisplay() {
    // Group table entries by their state
    const stateCounts = Object.values(this.tableEntries).reduce((acc, entry) => {
      const state = entry.dataset.state;
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {});

    this.statisticsDisplay.textContent =
      `L: ${stateCounts[State.LOADING] || 0} | ` +
      `Q: ${stateCounts[State.QUEUED] || 0} | ` +
      `S: ${stateCounts[State.SKIPPED] || 0} | ` +
      `D: ${stateCounts[State.DONE] || 0} | ` +
      `A: ${stateCounts[State.ABORTED_MANUALLY] || 0}`;

    this.updateProgressBar();
  }

  updateProgressBar() {
    const found = this.knownHrefs.size;
    const processed = this.processedHrefs.size;
    const percent = found === 0 ? 0 : Math.round((processed / found) * 100);
    this.progressFill.style.width = `${percent}%`;
    this.progressTrack.title = `${processed} / ${found} links processed`;
  }

  resetFadeoutTimer() {
    clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => this.hideTable(), this.menuDelay);
    this.showTable();
  }

  showTable() {
    this.tableContainer.style.opacity = "1";
    this.tableContainer.style.pointerEvents = "auto";
  }

  hideTable() {
    this.tableContainer.style.opacity = "0";
    this.tableContainer.style.pointerEvents = "none";
  }

  updateTableEntry(resource) {
    let entry = this.tableEntries[resource.href];

    if (!entry) {
      entry = document.createElement("div");
      entry.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
        padding: 5px;
        border-radius: 3px;
        opacity: 1;
        transition: opacity ${this.fadeoutDelay}ms;
      `;
      entry.title = resource.href;
      entry.dataset.href = resource.href;
      entry.addEventListener("click", () => {
        this.abortRequestedCallbacks.forEach((callback) => callback(resource.href));
      });

      const makeCell = (marginLeft) => {
        const cell = document.createElement("span");
        if (marginLeft)
          cell.style.marginLeft = marginLeft;
        entry.appendChild(cell);
        return cell;
      };

      entry.hrefCell = makeCell(null);
      entry.hrefCell.style.cssText = "flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      entry.methodCell = makeCell("10px");
      entry.methodCell.style.color = "#fff";
      entry.priorityCell = makeCell("10px");
      entry.stateCell = makeCell("10px");

      this.entriesContainer.appendChild(entry);
      this.tableEntries[resource.href] = entry;
    }

    this.knownHrefs.add(resource.href);
    if ([State.DONE, State.SKIPPED, State.ABORTED_MANUALLY].includes(resource.state))
      this.processedHrefs.add(resource.href);

    entry.dataset.state = resource.state;
    entry.dataset.priority = resource.priority;

    const priorityColor =
      resource.priority === Priority.REALTIME ? "White" :
      resource.priority === Priority.HIGH ? "Red" :
      resource.priority === Priority.NORMAL ? "Lime" :
      resource.priority === Priority.LOW ? "DodgerBlue" :
      "Transparent";

    const itemColor =
      resource.state === State.DONE ? "Gray" :
      resource.state === State.LOADING ? "MediumBlue" :
      resource.state === State.SKIPPED ? "Red" :
      resource.state === State.ABORTED_MANUALLY ? "White" :
      "DarkKhaki";

    const stateColor =
      resource.state === State.DONE ? "Green" :
      resource.state === State.LOADING ? "White" :
      resource.state === State.SKIPPED ? "Yellow" :
      resource.state === State.ABORTED_MANUALLY ? "Red" :
      "Black";

    entry.style.backgroundColor = itemColor;
    // textContent only: hrefs are page-controlled data, never markup.
    entry.hrefCell.textContent = resource.href;
    entry.methodCell.textContent = resource.method;
    entry.priorityCell.textContent = `[${resource.priority}]`;
    entry.priorityCell.style.color = priorityColor;
    entry.stateCell.textContent = resource.state;
    entry.stateCell.style.color = stateColor;

    if ([State.DONE, State.SKIPPED, State.ABORTED_MANUALLY].includes(resource.state))
      this.fadeoutAndRemoveEntry(resource.href);

    this.updateStatisticsDisplay();
    this.resetFadeoutTimer();
  }

  removeTableEntry(resource) {
    // A removed link is no longer pending, whatever its state was.
    if (this.knownHrefs.has(resource.href))
      this.processedHrefs.add(resource.href);

    const entry = this.tableEntries[resource.href];
    if (!entry)
      return;

    delete this.tableEntries[resource.href];
    if (entry.parentNode)
      entry.parentNode.removeChild(entry);

    this.updateStatisticsDisplay();
  }

  fadeoutAndRemoveEntry(href) {
    const entry = this.tableEntries[href];
    if (!entry || entry.dataset.fading)
      return;

    entry.dataset.fading = "true";
    setTimeout(() => {
      entry.addEventListener(
        "transitionend",
        () => this.removeTableEntry({ href }),
        { once: true }
      );
      entry.style.opacity = "0";
    }, this.fadeoutDelay);
  }
}
