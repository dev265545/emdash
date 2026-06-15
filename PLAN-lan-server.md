# Plan: LAN Server Mode — Access Emdash from Your Phone

**Feature:** Feature 6 from `IDEAS.md`
**Status:** Planning complete — ready to implement
**Complexity:** Medium
**Files to create:** 6 · **Files to modify:** 7

---

## Problem

Emdash only runs as a desktop Electron app. If the app is running on your workstation
and you want to check on an agent, view task status, or kick off a prompt from your
phone (same Wi-Fi), there's no way to do it.

---

## Core Architecture Insight: Serve the Real Renderer

The entire renderer communicates with the main process through exactly **4 methods** on
`window.electronAPI` (defined in `src/preload/index.ts`):

```typescript
window.electronAPI = {
  invoke(channel, ...args)          // all RPC calls
  eventOn(channel, cb) → unsub()   // subscribe to main-process events
  eventSend(channel, data)          // renderer→main events (rare)
  getPathForFile(file)              // drag-drop file paths (OS-specific)
}
```

`src/renderer/lib/ipc.ts` wires these up:
```typescript
// All RPC calls are: rpc.<namespace>.<method>(...args)
// → window.electronAPI.invoke('<namespace>.<method>', ...args)
export const rpc = createRPCClient<RpcRouter>(window.electronAPI.invoke);

// All event subscriptions are:
// events.on(someEventDef, cb) → window.electronAPI.eventOn(channel, cb)
export const events = createEventEmitter(createRendererAdapter());
```

This means: if we **inject a shim script** into `index.html` before the renderer bundle
loads, replacing `window.electronAPI` with HTTP/SSE equivalents, the full React app
runs in any browser — same MobX stores, same components, same UX. No separate mobile
UI to build or maintain.

```
Browser phone                   LAN Server (main process)
─────────────────               ──────────────────────────
serve index.html + shim  ←──── static files from out/renderer/
POST /rpc {channel, args} ───→  call rpcRouter handler directly
GET  /events (SSE)       ←──── forward from main events bus
```

---

## Architecture Decisions

### 1. HTTP server: native Node `http` — no new deps
Same pattern as `hook-server.ts`. `http.createServer()`, manual routing, listens on
`0.0.0.0` (not `127.0.0.1`) so LAN devices can connect.

### 2. Renderer bundle served as-is from `out/renderer/`
Vite builds with relative asset paths, so the bundle works when served over HTTP.
The LAN server serves `out/renderer/` as a static directory. `index.html` gets the
shim injected on the fly before being sent to the browser.

In dev mode: the LAN server proxies to the Vite dev server (`http://localhost:5173`),
then injects the shim into the proxied HTML response.

### 3. Browser shim replaces `window.electronAPI`
Injected as an inline `<script>` at the top of `<head>` before all other scripts:

```javascript
(function() {
  const PIN = new URLSearchParams(location.search).get('pin') ?? '';
  const BASE = location.origin;

  // Map<channel, Set<callback>> for SSE event fan-out
  const sseListeners = new Map();
  let sseSource = null;

  function ensureSSE() {
    if (sseSource) return;
    sseSource = new EventSource(`${BASE}/events?pin=${encodeURIComponent(PIN)}`);
    sseSource.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      sseListeners.get(msg.channel)?.forEach(cb => cb(msg.data));
    };
    sseSource.onerror = () => {
      sseSource = null; // will reconnect on next eventOn call
    };
  }

  window.electronAPI = {
    invoke: async (channel, ...args) => {
      const res = await fetch(`${BASE}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PIN}`,
        },
        body: JSON.stringify({ channel, args }),
      });
      if (!res.ok) throw new Error(`RPC ${channel} failed: ${res.status}`);
      return res.json();
    },

    eventOn: (channel, cb) => {
      ensureSSE();
      if (!sseListeners.has(channel)) sseListeners.set(channel, new Set());
      sseListeners.get(channel).add(cb);
      return () => sseListeners.get(channel)?.delete(cb);
    },

    eventSend: (channel, data) => {
      // renderer→main events; POST fire-and-forget
      void fetch(`${BASE}/event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PIN}`,
        },
        body: JSON.stringify({ channel, data }),
      }).catch(() => {});
    },

    getPathForFile: () => '',
  };
})();
```

