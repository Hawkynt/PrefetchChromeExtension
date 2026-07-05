const Priority = Object.freeze({
  REALTIME: "realtime",
  HIGH: "high",
  NORMAL: "normal",
  LOW: "low",
});

const State = Object.freeze({
  QUEUED: "queued",
  LOADING: "loading",
  DONE: "done",
  SKIPPED: "skipped",
  ABORTED_MANUALLY: "aborted manually",
});

const Method = Object.freeze({
  DNS: "dns-prefetch",
  PRE_CONNECT: "preconnect",
  PAGE_PREFETCH: "prefetch",
});