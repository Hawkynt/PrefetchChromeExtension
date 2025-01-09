class Resource {
  constructor(href, method, priority, state) {
    this.href = href;
    this.method = method;
    this.state = state;
    this.priority = priority;
    this.priorityStack = [];
  }

  /**
   * Change the priority of the resource.
   * Pushes the current priority onto the stack before changing.
   */
  changePriority(newPriority) {
    if (newPriority !== this.priority) {
      this.priorityStack.push(this.priority);
      this.priority = newPriority;
    }
  }

  /**
   * Restore the previous priority from the stack, if available.
   */
  restorePriority() {
    if (this.priorityStack.length > 0) {
      this.priority = this.priorityStack.pop();
    }
  }

  /**
   * Check if the resource is available for processing.
   * @returns {boolean}
   */
  isAvailable() {
    return this.state === State.QUEUED;
  }

  /**
   * Check if the resource is finished (either done, skipped, or aborted).
   * @returns {boolean}
   */
  isFinished() {
    return (
      this.state === State.DONE ||
      this.state === State.SKIPPED ||
      this.state === State.ABORTED_MANUALLY
    );
  }

  /**
   * Check if the resource is in progress (loading).
   * @returns {boolean}
   */
  isInProgress() {
    return this.state === State.LOADING;
  }

  /**
   * Get the priority level index for sorting.
   * @returns {number}
   */
  getPriorityLevel() {
    const priorityOrder = [
      Priority.REALTIME,
      Priority.HIGH,
      Priority.NORMAL,
      Priority.LOW,
    ];
    return priorityOrder.indexOf(this.priority);
  }

  /**
   * Get the state level index for sorting.
   * @returns {number}
   */
  getStateLevel() {
    const stateOrder = [
      State.LOADING,
      State.QUEUED,
      State.ABORTED_MANUALLY,
      State.SKIPPED,
      State.DONE,
    ];
    return stateOrder.indexOf(this.state);
  }
}


class PrefetchManager {
  constructor({
    avoidSlowConnections = false,
    avoidDataSaver = false,
    maxConcurrentPrefetchers = 1,
    allowQueryPrefetch = false,
    enableMethodPrefetch = false,
    enableMethodPreload = false,
    enableMethodModulepreload = false,
    enableMethodPreconnect = false,
    enableMethodDns = false,
    enableSpeculationRules = false,
  } = {}) {
    this.avoidSlowConnections = avoidSlowConnections;
    this.avoidDataSaver = avoidDataSaver;
    this.maxConcurrentPrefetchers = maxConcurrentPrefetchers;
    this.allowQueryPrefetch = allowQueryPrefetch;
    this.enableMethodPrefetch = enableMethodPrefetch;
    this.enableMethodPreload = enableMethodPreload;
    this.enableMethodModulepreload = enableMethodModulepreload;
    this.enableMethodPreconnect = enableMethodPreconnect;
    this.enableMethodDns = enableMethodDns;
    this.enableSpeculationRules = enableSpeculationRules;

    this.priorityList = [];
    this.activePrefetchers = 0;

    // Events
    this.resourceQueuedCallbacks = [];
    this.resourceUpdatedCallbacks = [];
    this.resourceRemovedCallbacks = [];
  }

  // Event methods
  trigger(event, resource) {
    event.forEach((callback) => callback(resource));
  }

  subscribe(event, callback) {
    event.push(callback);
  }

  onResourceQueued(callback) {
    this.subscribe(this.resourceQueuedCallbacks, callback);
  }

  onResourceUpdated(callback) {
    this.subscribe(this.resourceUpdatedCallbacks, callback);
  }

  onResourceRemoved(callback) {
    this.subscribe(this.resourceRemovedCallbacks, callback);
  }

  emitResourceQueued(resource) {
    this.trigger(this.resourceQueuedCallbacks, resource);
  }

  emitResourceUpdated(resource) {
    this.trigger(this.resourceUpdatedCallbacks, resource);
  }

  emitResourceRemoved(resource) {
    this.trigger(this.resourceRemovedCallbacks, resource);
  }

  addOrUpdateResourceEntry(href, method, priority) {
    let resource = this.priorityList.find((r) => r.href === href);
    if (resource)
      return resource;
    
    resource = new Resource(href, method, priority, State.QUEUED);
    this.priorityList.push(resource);
    this.emitResourceQueued(resource);

    this.sortPriorityList();
    this.processPriorityList();
    
    return resource;
  }

  sortPriorityList() {
    this.priorityList.sort((a, b) => {
      const priorityDiff = a.getPriorityLevel() - b.getPriorityLevel();
      if (priorityDiff !== 0) return priorityDiff;
      return a.getStateLevel() - b.getStateLevel();
    });
  }

  async processPriorityList() {
    while (this.activePrefetchers < this.maxConcurrentPrefetchers) {
      ++this.activePrefetchers;

      try {
        const resource = this.priorityList.find( (r) => r.isAvailable() );
        
        // No more items to process?
        if (!resource) 
          return;

        await this.speculativeLoad(resource);
      } finally {
        --this.activePrefetchers;
      }
    
    }
  }