The PIN comes from the URL query param: `http://192.168.1.5:7788/?pin=123456`.
When scanning the QR code, the full URL including PIN is encoded, so the browser
authenticates automatically on load.

### 4. RPC proxy endpoint: `POST /rpc`
The server calls `rpcRouter` methods directly (no IPC round-trip needed — we're in
the same process):

```typescript
import { rpcRouter } from '@main/rpc';

function callRpc(channel: string, args: unknown[]): unknown {
  const parts = channel.split('.');
  let fn: unknown = rpcRouter;
  for (const part of parts) {
    fn = (fn as Record<string, unknown>)[part];
    if (fn === undefined) throw new Error(`No handler: ${channel}`);
  }
  if (typeof fn !== 'function') throw new Error(`Not callable: ${channel}`);
  return (fn as (...a: unknown[]) => unknown)(...args);
}
```

**Channel allowlist by default (security):**
Without write mode, only allow read namespaces:
```
tasks.*, conversations.*, projects.*, git.*, pullRequests.*,
repository.*, search.*, workspace.git.*, workspace.fs.*,
appSettings.get, appSettings.getAll, dependencies.*, telemetry.capture
```

With write mode enabled, additionally allow:
```
pty.sendInput (send message to running agent)
```

Always deny (regardless of write mode):
```
app.quit, ssh.*, update.*, lanServer.*,
appSettings.update, appSettings.set (settings writes)
```

The allowlist is a `Set<string>` of prefix patterns checked with `channel.startsWith(prefix)`.

### 5. SSE for main-process → browser events

The main `events` emitter (in `src/main/lib/events.ts`) calls `win.webContents.send(channel, data)`
to push events to the renderer. We need to also push to SSE clients.

Modify `src/main/lib/events.ts` to add a hook registry alongside the Electron emit:

```typescript
// Added to events.ts
const sseHooks = new Set<(channel: string, data: unknown) => void>();

export function registerSseHook(fn: (channel: string, data: unknown) => void): () => void {
  sseHooks.add(fn);
  return () => sseHooks.delete(fn);
}

// Modified emit in createMainAdapter():
emit: (eventName, data, topic) => {
  const channel = topic ? `${eventName}.${topic}` : eventName;
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  for (const hook of sseHooks) hook(channel, data);  // ← new line
},
```

The LAN server service calls `registerSseHook` during initialization, and the hook
broadcasts to all connected SSE clients:
```typescript
const cleanup = registerSseHook((channel, data) => {
  server.broadcastSSE({ channel, data });
});
```

SSE messages are JSON: `data: {"channel":"tasks.taskCreated","data":{...}}\n\n`

### 6. Auth: PIN + rate limiting
- 6-digit numeric PIN, auto-generated with `crypto.randomInt(100000, 999999)` on first enable
- Stored in settings as a plain string (low-stakes, local-only)
- All requests check `Authorization: Bearer PIN` header or `?pin=PIN` query param
- Rate limit: 10 failed auth attempts per IP per 60s → 5 minute block (in-memory)
- QR code encodes `http://<lanIp>:<port>/?pin=<pin>` — scanning auto-authenticates

### 7. QR code: `qrcode` npm package
Add as a main-process dependency. `lanServerService.getQrCode()` returns a PNG data URL.
The renderer settings card calls it via RPC and shows `<img src={dataUrl} />`.

---

## Settings Schema Changes

### `src/main/core/settings/schema.ts`

Add:
```typescript
export const lanServerSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().min(1024).max(65535).default(7788),
  pin: z.string().default(''),
  writeMode: z.boolean().default(false),
  autoStartOnLaunch: z.boolean().default(false),
});
```

Add `lanServer: lanServerSettingsSchema` to both `APP_SETTINGS_SCHEMA_MAP` and `appSettingsSchema`.

### `src/main/core/settings/settings-registry.ts`

