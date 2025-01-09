class PrefetchUI {
  constructor(fadeoutDelay, menuDelay) {
    this.fadeoutDelay = fadeoutDelay;
    this.menuDelay = menuDelay;
    this.tableEntries = {};
    this.initTable();
  }

  initTable() {
    this.tableContainer = document.createElement("div");
    this.tableContainer.id = "prefetchTable";
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
      transition: opacity 500ms;
      z-index: 9999;
      width: 250px;
    `;
    
    // Add statistics display
    this.statisticsDisplay = document.createElement("div");
    this.statisticsDisplay.style.cssText = `
      text-align: center;
      margin-bottom: 10px;
      font-weight: bold;
    `;
    
    this.updateStatisticsDisplay();
    this.tableContainer.appendChild(this.statisticsDisplay);
    
    document.body.appendChild(this.tableContainer);
  }

  updateStatisticsDisplay() {
    // Group table entries by their state
    const stateCounts = Object.values(this.tableEntries).reduce((acc, entry) => {
      const state = entry.dataset.state;
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    }, {});

    // Build statistics display dynamically based on State enum
    this.statisticsDisplay.innerHTML = `
      L: ${stateCounts[State.LOADING] || 0} |
      Q: ${stateCounts[State.QUEUED] || 0} |
      S: ${stateCounts[State.SKIPPED] || 0} |
      D: ${stateCounts[State.DONE] || 0}
    `;
  }

  resetFadeoutTimer() {
    clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => this.hideTable(), this.menuDelay);
    this.showTable();
  }

  showTable() { this.tableContainer.style.opacity = "1"; }

  hideTable() { this.tableContainer.style.opacity = "0"; }

  updateTableEntry(resource) {
    let entry = this.tableEntries[resource.href];

    if (!entry) {
      entry = document.createElement("div");
      entry.id = `entry-${resource.href}`;
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
        resource.state = State.ABORTED_MANUALLY;
        this.updateTableEntry(resource);
      });
      
      this.tableContainer.appendChild(entry);
      this.tableEntries[resource.href] = entry;
    }

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
    entry.innerHTML = `
      <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${resource.href}
      </span>
      <span style="margin-left: 10px; color: #fff;">
        ${resource.method}
      </span>
      <span style="margin-left: 10px; color: ${priorityColor}">
        [${resource.priority}]
      </span>
      <span style="margin-left: 10px; color: ${stateColor};">
        ${resource.state}
      </span>
    `;
        
    if ([State.DONE, State.SKIPPED, State.ABORTED_MANUALLY].includes(resource.state))
      this.fadeoutAndHideEntry(entry);
    
    this.updateStatisticsDisplay();
    this.resetFadeoutTimer();
  }
  
  fadeoutAndHideEntry(entry) {
    setTimeout(() => {
      entry.addEventListener(
        "transitionend",
        () => { entry.style.display = "none"; },
        { once: true }
      );
      entry.style.opacity = "0";
    }, this.fadeoutDelay);
  }

}
