class Resource {
  constructor(href, method, priority, state) {
    this.href = href;
    this.method = method;
    this.state = state;
    this.priority = priority;
    this.priorityStack = [];
    this.linkElement = null;
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
  /**
   * URL path/query keywords that indicate a state-changing endpoint.
   * Fetching such a URL speculatively could log the user out, add items
   * to a cart, cast votes, confirm subscriptions, etc. — so any link
   * matching one of these words (delimited by non-letters) is never
   * prefetched. Biased toward false positives: wrongly skipping a link
   * only costs a cache-warmup, wrongly fetching one costs real actions.
   */
  static SIDE_EFFECT_KEYWORDS = [
    "logout", "log-out", "signout", "sign-out", "signup", "sign-up", "register",
    "delete", "remove", "destroy", "trash", "purge", "erase",
    "add", "create", "insert",
    "buy", "purchase", "checkout", "check-out", "order", "pay", "payment",
    "sell", "bid", "donate", "tip", "redeem", "claim", "transfer",
    "withdraw", "deposit",
    "cart", "basket",
    "subscribe", "unsubscribe", "follow", "unfollow",
    "like", "unlike", "dislike", "upvote", "downvote", "vote",
    "submit", "send", "invite", "join", "leave",
    "accept", "decline", "approve", "reject", "confirm", "cancel",
    "activate", "deactivate", "enable", "disable", "toggle",
    "ban", "unban", "block", "unblock", "report", "flag",
    "archive", "unarchive", "publish", "unpublish",
    "revoke", "reset", "verify", "lock", "unlock", "dismiss",
  ];

  static SIDE_EFFECT_PATTERN = new RegExp(
    `(?:^|[^a-z])(?:${PrefetchManager.SIDE_EFFECT_KEYWORDS.join("|")})(?:[^a-z]|$)`,
    "i"
  );

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
    loadTimeoutMs = 30000,
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
    this.loadTimeoutMs = loadTimeoutMs;

    this.priorityList = [];
    this.activePrefetchers = 0;
    this.intersectionObserver = null;
    this.observedLinks = new Set();
    // While suspended (current domain blacklisted) nothing queues or loads.
    this.suspended = false;

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
    if (this.suspended)
      return null;

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

  removeResourceEntry(href) {
    const index = this.priorityList.findIndex((r) => r.href === href);
    if (index < 0)
      return;

    const [resource] = this.priorityList.splice(index, 1);
    this.emitResourceRemoved(resource);
  }

  sortPriorityList() {
    this.priorityList.sort((a, b) => {
      const priorityDiff = a.getPriorityLevel() - b.getPriorityLevel();
      if (priorityDiff !== 0) return priorityDiff;
      return a.getStateLevel() - b.getStateLevel();
    });
  }

  /**
   * Drain the queue with up to maxConcurrentPrefetchers loads in flight.
   * Loads are started without awaiting so they truly overlap; each
   * completion re-enters this method to pull the next queued resource.
   * Realtime resources (hovered links, likely clicked next) bypass the
   * concurrency cap so they start the moment they are boosted.
   * A failed prefetch is a normal outcome, never an exception.
   */
  processPriorityList() {
    if (this.suspended)
      return;

    for (;;) {
      const resource = this.priorityList.find((r) => r.isAvailable());

      // No more items to process?
      if (!resource)
        return;

      const hasFreeSlot = this.activePrefetchers < this.maxConcurrentPrefetchers;
      if (!hasFreeSlot && resource.priority !== Priority.REALTIME)
        return;

      ++this.activePrefetchers;
      this.speculativeLoad(resource)
        .catch(() => {})
        .then(() => {
          --this.activePrefetchers;
          this.processPriorityList();
        });
    }
  }

  speculativeLoad(resource) {
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

    if (method === Method.PAGE_PREFETCH && this.supportsSpeculationRules()) {
      const script = document.createElement("script");
      script.type = "speculationrules";
      script.textContent = JSON.stringify({
        prefetch: [{ source: "list", urls: [resource.href] }],
      });
      document.head.appendChild(script);
      resource.linkElement = script;
      resource.state = State.DONE;
      this.emitResourceUpdated(resource);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const link = document.createElement("link");
      link.rel = method;
      link.href = resource.href;

      // A preload without `as` is ignored by the browser (and its load
      // events may never fire), so derive it from the file extension.
      if (method === Method.RESOURCE_PRELOAD)
        link.as = new URL(resource.href).pathname.endsWith(".css") ? "style" : "script";

      resource.linkElement = link;

      let settled = false;
      let timer = null;
      const settle = (state) => {
        if (settled)
          return;
        settled = true;
        clearTimeout(timer);
        resource.settle = null;
        if (resource.state === State.LOADING) {
          resource.state = state;
          this.emitResourceUpdated(resource);
        }
        resolve();
      };
      resource.settle = settle;

      // Free the concurrency slot even if the browser never fires a
      // load event for this link (e.g. an ignored speculative hint).
      timer = setTimeout(() => settle(State.SKIPPED), this.loadTimeoutMs);

      if (method === Method.DNS || method === Method.PRE_CONNECT) {
        // These hints emit no load events; consider them done on insert.
        document.head.appendChild(link);
        settle(State.DONE);
        return;
      }

      link.onload = () => settle(State.DONE);
      link.onerror = () => settle(State.SKIPPED);

      // Append the link to the document head to initiate the prefetch
      document.head.appendChild(link);
    });
  }