Add to `SETTINGS_DEFAULTS`:
```typescript
lanServer: {
  enabled: false,
  port: 7788,
  pin: '',
  writeMode: false,
  autoStartOnLaunch: false,
},
```

No change needed to `src/shared/core/app-settings.ts` — `AppSettings` is automatically
inferred from `appSettingsSchema` via Zod, so adding `lanServer` to the schema expands
the type automatically.

---

## New Files

### `src/main/core/lan-server/lan-ip-resolver.ts`

```typescript
import { networkInterfaces } from 'node:os';

export function getLanIp(): string | null {
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (!addr.internal && addr.family === 'IPv4') return addr.address;
    }
  }
  return null;
}
```

Returns first non-loopback IPv4. Works on Wi-Fi + Ethernet. VPN/Docker may add
extra interfaces — documented limitation, returns first match.

---

### `src/main/core/lan-server/lan-server.ts`

Core HTTP server class. No framework — native Node `http`.

**Responsibilities:**
- Start/stop lifecycle with configurable port + PIN
- Serve renderer bundle from `rendererDir` (static files)
- Inject shim into `index.html` on the fly
- `POST /rpc` — proxy to rpcRouter with allowlist
- `POST /event` — receive renderer→main events (eventSend)
- `GET /events` — SSE stream, keep connection open, heartbeat every 15s
- `GET /**` — serve static files from renderer dir (CSS, JS, assets)

```typescript
export interface LanServerOptions {
  port: number;
  pin: string;
  writeMode: boolean;
  rendererDir: string;    // path to out/renderer/ or dev server URL
  devServerUrl?: string;  // if set, proxy HTML from here in dev mode
}

export class LanServer {
  private server: http.Server | null = null;
  private sseClients = new Set<http.ServerResponse>();
  private rateLimiter = new Map<string, { count: number; resetAt: number; blockedUntil?: number }>();

  async start(opts: LanServerOptions): Promise<number> { ... }  // returns actual port
  stop(): void { ... }
  broadcastSSE(payload: { channel: string; data: unknown }): void { ... }
}
```

**Route dispatch (inside `http.createServer` callback):**
```
checkAuth(req)  → 401 / 403 if fails (with rate limiting)
POST /rpc       → callRpc(channel, args) → JSON response
POST /event     → dispatch to ipcMain emitter → 200
GET  /events    → add to sseClients, keep open, send heartbeat
GET  /          → read index.html, inject shim, send text/html
GET  /assets/*  → serve from rendererDir, set long cache headers
GET  /**        → serve static file from rendererDir or 404
```

**Shim injection:**
```typescript
function injectShim(html: string, pin: string): string {
  const shim = `<script>\n${buildShimScript(pin)}\n</script>`;
  return html.replace('<head>', `<head>\n${shim}`);
}
```

The shim script is a template literal in `lan-server.ts` — no external file needed.

---

### `src/main/core/lan-server/lan-server-service.ts`

Service wrapper — `IInitializable`, `IDisposable`.

