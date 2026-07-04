/**
 * Per-domain disable list. Entries map a hostname to an expiry:
 * Blacklist.PERMANENT (0) disables forever, any other value is an
 * epoch-ms timestamp after which prefetching resumes automatically.
 * An entry covers its own hostname and every subdomain of it.
 * All functions are pure; the current time is always passed in.
 */
const Blacklist = Object.freeze({
  PERMANENT: 0,

  /** The entry hostname covering the given host, or null. */
  entryFor(entries, hostname) {
    if (!entries)
      return null;

    const host = hostname.toLowerCase();
    const covering = Object.keys(entries).find(
      (entry) => host === entry || host.endsWith("." + entry)
    );
    return covering === undefined ? null : covering;
  },

  /** The expiry of the covering entry, or null if none covers. */
  expiryFor(entries, hostname) {
    const entry = Blacklist.entryFor(entries, hostname);
    return entry === null ? null : entries[entry];
  },

  /** Whether prefetching is currently disabled for the host. */
  covers(entries, hostname, now) {
    const expiry = Blacklist.expiryFor(entries, hostname);
    if (expiry === null)
      return false;

    return expiry === Blacklist.PERMANENT || expiry > now;
  },

  /** Disable a host for durationMs, or forever when durationMs is null. */
  add(entries, hostname, durationMs, now) {
    return {
      ...(entries || {}),
      [hostname.toLowerCase()]:
        durationMs == null ? Blacklist.PERMANENT : now + durationMs,
    };
  },

  /** Re-enable a host by dropping its exact entry. */
  remove(entries, hostname) {
    const next = { ...(entries || {}) };
    delete next[hostname.toLowerCase()];
    return next;
  },

  /**
   * Scope choices for disabling a host, from the exact hostname down to
   * the registrable domain, most specific first. Multi-part public
   * suffixes (co.uk, com.au, ...) are detected heuristically — two
   * trailing labels of up to three characters — and never offered as a
   * scope themselves; when in doubt the list stays more specific rather
   * than broader. IP addresses and dotless hosts yield a single choice.
   */
  scopesFor(hostname) {
    const host = hostname.toLowerCase();
    if (host.startsWith("[") || /^[0-9.]+$/.test(host) || !host.includes("."))
      return [host];

    const labels = host.split(".");
    const lastLabel = labels[labels.length - 1];
    const secondLastLabel = labels[labels.length - 2];
    const suffixLabels = lastLabel.length <= 3 && secondLastLabel.length <= 3 ? 3 : 2;
    if (labels.length <= suffixLabels)
      return [host];

    const scopes = [];
    for (let i = 0; i <= labels.length - suffixLabels; ++i)
      scopes.push(labels.slice(i).join("."));
    return scopes;
  },

  /** Drop expired temporary entries; permanent ones stay. */
  purgeExpired(entries, now) {
    const next = {};
    Object.entries(entries || {}).forEach(([host, expiry]) => {
      if (expiry === Blacklist.PERMANENT || expiry > now)
        next[host] = expiry;
    });
    return next;
  },
});
