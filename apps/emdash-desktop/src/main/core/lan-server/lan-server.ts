import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { log } from '@main/lib/logger';

export interface LanServerOptions {
  port: number;
  pin: string;
  writeMode: boolean;
  rendererDir: string;
  callRpc: (channel: string, args: unknown[]) => Promise<unknown>;
}

// Channels always blocked regardless of write mode.
// Covers: dangerous mutations, credential access, updater, PIN-bearing responses.
// appSettings responses have the PIN scrubbed before being sent (see scrubResult).
const DENY_CHANNELS = new Set([
  'app.quit',
  'app.relaunch',
  'appSettings.update',
  'appSettings.reset',
  'appSettings.resetField',
  'lanServer.start',
  'lanServer.stop',
  'lanServer.generatePin',
  'lanServer.getUrlWithPin', // embeds PIN
]);

// Namespace prefixes always blocked.
const DENY_PREFIXES = [
  'ssh.', // SSH credential management
  'update.', // auto-updater (triggers restarts/installs)
];

// In read-only mode, additionally block PTY write operations.
const READ_MODE_DENY_PREFIXES = ['pty.sendInput', 'pty.resize'];

function isChannelAllowed(channel: string, writeMode: boolean): boolean {
  if (DENY_CHANNELS.has(channel)) return false;
  for (const prefix of DENY_PREFIXES) {
    if (channel.startsWith(prefix)) return false;
  }
  if (!writeMode) {
    for (const prefix of READ_MODE_DENY_PREFIXES) {
      if (channel === prefix || channel.startsWith(prefix)) return false;
    }
  }
  return true;
}

// Scrub the lanServer PIN from appSettings responses so it's never sent to LAN clients.
function scrubResult(channel: string, args: unknown[], result: unknown): unknown {
  if (typeof result !== 'object' || result === null) return result;

  if (channel === 'appSettings.getAll') {
    const r = result as Record<string, unknown>;
    if (r.lanServer && typeof r.lanServer === 'object') {
      return { ...r, lanServer: { ...(r.lanServer as Record<string, unknown>), pin: '' } };
    }
  }
  if (
    (channel === 'appSettings.get' || channel === 'appSettings.getWithMeta') &&
    args[0] === 'lanServer'
  ) {
    // getWithMeta wraps in { value, defaults, overrides }; get returns plain object
    if ('value' in (result as Record<string, unknown>)) {
      const r = result as Record<string, unknown>;
      const scrubNested = (v: unknown) =>
        typeof v === 'object' && v !== null ? { ...(v as Record<string, unknown>), pin: '' } : v;
      return { ...r, value: scrubNested(r.value), defaults: scrubNested(r.defaults) };
    }
    return { ...(result as Record<string, unknown>), pin: '' };
  }
  return result;
}