```typescript
class LanServerService implements IInitializable, IDisposable {
  private server = new LanServer();
  private cleanup: (() => void) | null = null;
  private status: LanServerStatus = { state: 'stopped' };

  async initialize(): Promise<void> {
    await appSettingsService.initialize();  // already called, just for type safety
    const settings = appSettingsService.get('lanServer');
    if (settings.autoStartOnLaunch) await this.start();
    // Watch settings changes
    appSettingsService.on('lanServer', () => void this.reconcile());
  }

  async start(): Promise<void> {
    const settings = appSettingsService.get('lanServer');
    const pin = settings.pin || this.generatePin();
    if (!settings.pin) await appSettingsService.update('lanServer', s => ({ ...s, pin }));
    
    const rendererDir = app.isPackaged
      ? path.join(app.getAppPath(), 'out', 'renderer')
      : path.join(__dirname, '..', '..', '..', 'out', 'renderer');  // adjust as needed

    const port = await this.server.start({
      port: settings.port, pin, writeMode: settings.writeMode, rendererDir,
    });
    
    const lanIp = getLanIp();
    this.status = { state: 'running', port, url: `http://${lanIp}:${port}`, lanIp: lanIp ?? '' };

    // Wire SSE hook
    this.cleanup = registerSseHook((channel, data) => this.server.broadcastSSE({ channel, data }));
  }

  async stop(): Promise<void> {
    this.cleanup?.();
    this.cleanup = null;
    this.server.stop();
    this.status = { state: 'stopped' };
  }

  async reconcile(): Promise<void> {
    const settings = appSettingsService.get('lanServer');
    if (!settings.enabled && this.status.state !== 'stopped') await this.stop();
    if (settings.enabled && this.status.state === 'stopped') await this.start();
    // Port/pin change: restart if running
    if (settings.enabled && this.status.state === 'running') {
      const cur = this.status as { port: number };
      if (cur.port !== settings.port) { await this.stop(); await this.start(); }
    }
  }

  generatePin(): string { return String(crypto.randomInt(100_000, 999_999)); }

  getStatus(): LanServerStatus { return this.status; }
  getUrl(): string | null { return this.status.state === 'running' ? this.status.url : null; }

  async getQrCode(): Promise<string | null> {
    if (this.status.state !== 'running') return null;
    const url = `${this.status.url}/?pin=${appSettingsService.get('lanServer').pin}`;
    const qrcode = await import('qrcode');
    return qrcode.toDataURL(url);
  }

  dispose(): void { this.server.stop(); this.cleanup?.(); }
}

export const lanServerService = new LanServerService();
```

---

### `src/main/core/lan-server/controller.ts`

```typescript
export const lanServerController = createRPCController({
  getStatus: (): LanServerStatus => lanServerService.getStatus(),
  start: async () => {
    await lanServerService.start();
    return { success: true };
  },
  stop: async () => {
    await lanServerService.stop();
    return { success: true };
  },
  getUrl: (): string | null => lanServerService.getUrl(),
  getQrCode: (): Promise<string | null> => lanServerService.getQrCode(),
  getLanIp: (): string | null => getLanIp(),
  generatePin: async () => {
    const pin = lanServerService.generatePin();
    await appSettingsService.update('lanServer', (s) => ({ ...s, pin }));
    if (lanServerService.getStatus().state === 'running') {
      await lanServerService.stop();
      await lanServerService.start();
    }
    return pin;
  },
});
```

---

### `src/shared/lan-server.ts`

```typescript
export type LanServerStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; port: number; url: string; lanIp: string }
  | { state: 'error'; error: string };

