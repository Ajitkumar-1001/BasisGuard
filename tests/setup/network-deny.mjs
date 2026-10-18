// Loaded by vitest (setupFiles) and by E2E servers via NODE_OPTIONS=--import.
// Blocks every non-loopback TCP/TLS connect at the socket layer (covers fetch/undici,
// http(s), and any SDK). Loopback stays open for Postgres and the local Next server.
// ponytail: DNS lookups are not blocked (no payload leaves); add a dns.lookup stub if that matters.
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