  supportsSpeculationRules() {
    return (
      this.enableSpeculationRules &&
      typeof HTMLScriptElement !== "undefined" &&
      typeof HTMLScriptElement.supports === "function" &&
      HTMLScriptElement.supports("speculationrules")
    );
  }

  /**
   * Abort a queued or in-flight resource: mark it aborted, detach its
   * speculative element from the document, and release its slot.
   */
  abortResource(href) {
    const resource = this.priorityList.find((r) => r.href === href);
    if (!resource || resource.isFinished())
      return;

    resource.state = State.ABORTED_MANUALLY;

    if (resource.linkElement && resource.linkElement.parentNode)
      resource.linkElement.parentNode.removeChild(resource.linkElement);

    if (resource.settle)
      resource.settle(State.ABORTED_MANUALLY);

    this.emitResourceUpdated(resource);
  }

  /**
   * Cancel every queued and in-flight prefetch and flush them from the
   * queue so a starting navigation gets the full connection. Finished
   * resources stay for dedup; on SPA pages that intercept the click,
   * the next scan simply re-queues whatever is still relevant.
   */
  cancelAll() {
    const pending = this.priorityList.filter((r) => !r.isFinished());
    if (pending.length === 0)
      return;

    this.priorityList = this.priorityList.filter((r) => r.isFinished());

    pending.forEach((resource) => {
      resource.state = State.ABORTED_MANUALLY;

      if (resource.linkElement && resource.linkElement.parentNode)
        resource.linkElement.parentNode.removeChild(resource.linkElement);

      if (resource.settle)
        resource.settle(State.ABORTED_MANUALLY);

      this.emitResourceRemoved(resource);
    });
  }

  /**
   * Yield to real navigation: a plain left-click on a link means the
   * user is leaving, so all speculative work is cancelled immediately.
   * Clicks that open new tabs/windows or that an SPA router already
   * handled (defaultPrevented) keep prefetching alive.
   */
  setupCancelOnNavigation() {
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented)
        return;

      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;

      const link = event.target && event.target.closest && event.target.closest("a[href]");
      if (!link)
        return;

      const targetName = typeof link.getAttribute === "function" ? link.getAttribute("target") : null;
      if (targetName && targetName.toLowerCase() !== "_self")
        return;

      this.cancelAll();
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

  /**
   * Check whether a URL looks like it triggers a server-side action.
   * @returns {boolean}
   */
  hasSideEffectRisk(url) {
    return PrefetchManager.SIDE_EFFECT_PATTERN.test(url.pathname + url.search);
  }

  getMethodByHref(href) {
    if (typeof href !== "string" || href.trim().toLowerCase().startsWith("javascript:"))
      return null;

    let url;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }

    // Only ever touch web URLs — mailto:, tel:, blob:, file: etc. either
    // make no sense to prefetch or must not be fetched at all.
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return null;

    // Skip hash-only navigation within the current page.
    if (
      url.origin === location.origin &&
      url.pathname === location.pathname &&
      url.search === location.search
    )
      return null;

    // Never speculatively hit endpoints that look state-changing.
    if (this.hasSideEffectRisk(url))
      return null;

