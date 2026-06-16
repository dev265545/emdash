import { ipcMain } from 'electron';
import { getMainWindow } from '@main/app/window';
import { createEventEmitter, type EmitterAdapter } from '@shared/lib/ipc/events';

const sseHooks = new Set<(channel: string, data: unknown) => void>();

// Only forward events on these prefixes to LAN SSE clients.
// Events use colon namespaces (e.g. 'pty:data', 'task:created').
// Auth flows (github:auth, ssh:connection-event, update:*) are intentionally excluded.
const SSE_ALLOWED_PREFIXES = [
  'task:',
  'pty:',
  'plan:',
  'agent:',
  'git:',
  'pr:',
  'repo-group:',
  'group-task:',
  'automation:',
  'resource-monitor:',
  'conversation:',
];

export function registerSseHook(fn: (channel: string, data: unknown) => void): () => void {
  sseHooks.add(fn);
  return () => sseHooks.delete(fn);
}

function createMainAdapter(): EmitterAdapter {
  return {
    emit: (eventName: string, data: unknown, topic?: string) => {
      const channel = topic ? `${eventName}.${topic}` : eventName;
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
      if (SSE_ALLOWED_PREFIXES.some((p) => channel.startsWith(p))) {
        for (const hook of sseHooks) hook(channel, data);
      }
    },
    on: (eventName: string, cb: (data: unknown) => void, topic?: string) => {
      const channel = topic ? `${eventName}.${topic}` : eventName;
      const handler = (_e: Electron.IpcMainEvent, data: unknown) => cb(data);
      ipcMain.on(channel, handler);
      return () => ipcMain.removeListener(channel, handler);
    },
  };
}

export const events = createEventEmitter(createMainAdapter());
