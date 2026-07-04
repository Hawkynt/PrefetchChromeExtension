"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadScripts } = require("./helpers.js");

const { Blacklist } = loadScripts(["blacklist.js"], {});
const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

describe("blacklist entries", () => {
  test("given a temporary entry, when within its duration, then the host is covered; afterwards it is not", () => {
    const entries = Blacklist.add({}, "Example.com", 30 * MINUTE, NOW);

    assert.equal(Blacklist.covers(entries, "example.com", NOW + 29 * MINUTE), true);
    assert.equal(Blacklist.covers(entries, "example.com", NOW + 31 * MINUTE), false);
  });

  test("given a permanent entry, when any amount of time passes, then the host stays covered", () => {
    const entries = Blacklist.add({}, "example.com", null, NOW);

    assert.equal(entries["example.com"], Blacklist.PERMANENT);
    assert.equal(Blacklist.covers(entries, "example.com", NOW + 365 * 24 * 60 * MINUTE), true);
  });

  test("given a domain entry, when subdomains are checked, then they are covered but lookalikes are not", () => {
    const entries = Blacklist.add({}, "example.com", null, NOW);

    assert.equal(Blacklist.covers(entries, "www.example.com", NOW), true);
    assert.equal(Blacklist.covers(entries, "shop.www.example.com", NOW), true);
    assert.equal(Blacklist.covers(entries, "evilexample.com", NOW), false);
    assert.equal(Blacklist.entryFor(entries, "www.example.com"), "example.com");
  });

  test("given a removed entry, when checked, then the host is no longer covered", () => {
    let entries = Blacklist.add({}, "example.com", null, NOW);
    entries = Blacklist.remove(entries, "example.com");

    assert.equal(Blacklist.covers(entries, "example.com", NOW), false);
    assert.deepEqual(entries, {});
  });

  test("given mixed entries, when purging, then only expired temporary ones disappear", () => {
    let entries = Blacklist.add({}, "forever.example", null, NOW);
    entries = Blacklist.add(entries, "expired.example", 5 * MINUTE, NOW - 10 * MINUTE);
    entries = Blacklist.add(entries, "active.example", 60 * MINUTE, NOW);

    const purged = Blacklist.purgeExpired(entries, NOW);

    assert.deepEqual(Object.keys(purged).sort(), ["active.example", "forever.example"]);
  });

  test("given no entries at all, when checked, then nothing is covered and nothing crashes", () => {
    assert.equal(Blacklist.covers(undefined, "example.com", NOW), false);
    assert.equal(Blacklist.expiryFor(null, "example.com"), null);
  });
});