    if (!this.allowQueryPrefetch && url.search)
      return null;

    if (url.search) return Method.PRE_CONNECT;
    if (url.pathname.endsWith(".mjs")) return Method.MODULE_PRELOAD;
    if (url.pathname.endsWith(".js")) return Method.RESOURCE_PRELOAD;
    if (url.pathname.endsWith(".css")) return Method.RESOURCE_PRELOAD;
    if (url.hostname === location.hostname) return Method.PAGE_PREFETCH;
    return Method.DNS;
  }

  /**
   * Resolve a raw href into the queue key and prefetch method.
   * DNS/preconnect hints only ever act on the origin, so they are keyed
   * by origin to collapse the many links of one host into one entry;
   * everything else is keyed by the hash-stripped URL.
   * @returns {{href: string, method: string}|null}
   */
  resolveResource(href) {
    const method = this.getMethodByHref(href);
    if (method == null)
      return null;

    const url = new URL(href, location.href);
    const key =
      method === Method.DNS || method === Method.PRE_CONNECT
        ? url.origin
        : url.origin + url.pathname + url.search;

    return { href: key, method };
  }

  /**
   * Check anchor-level opt-outs: explicit file downloads, nofollow
   * (commonly marking action links), and data-no-prefetch.
   * @returns {boolean}
   */
  isPrefetchableAnchor(link) {
    if (typeof link.hasAttribute === "function") {
      if (link.hasAttribute("download") || link.hasAttribute("data-no-prefetch"))
        return false;

      const rel = typeof link.getAttribute === "function" ? link.getAttribute("rel") : null;
      if (rel && /\bnofollow\b/i.test(rel))
        return false;
    }
    return true;
  }

  updateResourcePriority(href, priority) {
    const resource = this.priorityList.find((r) => r.href === href);
    if (!resource)
      return;

    if (!priority)
      resource.restorePriority();
    else
      resource.changePriority(priority);

    this.sortPriorityList();
    this.emitResourceUpdated(resource);
    this.processPriorityList();
  }

  shouldPauseForConnection() {
    if (this.avoidSlowConnections && this.isSlowConnection()) {
      console.log("Prefetching skipped due to slow connection.");
      return true;
    }

    if (this.avoidDataSaver && this.isSavingData()) {
      console.log("Prefetching skipped due to data saver mode.");
      return true;
    }

    return false;
  }

  scanForNewLinks() {
    if (this.suspended || this.shouldPauseForConnection())
      return;

    const links = document.querySelectorAll("a[href]");
    links.forEach((link) => {
      if (!this.isPrefetchableAnchor(link))
        return;

      const target = this.resolveResource(link.href);
      if (target == null)
        return;

      this.addOrUpdateResourceEntry(target.href, target.method, Priority.LOW);
    });
  }

  setupIntersectionObserver() {
    if (this.shouldPauseForConnection())
      return;

    // One observer for the lifetime of the page; repeated scan ticks
    // only attach links that are not yet observed.
    this.intersectionObserver = this.intersectionObserver || new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!this.isPrefetchableAnchor(entry.target))
          return;

        const target = this.resolveResource(entry.target.href);
        if (target == null)
          return;

        if (!entry.isIntersecting) {
          this.updateResourcePriority(target.href);
          return;
        }

        this.addOrUpdateResourceEntry(target.href, target.method, Priority.LOW);
        this.updateResourcePriority(target.href, Priority.NORMAL);
      });
    });

    const links = document.querySelectorAll("a[href]");
    links.forEach((link) => {
      if (!this.observedLinks.has(link)) {
        this.intersectionObserver.observe(link);
        this.observedLinks.add(link);
      }
    });
  }

  setupMouseOverBoost() {
    document.body.addEventListener("mouseover", (event) => {
      const link = event.target.closest("a[href]");
      if (!link)
        return;

      if (!this.isPrefetchableAnchor(link))
        return;

      const target = this.resolveResource(link.href);
      if (target == null)
        return;

      this.addOrUpdateResourceEntry(target.href, target.method, Priority.LOW);
      this.updateResourcePriority(target.href, Priority.REALTIME);

      link.addEventListener(
        "mouseout",
        () => this.updateResourcePriority(target.href),
        { once: true }
      );
    });
  }
}
