"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { makeDocument, loadScripts } = require("./helpers.js");

function makeUI({ fadeoutDelay = 0, menuDelay = 10 } = {}) {
  const doc = makeDocument();
  const env = loadScripts(["enum.js", "prefetch_ui.js"], {
    document: doc,
    setTimeout,
    clearTimeout,
  });
  const ui = new env.PrefetchUI(fadeoutDelay, menuDelay);
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