export interface LanServerSettings {
  enabled: boolean;
  port: number;
  pin: string;
  writeMode: boolean;
  autoStartOnLaunch: boolean;
}
```

---

### `src/renderer/features/settings/components/LanServerSettingsCard.tsx`

```typescript
export const LanServerSettingsCard: React.FC = () => {
  const { value: lanServer, update } = useAppSettingsKey('lanServer');
  const [status, setStatus] = useState<LanServerStatus>({ state: 'stopped' });
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // Poll status every 2s
  useEffect(() => {
    const poll = () => {
      void rpc.lanServer.getStatus().then(setStatus);
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  // Load QR code when running
  useEffect(() => {
    if (status.state === 'running') {
      void rpc.lanServer.getQrCode().then(setQrUrl);
    } else {
      setQrUrl(null);
    }
  }, [status.state]);

  const handleToggle = async (enabled: boolean) => {
    await update({ enabled });
    if (enabled) await rpc.lanServer.start();
    else await rpc.lanServer.stop();
  };

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        title="Enable mobile access"
        description="Serve Emdash on your local network so you can connect from your phone."
        control={
          <Switch
            checked={lanServer?.enabled ?? false}
            onCheckedChange={handleToggle}
          />
        }
      />

      {/* Port */}
      <SettingRow title="Port" description="Default: 7788" control={
        <input
          type="number" min={1024} max={65535}
          value={lanServer?.port ?? 7788}
          onChange={(e) => update({ port: Number(e.target.value) })}
          className="w-24 ..."
        />
      } />

      {/* Write mode */}
      <SettingRow
        title="Allow sending messages"
        description="Let you send prompts to running agents from your phone. Use on trusted networks only."
        control={
          <Switch
            checked={lanServer?.writeMode ?? false}
            onCheckedChange={(v) => update({ writeMode: v })}
          />
        }
      />

      {/* Auto-start */}
      <SettingRow
        title="Start automatically"
        description="Start the mobile server when the app launches."
        control={
          <Switch
            checked={lanServer?.autoStartOnLaunch ?? false}
            onCheckedChange={(v) => update({ autoStartOnLaunch: v })}
          />
        }
      />

      {/* Status + URL */}
      {status.state === 'running' && (
        <div className="...">
          <span className="text-green-500">● Running</span>
          <code>{status.url}/?pin=••••••</code>
          <Button onClick={() => rpc.app.clipboardWriteText(`${status.url}/?pin=${lanServer?.pin}`)}>
            Copy URL
          </Button>
          <Button variant="ghost" onClick={() => rpc.lanServer.generatePin()}>
            Regenerate PIN
          </Button>
        </div>
      )}

      {/* QR code */}
      {qrUrl && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">Scan to open on your phone</p>
          <img src={qrUrl} alt="QR code" className="w-40 h-40 rounded-lg" />
        </div>
      )}
    </div>
  );
};
```

---

## Files to Modify

### `src/main/lib/events.ts`
Add `registerSseHook` export and call hooks inside the `emit` function of `createMainAdapter`.
Minimal change — 5 lines added.

### `src/main/core/settings/schema.ts`
Add `lanServerSettingsSchema` + add to `APP_SETTINGS_SCHEMA_MAP` + `appSettingsSchema`.

### `src/main/core/settings/settings-registry.ts`
Add `lanServer` entry to `SETTINGS_DEFAULTS`.

### `src/main/index.ts`
```typescript
import { lanServerService } from './core/lan-server/lan-server-service';

// After appSettingsService.initialize():
lanServerService.initialize().catch((e) => {
  log.error('Failed to start LAN server service:', e);
});

// In before-quit handler:
lanServerService.dispose();
```

### `src/main/rpc.ts`
```typescript
import { lanServerController } from './core/lan-server/controller';
// Add to rpcRouter:
lanServer: lanServerController,
```

### `src/renderer/features/settings/components/SettingsPage.tsx`
- Add `'mobile'` to `SettingsPageTab` type
- Add tab `{ id: 'mobile', label: 'Mobile' }` to tabs array
- Add `mobile` content entry with `<LanServerSettingsCard />`

---

## New Dependency

```bash
cd apps/emdash-desktop && pnpm add qrcode && pnpm add -D @types/qrcode
```

Used only in `lan-server-service.ts` (main process). Not bundled into renderer.

---

## Renderer Dir Resolution at Runtime

```typescript
function getRendererDir(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'out', 'renderer');
  }
  // Dev: Vite serves the renderer at localhost:5173 (proxy mode)
  // For now, point to the built output if it exists
  return path.join(__dirname, '..', '..', '..', 'out', 'renderer');
}
```

**Dev mode nuance:** In dev, the renderer is served by the Vite dev server (hot reload,
no `out/renderer/` directory). Two options:
1. Require `pnpm run build:renderer` first, then dev LAN server works against the built output
2. Proxy mode: detect dev, forward HTML requests to `http://localhost:5173`, inject shim into
   the proxied response

Start with option 1 for simplicity. Document it. Proxy mode is a Phase 2 enhancement.

---

## Security Considerations

| Risk | Mitigation |
|------|-----------|
| Anyone on LAN can see the URL/port | PIN required on every request |
| PIN brute-force | 10 failures/IP/60s → 5min block (in-memory) |
| Write mode sends agent prompts | Off by default, explicit toggle, UI warning |
| Dangerous RPC calls (quit, SSH writes) | Hard allowlist per namespace |
| PIN stored in plaintext settings | Acceptable — local-only low-stakes auth |
| No HTTPS | Documented; "trusted networks only" warning in UI |

