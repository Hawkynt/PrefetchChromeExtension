"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  FakeElement,
  makeAnchor,
  makeClickEvent,
  makeBrowserGlobals,
  loadScripts,
  flushMicrotasks,
} = require("./helpers.js");

const SCRIPTS = ["enum.js", "prefetch_manager.js"];

function makeManager(options = {}, globalOverrides = {}) {
  const globals = makeBrowserGlobals(globalOverrides);
  const env = loadScripts(SCRIPTS, globals);
  const manager = new env.PrefetchManager({
    enableMethodPrefetch: true,
    enableMethodPreload: true,
    enableMethodModulepreload: true,
    enableMethodPreconnect: true,
    enableMethodDns: true,
    maxConcurrentPrefetchers: 1,
    loadTimeoutMs: 20,
    ...options,
  });
  return { manager, env, globals };
}

function headLinks(globals) {
  return globals.document.head.children;
}

describe("Resource priority stack", () => {
  test("given a boosted resource, when the boost ends, then the previous priority is restored", () => {
    const { env } = makeManager();
    const resource = new env.Resource("https://example.com/a", env.Method.PAGE_PREFETCH, env.Priority.LOW, env.State.QUEUED);

    resource.changePriority(env.Priority.REALTIME);
    assert.equal(resource.priority, env.Priority.REALTIME);

    resource.restorePriority();
    assert.equal(resource.priority, env.Priority.LOW);
  });

  test("given the same priority twice, when restoring, then the stack does not underflow", () => {
    const { env } = makeManager();
    const resource = new env.Resource("https://example.com/a", env.Method.PAGE_PREFETCH, env.Priority.LOW, env.State.QUEUED);

    resource.changePriority(env.Priority.LOW); // no-op, must not push
    resource.restorePriority();
    resource.restorePriority(); // empty stack, must not throw
    assert.equal(resource.priority, env.Priority.LOW);
  });
});

describe("URL scheme and same-page filtering", () => {
  test("given non-web schemes, when resolving, then they are rejected", () => {
    const { manager } = makeManager();
    for (const href of [
      "javascript:void(0)",
      "mailto:someone@example.com",
      "tel:+491234567",
      "ftp://example.com/file.zip",
      "blob:https://example.com/uuid",
    ])
      assert.equal(manager.resolveResource(href), null, href);
  });

  test("given a hash-only link to the current page, when resolving, then it is rejected", () => {
    const { manager } = makeManager();
    assert.equal(manager.resolveResource("https://example.com/page#section"), null);
  });

  test("given a normal same-host page link, when resolving, then it maps to page prefetch", () => {
    const { manager, env } = makeManager();
    const target = manager.resolveResource("https://example.com/articles/news");
    assert.equal(target.method, env.Method.PAGE_PREFETCH);
    assert.equal(target.href, "https://example.com/articles/news");
  });
});

describe("side-effect safety", () => {
  test("given links that look state-changing, when resolving, then they are never prefetched", () => {
    const { manager } = makeManager({ allowQueryPrefetch: true });
    for (const href of [
      "https://example.com/logout",
      "https://example.com/account/delete",
      "https://example.com/cart/add/123",
      "https://example.com/posts/42/like",
      "https://example.com/newsletter/subscribe",
      "https://example.com/newsletter/unsubscribe/token123",
      "https://example.com/shop/checkout",
      "https://example.com/shop/buy?item=1",
      "https://example.com/api?action=vote&id=9",
      "https://example.com/orders/77/cancel",
      "https://example.com/follow/user8",
      "https://example.com/email/confirm/abcdef",
      "https://example.com/submit",
    ])
      assert.equal(manager.resolveResource(href), null, href);
  });

  test("given harmless links containing action words as substrings, when resolving, then they still prefetch", () => {
    const { manager } = makeManager();
    // "news" must not match "new", "blogpost" must not match "post" etc.
    for (const href of [
      "https://example.com/news/today",
      "https://example.com/blog/removals-in-history", // "removals" !== "remove"
      "https://example.com/likeness-in-art",          // "likeness" !== "like"
    ])
      assert.notEqual(manager.resolveResource(href), null, href);
  });

  test("given anchor-level opt-outs, when scanning, then those anchors are skipped", () => {
    const { manager, globals } = makeManager();
    globals.document.links = [
      makeAnchor("https://example.com/file.zip", { download: "" }),
      makeAnchor("https://example.com/somewhere", { rel: "nofollow" }),
      makeAnchor("https://example.com/elsewhere", { "data-no-prefetch": "" }),
      makeAnchor("https://example.com/fine"),
    ];

    manager.scanForNewLinks();

    assert.equal(manager.priorityList.length, 1);
    assert.equal(manager.priorityList[0].href, "https://example.com/fine");
  });
});