function buildShimScript(): string {
  return `(function() {
  // Polyfill crypto.randomUUID — not available on plain HTTP (non-secure context).
  // crypto.getRandomValues IS available over HTTP; only randomUUID/subtle are gated.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    crypto.randomUUID = function() {
      var bytes = new Uint8Array(16);
      if (typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
      } else {
        for (var i = 0; i < 16; i++) bytes[i] = Math.random() * 256 | 0;
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.from(bytes).map(function(b) { return b.toString(16).padStart(2, '0'); });
      return hex[0]+hex[1]+hex[2]+hex[3]+'-'+hex[4]+hex[5]+'-'+hex[6]+hex[7]+'-'+hex[8]+hex[9]+'-'+hex[10]+hex[11]+hex[12]+hex[13]+hex[14]+hex[15];
    };
  }

  var PIN = new URLSearchParams(location.search).get('pin') || '';
  var BASE = location.origin;
  var sseListeners = new Map();
  var sseSource = null;

  function ensureSSE() {
    if (sseSource) return;
    sseSource = new EventSource(BASE + '/events?pin=' + encodeURIComponent(PIN));
    sseSource.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      var listeners = sseListeners.get(msg.channel);
      if (listeners) listeners.forEach(function(cb) { cb(msg.data); });
    };
    sseSource.onerror = function() {
      // Close explicitly to prevent the browser's built-in auto-retry from
      // keeping the old connection alive after we null the reference.
      if (sseSource) { sseSource.close(); sseSource = null; }
      // Auto-reconnect with backoff so existing eventOn() subscribers
      // resume receiving events without needing a full page reload.
      var delay = 3000;
      function reconnect() {
        if (sseListeners.size > 0 && !sseSource) {
          ensureSSE();
          if (!sseSource) setTimeout(reconnect, Math.min(delay *= 2, 30000));
        }
      }
      setTimeout(reconnect, delay);
    };
  }

  window.electronAPI = {
    invoke: function(channel) {
      var args = Array.prototype.slice.call(arguments, 1);
      return fetch(BASE + '/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PIN },
        body: JSON.stringify({ channel: channel, args: args }),
      }).then(function(res) {
        if (res.status === 401) {
          // PIN has changed (server restarted with new PIN). Reload to re-authenticate.
          location.reload();
          throw new Error('Session expired');
        }
        if (!res.ok) throw new Error('RPC ' + channel + ' failed: ' + res.status);
        return res.json();
      });
    },
    eventOn: function(channel, cb) {
      ensureSSE();
      if (!sseListeners.has(channel)) sseListeners.set(channel, new Set());
      sseListeners.get(channel).add(cb);
      return function() {
        var s = sseListeners.get(channel);
        if (s) s.delete(cb);
      };
    },
    eventSend: function(channel, data) {
      void fetch(BASE + '/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + PIN },
        body: JSON.stringify({ channel: channel, data: data }),
      }).catch(function() {});
    },
    getPathForFile: function() { return ''; },
  };
})();`;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return map[ext] ?? 'application/octet-stream';
}

interface RateEntry {
  count: number;
  resetAt: number;
  blockedUntil?: number;
}

const MAX_BODY_BYTES = 1_000_000; // 1 MB

const MAX_SSE_PER_IP = 5;

export class LanServer {
  private server: http.Server | null = null;
  private currentOpts: LanServerOptions | null = null;
  private sseClients = new Set<http.ServerResponse>();
  private sseCountByIp = new Map<string, number>();
  private rateLimiter = new Map<string, RateEntry>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  setWriteMode(writeMode: boolean): void {
    if (this.currentOpts) this.currentOpts.writeMode = writeMode;
  }