---

## What Works / What Doesn't in Browser

**Works (the main use cases):**
- Task list, task detail, search
- Conversation history + live agent message streaming via SSE
- Git diff viewer, PR list, file changes
- Send messages to running agents (write mode)
- All read-only views in the app

**Doesn't work (graceful degradation):**
- `getPathForFile` → returns `''` (drag-drop file upload, rarely used)
- OS file/directory picker dialogs → button does nothing; page doesn't crash
- PTY terminals → the terminal UI renders but raw PTY input/resize won't work over HTTP
  (acceptable: mobile is for viewing/prompting, not terminal sessions)
- Notifications → browser notifications require permission, different UX
- App quit / update / OS-specific menus → no-op or hidden on mobile screen size

The app doesn't crash on unsupported features — it just shows whatever the RPC handler
returns (usually an error object), and since mobile users won't be doing PTY work,
this is fine in practice.

---

## Implementation Phases

### Phase 1 — Core backend (testable with desktop browser)
1. Settings schema + registry changes
2. `src/main/lib/events.ts` → add `registerSseHook`
3. `src/shared/lan-server.ts` shared types
4. `lan-ip-resolver.ts`
5. `lan-server.ts` — HTTP server, static serve, shim injection, `POST /rpc`, `GET /events`
6. `lan-server-service.ts` — service wrapper
7. Wire into `src/main/index.ts` + `src/main/rpc.ts`
8. Test: open `http://192.168.x.x:7788/?pin=XXXXXX` in desktop browser

### Phase 2 — Settings UI
1. Install `qrcode` dep
2. `LanServerSettingsCard.tsx` component
3. Wire into `SettingsPage.tsx` under new "Mobile" tab
4. Test: toggle on/off, QR appears, copy URL works

### Phase 3 — Polish + write mode
1. Verify RPC allowlist covers all important read paths
2. Wire `pty.sendInput` for write mode (or equivalent message-send path)
3. Test on actual phone: load, navigate tasks, watch SSE updates
4. Handle SSE reconnect on mobile network switch

### Phase 4 — Dev mode proxy (optional)
Proxy HTML from Vite dev server, inject shim into proxied response.
Lets you develop LAN server features without a production build.

---

## File Map Summary

```
NEW:
  src/main/core/lan-server/lan-ip-resolver.ts
  src/main/core/lan-server/lan-server.ts
  src/main/core/lan-server/lan-server-service.ts
  src/main/core/lan-server/controller.ts
  src/shared/lan-server.ts
  src/renderer/features/settings/components/LanServerSettingsCard.tsx

MODIFIED:
  src/main/lib/events.ts                         (+5 lines for SSE hook)
  src/main/core/settings/schema.ts               (+lanServerSettingsSchema)
  src/main/core/settings/settings-registry.ts    (+defaults)
  src/main/index.ts                              (+init + dispose)
  src/main/rpc.ts                                (+lanServerController)
  src/renderer/features/settings/components/SettingsPage.tsx  (+Mobile tab)
```

---

## Open Questions (resolve during implementation)

1. **`appSettingsService.on`** — Does the settings service emit per-key change events?
   Check `src/main/core/settings/settings-service.ts` for the event API. If not, poll
   in `reconcile()` on a timer instead.

2. **Dev renderer dir path** — Confirm the exact `__dirname`-relative path to
   `out/renderer/` in dev mode, or decide on proxy mode from the start.

3. **Write mode / send-input path** — Check `src/main/core/pty/controller.ts` for
   `sendInput`. Confirm the call signature and whether it works in write mode for
   sending messages to a running Claude session.

4. **Asset paths in built renderer** — Confirm Vite builds with relative (`./`) not
   absolute (`/`) asset paths. If absolute, the LAN server needs to serve everything
   at root which it already does.

5. **`appSettingsService.update` signature** — Check the actual method signature in
   `settings-service.ts` to confirm it accepts a partial update or a mapper function.

---

## Merge Gate

```bash
pnpm run format && pnpm run lint && pnpm run typecheck && pnpm run test
```