describe("method selection and prefetch execution", () => {
  test("given a stylesheet link, when prefetched, then preload carries as=style", async () => {
    const { manager, env, globals } = makeManager();
    manager.addOrUpdateResourceEntry("https://example.com/theme.css", env.Method.RESOURCE_PRELOAD, env.Priority.LOW);
    await flushMicrotasks();

    const link = headLinks(globals)[0];
    assert.equal(link.rel, "preload");
    assert.equal(link.as, "style");
    link.onload();
  });

  test("given a script link, when prefetched, then preload carries as=script", async () => {
    const { manager, env, globals } = makeManager();
    manager.addOrUpdateResourceEntry("https://example.com/app.js", env.Method.RESOURCE_PRELOAD, env.Priority.LOW);
    await flushMicrotasks();

    const link = headLinks(globals)[0];
    assert.equal(link.as, "script");
    link.onload();
  });

  test("given a .mjs module, when resolving, then modulepreload is chosen", () => {
    const { manager, env } = makeManager();
    assert.equal(manager.resolveResource("https://example.com/lib.mjs").method, env.Method.MODULE_PRELOAD);
  });

  test("given cross-host links, when resolving, then they collapse to one dns entry per origin", () => {
    const { manager, env, globals } = makeManager();
    globals.document.links = [
      makeAnchor("https://other.example.org/a"),
      makeAnchor("https://other.example.org/b"),
      makeAnchor("https://other.example.org/c"),
    ];

    manager.scanForNewLinks();

    assert.equal(manager.priorityList.length, 1);
    assert.equal(manager.priorityList[0].href, "https://other.example.org");
    assert.equal(manager.priorityList[0].method, env.Method.DNS);
  });

  test("given a dns hint, when inserted, then it completes immediately", async () => {
    const { manager, env } = makeManager();
    const resource = manager.addOrUpdateResourceEntry("https://other.example.org", env.Method.DNS, env.Priority.LOW);
    await flushMicrotasks();
    assert.equal(resource.state, env.State.DONE);
  });
});

