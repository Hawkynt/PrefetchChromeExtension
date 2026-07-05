"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { makeDocument, loadScripts } = require("./helpers.js");

function makeUI({ fadeoutDelay = 0, menuDelay = 10, expanded = false } = {}) {
  const doc = makeDocument();
  const env = loadScripts(["enum.js", "prefetch_ui.js"], {
    document: doc,
    setTimeout,
    clearTimeout,
  });
  const ui = new env.PrefetchUI(fadeoutDelay, menuDelay, expanded);
  return { ui, env, doc };
}

function makeResource(env, overrides = {}) {
  return {
    href: "https://example.com/x",
    method: env.Method.PAGE_PREFETCH,
    priority: env.Priority.LOW,
    state: env.State.QUEUED,
    ...overrides,
  };
}

describe("overlay visibility", () => {
  test("given a fresh overlay, then it is invisible AND click-transparent", () => {
    const { ui } = makeUI();
    assert.match(ui.tableContainer.style.cssText, /pointer-events:\s*none/);
    assert.match(ui.tableContainer.style.cssText, /opacity:\s*0/);
  });

  test("given activity, when shown, then it accepts clicks; when hidden, then it lets clicks through", () => {
    const { ui } = makeUI();

    ui.showTable();
    assert.equal(ui.tableContainer.style.pointerEvents, "auto");

    ui.hideTable();
    assert.equal(ui.tableContainer.style.pointerEvents, "none");
  });
});

describe("table entries", () => {
  test("given a resource with markup in its URL, when rendered, then it is written as text, not HTML", () => {
    const { ui, env } = makeUI();
    const evilHref = 'https://example.com/"><img src=x onerror=alert(1)>';
    ui.updateTableEntry(makeResource(env, { href: evilHref }));

    const entry = ui.tableEntries[evilHref];
    assert.equal(entry.innerHTML, undefined); // innerHTML was never assigned
    assert.equal(entry.hrefCell.textContent, evilHref);
  });

  test("given a rendered entry, when the user clicks it, then an abort request is raised instead of mutating state", () => {
    const { ui, env } = makeUI();
    const resource = makeResource(env);
    const requested = [];
    ui.onAbortRequested((href) => requested.push(href));

    ui.updateTableEntry(resource);
    ui.tableEntries[resource.href].dispatchEvent("click");

    assert.deepEqual(requested, [resource.href]);
    assert.equal(resource.state, env.State.QUEUED); // UI did not touch the model
  });

  test("given an entry, when removed, then its DOM node and bookkeeping disappear", () => {
    const { ui, env } = makeUI();
    const resource = makeResource(env);
    ui.updateTableEntry(resource);
    const entry = ui.tableEntries[resource.href];
    assert.ok(entry.parentNode);

    ui.removeTableEntry(resource);

    assert.equal(ui.tableEntries[resource.href], undefined);
    assert.equal(entry.parentNode, null);
  });

  test("given a finished resource, when its fadeout completes, then the entry is fully removed (no unbounded growth)", async () => {
    const { ui, env } = makeUI({ fadeoutDelay: 0 });
    const resource = makeResource(env, { state: env.State.DONE });
    ui.updateTableEntry(resource);
    const entry = ui.tableEntries[resource.href];

    await new Promise((resolve) => setTimeout(resolve, 5));
    entry.dispatchEvent("transitionend");

    assert.equal(ui.tableEntries[resource.href], undefined);
    assert.equal(entry.parentNode, null);
  });

  test("given aborted resources, when counting statistics, then they appear in the display", () => {
    const { ui, env } = makeUI({ fadeoutDelay: 1000 });
    ui.updateTableEntry(makeResource(env, { state: env.State.ABORTED_MANUALLY }));

    assert.match(ui.statisticsDisplay.textContent, /A: 1/);
  });
});

describe("collapsible queue details", () => {
  test("given the default state, then the detailed queue is collapsed and entries land in the hidden container", () => {
    const { ui, env } = makeUI({ fadeoutDelay: 1000 });
    ui.updateTableEntry(makeResource(env));

    assert.equal(ui.entriesContainer.style.display, "none");
    assert.equal(ui.tableEntries["https://example.com/x"].parentNode, ui.entriesContainer);
  });

  test("given a saved expanded state, when constructed with it, then the details are visible", () => {
    const { ui } = makeUI({ expanded: true });
    assert.equal(ui.entriesContainer.style.display, "");
  });

  test("when the header is clicked, then the details toggle and the new state is reported for saving", () => {
    const { ui } = makeUI();
    const reported = [];
    ui.onExpandToggled((expanded) => reported.push(expanded));

    ui.headerRow.dispatchEvent("click");
    assert.equal(ui.entriesContainer.style.display, "");

    ui.headerRow.dispatchEvent("click");
    assert.equal(ui.entriesContainer.style.display, "none");

    assert.deepEqual(reported, [true, false]);
  });
});

describe("header progress bar", () => {
  test("given found links, when some finish, then the fill shows the processed share", () => {
    const { ui, env } = makeUI({ fadeoutDelay: 1000 });
    ui.updateTableEntry(makeResource(env, { href: "https://example.com/1" }));
    ui.updateTableEntry(makeResource(env, { href: "https://example.com/2" }));
    ui.updateTableEntry(makeResource(env, { href: "https://example.com/3" }));
    assert.equal(ui.progressFill.style.width, "0%");

    ui.updateTableEntry(makeResource(env, { href: "https://example.com/1", state: env.State.DONE }));

    assert.equal(ui.progressFill.style.width, "33%");
    assert.match(ui.progressTrack.title, /1 \/ 3/);
  });

  test("given repeated updates of one link, when it walks through its states, then it is counted once", () => {
    const { ui, env } = makeUI({ fadeoutDelay: 1000 });
    const href = "https://example.com/walk";
    ui.updateTableEntry(makeResource(env, { href, state: env.State.QUEUED }));
    ui.updateTableEntry(makeResource(env, { href, state: env.State.LOADING }));
    ui.updateTableEntry(makeResource(env, { href, state: env.State.DONE }));

    assert.equal(ui.progressFill.style.width, "100%");
    assert.match(ui.progressTrack.title, /1 \/ 1/);
  });

  test("given a queued entry removed by cancellation, then it still counts as processed", () => {
    const { ui, env } = makeUI({ fadeoutDelay: 1000 });
    ui.updateTableEntry(makeResource(env, { href: "https://example.com/kept" }));
    ui.updateTableEntry(makeResource(env, { href: "https://example.com/cancelled" }));

    ui.removeTableEntry({ href: "https://example.com/cancelled" });

    assert.equal(ui.progressFill.style.width, "50%");
  });
});