  async start(opts: LanServerOptions): Promise<number> {
    if (this.server) await this.stop();
    this.currentOpts = opts;

    const shimScript = buildShimScript();

    const handleRequest = async (req: http.IncomingMessage, res: http.ServerResponse) => {
      // Read currentOpts each request so writeMode changes apply without restart
      const currentOpts = this.currentOpts;
      if (!currentOpts) return;

      const url = new URL(req.url ?? '/', `http://localhost`);
      const pathname = url.pathname;

      // Auth check on all non-static endpoints
      if (
        pathname === '/' ||
        pathname === '/rpc' ||
        pathname === '/event' ||
        pathname === '/events'
      ) {
        if (!this.checkAuth(req, url, currentOpts.pin)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      if (req.method === 'POST' && pathname === '/rpc') {
        await this.handleRpc(req, res, currentOpts);
        return;
      }

      if (req.method === 'POST' && pathname === '/event') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'GET' && pathname === '/events') {
        this.handleSSE(req, res);
        return;
      }

      this.serveStatic(pathname, currentOpts.rendererDir, shimScript, res);
    };

    this.server = http.createServer((req, res) => {
      void handleRequest(req, res).catch((e) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    });

    // SSE heartbeat every 15s to detect dead connections
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.sseClients) {
        try {
          client.write(': heartbeat\n\n');
        } catch {
          this.sseClients.delete(client);
        }
      }
    }, 15_000);

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(opts.port, '0.0.0.0', () => resolve());
      this.server!.on('error', reject);
    });

    return (this.server.address() as { port: number }).port;
  }

  stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        /* ignore */
      }
    }
    this.sseClients.clear();
    this.sseCountByIp.clear();
    if (!this.server) return Promise.resolve();
    const srv = this.server;
    this.server = null;
    return new Promise<void>((resolve) => srv.close(() => resolve()));
  }

  broadcastSSE(payload: { channel: string; data: unknown }): void {
    const msg = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private checkAuth(req: http.IncomingMessage, url: URL, pin: string): boolean {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();

    let entry = this.rateLimiter.get(ip);

    // Block check — if block has expired, reset state entirely
    if (entry?.blockedUntil) {
      if (now < entry.blockedUntil) return false;
      // Block expired: clear so legitimate attempts get a fresh window
      entry.count = 0;
      entry.blockedUntil = undefined;
    }

    const authHeader = req.headers['authorization'];
    const queryPin = url.searchParams.get('pin');
    const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (queryPin ?? '');

    if (provided === pin) {
      if (entry) {
        entry.count = 0;
        entry.blockedUntil = undefined;
      }
      return true;
    }

    // Failed auth — track and potentially block
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + 60_000 };
    } else {
      entry.count++;
      if (entry.count >= 10) {
        entry.blockedUntil = now + 5 * 60_000;
      }
    }
    this.rateLimiter.set(ip, entry);
    return false;
  }

  private async handleRpc(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    opts: LanServerOptions
  ): Promise<void> {
    let body: string;
    try {
      body = await readBody(req);
    } catch (e) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
      return;
    }

    let parsed: { channel: string; args: unknown[] };
    try {
      parsed = JSON.parse(body) as { channel: string; args: unknown[] };
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { channel, args } = parsed;
    if (typeof channel !== 'string' || !Array.isArray(args)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request shape' }));
      return;
    }
    const ip = req.socket.remoteAddress ?? 'unknown';
    if (!isChannelAllowed(channel, opts.writeMode)) {
      log.warn(`LAN RPC [${ip}] ${channel} → 403 (blocked)`);
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Channel not allowed: ${channel}` }));
      return;
    }

    try {
      const raw = await opts.callRpc(channel, args);
      const result = scrubResult(channel, args, raw);
      if (channel === 'pty.start' || channel === 'pty.subscribe') {
        log.info(`LAN agent connect [${ip}] ${channel} args=${JSON.stringify(args)}`);
      } else {
        log.info(`LAN RPC [${ip}] ${channel} → 200`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result ?? null));
    } catch (e) {
      log.warn(`LAN RPC [${ip}] ${channel} → 500: ${String(e)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
  }

  private handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const count = this.sseCountByIp.get(ip) ?? 0;
    if (count >= MAX_SSE_PER_IP) {
      log.warn(`LAN SSE [${ip}] rejected — too many connections (${count})`);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many SSE connections from this IP' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    this.sseClients.add(res);
    this.sseCountByIp.set(ip, count + 1);
    log.info(`LAN SSE [${ip}] connected (total clients: ${this.sseClients.size})`);

    req.on('close', () => {
      this.sseClients.delete(res);
      const n = this.sseCountByIp.get(ip) ?? 1;
      if (n <= 1) this.sseCountByIp.delete(ip);
      else this.sseCountByIp.set(ip, n - 1);
      log.info(`LAN SSE [${ip}] disconnected (total clients: ${this.sseClients.size})`);
    });
  }

  private serveStatic(
    pathname: string,
    rendererDir: string,
    shimScript: string,
    res: http.ServerResponse
  ): void {
    const safePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const filePath = path.join(rendererDir, safePath);

    // Prevent directory traversal: require the resolved path to be strictly
    // inside rendererDir (with separator to avoid prefix-match on siblings).
    const rendererDirWithSep = rendererDir.endsWith(path.sep)
      ? rendererDir
      : rendererDir + path.sep;
    if (!filePath.startsWith(rendererDirWithSep) && filePath !== rendererDir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let content: Buffer;
    try {
      content = fs.readFileSync(filePath);
    } catch {
      // Fall back to index.html for SPA client-side routing
      try {
        content = fs.readFileSync(path.join(rendererDir, 'index.html'));
        const html = content
          .toString('utf8')
          .replace('<head>', `<head>\n<script>\n${shimScript}\n</script>`);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
      }
      return;
    }

    const ext = path.extname(filePath);
    const mimeType = getMimeType(ext);

    if (ext === '.html') {
      const html = content
        .toString('utf8')
        .replace('<head>', `<head>\n<script>\n${shimScript}\n</script>`);
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache',
      });
      res.end(html);
    } else {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      res.end(content);
    }
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy(new Error('Request body too large'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