describe("queue draining", () => {
  test("given a failing prefetch, when it errors, then the next queued resource still runs", async () => {
    const { manager, env, globals } = makeManager();
    const first = manager.addOrUpdateResourceEntry("https://example.com/one", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    const second = manager.addOrUpdateResourceEntry("https://example.com/two", env.Method.PAGE_PREFETCH, env.Priority.LOW);

    assert.equal(first.state, env.State.LOADING);
    assert.equal(second.state, env.State.QUEUED);

    headLinks(globals)[0].onerror();
    await flushMicrotasks();

    assert.equal(first.state, env.State.SKIPPED);
    assert.equal(second.state, env.State.LOADING);
    headLinks(globals)[1].onload();
    await flushMicrotasks();
    assert.equal(second.state, env.State.DONE);
  });

  test("given max 2 prefetchers, when 3 resources queue, then exactly 2 load concurrently", async () => {
    const { manager, env, globals } = makeManager({ maxConcurrentPrefetchers: 2 });
    const resources = ["a", "b", "c"].map((name) =>
      manager.addOrUpdateResourceEntry(`https://example.com/${name}`, env.Method.PAGE_PREFETCH, env.Priority.LOW)
    );

    const states = resources.map((r) => r.state);
    assert.deepEqual(states, [env.State.LOADING, env.State.LOADING, env.State.QUEUED]);

    headLinks(globals)[0].onload();
    await flushMicrotasks();
    assert.equal(resources[2].state, env.State.LOADING);

    globals.document.head.children.forEach((link) => link.onload && link.onload());
    await flushMicrotasks();
  });

  test("given a hint the browser silently ignores, when the timeout passes, then the slot is freed", async () => {
    const { manager, env } = makeManager({ loadTimeoutMs: 10 });
    const resource = manager.addOrUpdateResourceEntry("https://example.com/ignored", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    assert.equal(resource.state, env.State.LOADING);

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(resource.state, env.State.SKIPPED);
    assert.equal(manager.activePrefetchers, 0);
  });

  test("given a priority boost, when applied, then processing is triggered without waiting for a scan", () => {
    const { manager, env } = makeManager({ maxConcurrentPrefetchers: 0 });
    const resource = manager.addOrUpdateResourceEntry("https://example.com/late", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    assert.equal(resource.state, env.State.QUEUED);

    manager.maxConcurrentPrefetchers = 1;
    manager.updateResourcePriority("https://example.com/late", env.Priority.REALTIME);

    assert.equal(resource.state, env.State.LOADING);
    assert.equal(resource.priority, env.Priority.REALTIME);
  });
});

describe("aborting", () => {
  test("given a queued resource, when aborted, then it never loads", () => {
    const { manager, env } = makeManager({ maxConcurrentPrefetchers: 0 });
    const resource = manager.addOrUpdateResourceEntry("https://example.com/q", env.Method.PAGE_PREFETCH, env.Priority.LOW);

    manager.abortResource("https://example.com/q");

    assert.equal(resource.state, env.State.ABORTED_MANUALLY);
    manager.maxConcurrentPrefetchers = 1;
    manager.processPriorityList();
    assert.equal(resource.state, env.State.ABORTED_MANUALLY);
  });

  test("given an in-flight resource, when aborted, then its link is detached and the slot freed", async () => {
    const { manager, env, globals } = makeManager();
    const resource = manager.addOrUpdateResourceEntry("https://example.com/inflight", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    assert.equal(resource.state, env.State.LOADING);
    assert.equal(headLinks(globals).length, 1);

    manager.abortResource("https://example.com/inflight");
    await flushMicrotasks();

    assert.equal(resource.state, env.State.ABORTED_MANUALLY);
    assert.equal(headLinks(globals).length, 0);
    assert.equal(manager.activePrefetchers, 0);
  });
});

describe("speculation rules", () => {
  test("given browser support and the setting enabled, when prefetching a page, then a speculationrules script is injected", async () => {
    const { manager, env, globals } = makeManager(
      { enableSpeculationRules: true },
      { HTMLScriptElement: { supports: (type) => type === "speculationrules" } }
    );
    const resource = manager.addOrUpdateResourceEntry("https://example.com/spec", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    await flushMicrotasks();

    assert.equal(resource.state, env.State.DONE);
    const script = globals.document.head.children[0];
    assert.equal(script.tagName, "SCRIPT");
    assert.equal(script.type, "speculationrules");
    assert.deepEqual(JSON.parse(script.textContent), {
      prefetch: [{ source: "list", urls: ["https://example.com/spec"] }],
    });
  });

  test("given no browser support, when prefetching a page, then it falls back to a prefetch link", async () => {
    const { manager, env, globals } = makeManager({ enableSpeculationRules: true });
    manager.addOrUpdateResourceEntry("https://example.com/fallback", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    await flushMicrotasks();

    const link = headLinks(globals)[0];
    assert.equal(link.rel, "prefetch");
    link.onload();
  });
});

describe("hover realtime boost", () => {
  test("given all slots busy, when a link is boosted to realtime, then it starts loading immediately anyway", () => {
    const { manager, env } = makeManager({ maxConcurrentPrefetchers: 1 });
    const busy = manager.addOrUpdateResourceEntry("https://example.com/busy", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    const hovered = manager.addOrUpdateResourceEntry("https://example.com/hovered", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    assert.equal(busy.state, env.State.LOADING);
    assert.equal(hovered.state, env.State.QUEUED); // cap of 1 is exhausted

    manager.updateResourcePriority("https://example.com/hovered", env.Priority.REALTIME);

    assert.equal(hovered.state, env.State.LOADING);
    assert.equal(busy.state, env.State.LOADING); // nothing was preempted
  });

  test("given free slots, when a normal-priority resource queues, then the cap still applies", () => {
    const { manager, env } = makeManager({ maxConcurrentPrefetchers: 1 });
    manager.addOrUpdateResourceEntry("https://example.com/one", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    const second = manager.addOrUpdateResourceEntry("https://example.com/two", env.Method.PAGE_PREFETCH, env.Priority.LOW);

    assert.equal(second.state, env.State.QUEUED);
  });
});

describe("cancel on navigation", () => {
  test("given queued and in-flight prefetches, when cancelAll runs, then hints are detached and the queue is flushed", async () => {
    const { manager, env, globals } = makeManager({ maxConcurrentPrefetchers: 1 });
    const done = manager.addOrUpdateResourceEntry("https://other.example.org", env.Method.DNS, env.Priority.LOW);
    await flushMicrotasks(); // dns completes instantly, freeing its slot
    const loading = manager.addOrUpdateResourceEntry("https://example.com/loading", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    const queued = manager.addOrUpdateResourceEntry("https://example.com/queued", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    assert.equal(done.state, env.State.DONE);
    assert.equal(loading.state, env.State.LOADING);
    assert.equal(queued.state, env.State.QUEUED);

    const removed = [];
    manager.onResourceRemoved((resource) => removed.push(resource.href));

    manager.cancelAll();
    await flushMicrotasks();

    assert.equal(loading.state, env.State.ABORTED_MANUALLY);
    assert.equal(queued.state, env.State.ABORTED_MANUALLY);
    // The in-flight prefetch link is gone from the head; the completed dns hint stays.
    assert.equal(headLinks(globals).filter((link) => link.rel === "prefetch").length, 0);
    assert.deepEqual(removed.sort(), ["https://example.com/loading", "https://example.com/queued"]);
    // Only the finished resource remains for dedup; slots are free again.
    assert.deepEqual(manager.priorityList.map((r) => r.href), ["https://other.example.org"]);
    assert.equal(manager.activePrefetchers, 0);
  });

  test("given cancelled resources, when the page is rescanned (SPA kept living), then links can be queued again", async () => {
    const { manager, env, globals } = makeManager();
    globals.document.links = [makeAnchor("https://example.com/again")];
    manager.scanForNewLinks();
    manager.cancelAll();
    await flushMicrotasks();

    manager.scanForNewLinks();

    const resource = manager.priorityList.find((r) => r.href === "https://example.com/again");
    assert.ok(resource);
    assert.notEqual(resource.state, env.State.ABORTED_MANUALLY);
  });

  test("given a plain left-click on a link, when navigation will proceed, then everything is cancelled", () => {
    const { manager, env, globals } = makeManager();
    const resource = manager.addOrUpdateResourceEntry("https://example.com/pending", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    manager.setupCancelOnNavigation();

    globals.document.dispatchEvent("click", makeClickEvent(makeAnchor("https://example.com/clicked")));

    assert.equal(resource.state, env.State.ABORTED_MANUALLY);
  });

  test("given modified clicks, new-tab links or SPA-handled clicks, when clicked, then prefetching keeps running", () => {
    const { manager, env, globals } = makeManager();
    const resource = manager.addOrUpdateResourceEntry("https://example.com/pending", env.Method.PAGE_PREFETCH, env.Priority.LOW);
    manager.setupCancelOnNavigation();
    const anchor = makeAnchor("https://example.com/clicked");

    globals.document.dispatchEvent("click", makeClickEvent(anchor, { ctrlKey: true }));
    globals.document.dispatchEvent("click", makeClickEvent(anchor, { button: 1 }));
    globals.document.dispatchEvent("click", makeClickEvent(anchor, { defaultPrevented: true }));
    globals.document.dispatchEvent("click", makeClickEvent(makeAnchor("https://example.com/tab", { target: "_blank" })));
    globals.document.dispatchEvent("click", makeClickEvent(new FakeElement("button")));

    assert.equal(resource.state, env.State.LOADING);
  });
});

describe("per-domain suspension", () => {
  test("given a suspended manager, when links are scanned or added, then nothing queues or loads", () => {
    const { manager, env, globals } = makeManager();
    manager.suspended = true;
    globals.document.links = [makeAnchor("https://example.com/blocked-site-page")];

    manager.scanForNewLinks();
    const direct = manager.addOrUpdateResourceEntry("https://example.com/direct", env.Method.PAGE_PREFETCH, env.Priority.LOW);

    assert.equal(direct, null);
    assert.equal(manager.priorityList.length, 0);
    assert.equal(globals.document.head.children.length, 0);
  });

  test("given suspension is lifted, when scanning again, then prefetching resumes", () => {
    const { manager, globals } = makeManager();
    manager.suspended = true;
    globals.document.links = [makeAnchor("https://example.com/later")];
    manager.scanForNewLinks();
    assert.equal(manager.priorityList.length, 0);

    manager.suspended = false;
    manager.scanForNewLinks();

    assert.equal(manager.priorityList.length, 1);
  });
});

describe("intersection observer reuse", () => {
  test("given repeated scan ticks, when setting up observation, then a single observer instance is reused", () => {
    const instances = [];
    class FakeIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        this.observed = [];
        instances.push(this);
      }
      observe(element) {
        this.observed.push(element);
      }
    }

    const { manager, globals } = makeManager({}, { IntersectionObserver: FakeIntersectionObserver });
    globals.document.links = [makeAnchor("https://example.com/v1")];

    manager.setupIntersectionObserver();
    globals.document.links.push(makeAnchor("https://example.com/v2"));
    manager.setupIntersectionObserver();
    manager.setupIntersectionObserver();

    assert.equal(instances.length, 1);
    assert.equal(instances[0].observed.length, 2);
  });
});
