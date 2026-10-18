// Loaded by vitest (setupFiles) and by E2E servers via NODE_OPTIONS=--import.
// Blocks every non-loopback TCP/TLS connect at the socket layer (covers fetch/undici,
// http(s), and any SDK). Loopback stays open for Postgres and the local Next server.
// ponytail: DNS lookups are not blocked (no payload leaves); add a dns.lookup stub if that matters.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);

export class NetworkDeniedError extends Error {
  constructor(target) {
    super(`BasisGuard network deny: outbound connection to ${target} blocked in offline mode`);
    this.name = "NetworkDeniedError";
  }
}

function targetOf(args) {
  const [first, second] = args;
  if (Array.isArray(first)) return targetOf(first); // node's internal normalized-args form
  if (first !== null && typeof first === "object") {
    if (first.path) return null; // unix socket / IPC
    return { host: first.host ?? "localhost", port: first.port };
  }
  if (typeof first === "string" && Number.isNaN(Number(first))) return null; // IPC path
  return { host: typeof second === "string" ? second : "localhost", port: first };
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const target = targetOf(args);
  if (target && !LOOPBACK.has(String(target.host))) {
    throw new NetworkDeniedError(`${target.host}:${target.port}`);
  }
  return originalConnect.apply(this, args);
};

// Runtime canary (E2E only, opt-in via env): prove the patch is installed in THIS process by attempting a
// non-loopback connect (TEST-NET-1, RFC 5737; the patched connect throws before any packet is sent), then
// record the result and every port this process listens on, so the suite can find the server process.
const canaryDir = process.env.BASISGUARD_NETWORK_DENY_CANARY_DIR;
if (canaryDir) {
  let denyActive = false;
  const probe = new net.Socket();
  try {
    probe.connect(9, "192.0.2.1");
  } catch (e) {
    denyActive = e instanceof NetworkDeniedError;
  } finally {
    probe.destroy();
  }
  const marker = { pid: process.pid, ppid: process.ppid, argv: process.argv, denyActive, listening: [] };
  const write = () => {
    try {
      mkdirSync(canaryDir, { recursive: true });
      writeFileSync(join(canaryDir, `${process.pid}.json`), JSON.stringify({ ...marker, title: process.title }));
    } catch {
      // the canary must never break the process it observes
    }
  };
  write();
  // Re-written every second while the process lives (so a cleaned directory refills with live processes
  // only), with the ports its servers currently listen on. Unref'd: it never keeps a process alive.
  const refresh = () => {
    const ports = [];
    for (const h of process._getActiveHandles?.() ?? []) {
      if (h instanceof net.Server && h.listening) {
        const addr = h.address();
        if (addr && typeof addr === "object") ports.push(addr.port);
      }
    }
    marker.listening = ports;
    write();
  };
  setInterval(refresh, 1_000).unref();
}