  async speculativeLoad(resource) {
    const method = resource.method;
    const settingKey = 
      method === Method.DNS ? "enableMethodDns" :
      method === Method.PRE_CONNECT ? "enableMethodPreconnect" :
      method === Method.MODULE_PRELOAD ? "enableMethodModulepreload" :
      method === Method.RESOURCE_PRELOAD ? "enableMethodPreload" :
      method === Method.PAGE_PREFETCH ? "enableMethodPrefetch" :
      "none";
    
    if (!this[settingKey]) {
      resource.state = State.SKIPPED;
      this.emitResourceUpdated(resource);
      return Promise.resolve();
    }

    resource.state = State.LOADING;
    this.emitResourceUpdated(resource);

    return new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = method;
      link.href = resource.href;

      if (method === Method.DNS) {
        // For DNS-prefetch, mark as DONE immediately
        document.head.appendChild(link);
        console.log(`DNS-prefetch initiated for: ${resource.href}`);
        resource.state = State.DONE;
        this.emitResourceUpdated(resource);
        resolve();
        return;
      }

      // Handle prefetch completion
      link.onload = () => {
        resource.state = State.DONE;
        this.emitResourceUpdated(resource);
        resolve();
      };

      // Handle prefetch failure
      link.onerror = () => {
        resource.state = State.SKIPPED;
        this.emitResourceUpdated(resource);
        reject(new Error(`Prefetch failed for ${resource.href}`));
      };

      // Append the link to the document head to initiate the prefetch
      document.head.appendChild(link);
    });
  }

  isSlowConnection() {
    return (
      navigator.connection &&
      navigator.connection.effectiveType &&
      ["2g", "slow-2g"].includes(navigator.connection.effectiveType)
    );
  }

  isSavingData() {
    return navigator.connection && navigator.connection.saveData;
  }

  getMethodByHref(href) {
    if(href.trim().startsWith("javascript:"))
      return null;

    const url = new URL(href);
    if (!this.allowQueryPrefetch && url.search)
      return null;

    let method = Method.DNS;
    if (url.search) method = Method.PRE_CONNECT;
    else if (url.pathname.endsWith(".js")) method = Method.MODULE_PRELOAD;
    else if (url.pathname.endsWith(".css")) method = Method.RESOURCE_PRELOAD;
    else if (url.hostname === location.hostname) method = Method.PAGE_PREFETCH;
    return method;
  }

  updateResourcePriority(href, priority) {
    const resource = this.priorityList.find((r) => r.href === href);
    if (!resource)
      return;
    
    if(!priority)
      resource.restorePriority();
    else
      resource.changePriority(priority);
    
    this.sortPriorityList();
    this.emitResourceUpdated(resource);
  }
  

  scanForNewLinks() {
    
    if (this.avoidSlowConnections && this.isSlowConnection()) {
      console.log("Prefetching skipped due to slow connection.");
      return;
    }

    if (this.avoidDataSaver && this.isSavingData()) {
      console.log("Prefetching skipped due to data saver mode.");
      return;
    }

    const links = document.querySelectorAll("a[href]");
    links.forEach((link) => {
      const href = link.href;
      const method = this.getMethodByHref(href);
      
      if(method==null)
        return;

      this.addOrUpdateResourceEntry(href, method, Priority.LOW);
    });
  }
  
  setupIntersectionObserver() {
    
    if (this.avoidSlowConnections && this.isSlowConnection()) {
      console.log("Prefetching skipped due to slow connection.");
      return;
    }

    if (this.avoidDataSaver && this.isSavingData()) {
      console.log("Prefetching skipped due to data saver mode.");
      return;
    }
        
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          this.updateResourcePriority(href);
          return;
        }

        const href = entry.target.href;
        const method = this.getMethodByHref(href);
        if (method == null)
          return;
        
        this.addOrUpdateResourceEntry(href, method, Priority.LOW);
        this.updateResourcePriority(href, Priority.NORMAL);
      });
    });

    this.observedLinks = this.observedLinks || new Set();
    const links = document.querySelectorAll("a[href]");
    links.forEach((link) => {
      if (!this.observedLinks.has(link)) {
        observer.observe(link);
        this.observedLinks.add(link);
      }
    });
  }

  setupMouseOverBoost() {
    document.body.addEventListener("mouseover", (event) => {
      const link = event.target.closest("a[href]");
      if (!link)
        return;

      const href = link.href;
      const method = this.getMethodByHref(href);
      if (method == null)
        return;
        
      this.addOrUpdateResourceEntry(href, method, Priority.LOW);
      this.updateResourcePriority(href, Priority.REALTIME);
     
      link.addEventListener(
        "mouseout",
        () => this.updateResourcePriority(href),
        { once: true }
      );
      
    });
  }
}
