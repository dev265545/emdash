import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { app } from 'electron';
import { registerSseHook } from '@main/lib/events';
import type { IDisposable, IInitializable } from '@main/lib/lifecycle';
import { log } from '@main/lib/logger';
import type { LanServerStatus } from '@shared/lan-server';
import { appSettingsService } from '../settings/settings-service';
import { getLanIp } from './lan-ip-resolver';
import { LanServer } from './lan-server';

function getRendererDir(): string {
  return path.join(app.getAppPath(), 'out', 'renderer');
}

function buildCallRpc(
  rpcRouter: Record<string, unknown>
): (channel: string, args: unknown[]) => Promise<unknown> {
  return async (channel: string, args: unknown[]) => {
    const parts = channel.split('.');
    let fn: unknown = rpcRouter;
    for (const part of parts) {
      fn = (fn as Record<string, unknown>)[part];
      if (fn === undefined) throw new Error(`No RPC handler: ${channel}`);
    }
    if (typeof fn !== 'function') throw new Error(`Not callable: ${channel}`);
    return (fn as (...a: unknown[]) => unknown)(...args);
  };
}

class LanServerService implements IInitializable, IDisposable {
  private server = new LanServer();
  private sseCleanup: (() => void) | null = null;
  private status: LanServerStatus = { state: 'stopped' };
  // Serializes concurrent start() calls — prevents two servers from racing to bind the same port
  private startPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    const settings = await appSettingsService.get('lanServer');
    if (settings.autoStartOnLaunch) {
      await this.start().catch((e: unknown) => {
        log.error('LAN server: auto-start failed:', e);
      });
    }
  }

  async start(): Promise<void> {
    if (this.status.state === 'running') return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async _doStart(): Promise<void> {
    this.status = { state: 'starting' };

    try {
      // Read settings once; generate PIN atomically if missing.
      // Re-read before spread to minimize the window for concurrent updates clobbering writeMode etc.
      let settings = await appSettingsService.get('lanServer');
      if (!settings.pin) {
        const pin = this.generatePin();
        settings = { ...settings, pin };
        await appSettingsService.update('lanServer', settings);
      }

      // Lazy-load rpcRouter to avoid circular import at module init time
      const { rpcRouter } = await import('../../rpc.js');
      const callRpc = buildCallRpc(rpcRouter as Record<string, unknown>);

      const port = await this.server.start({
        port: settings.port,
        pin: settings.pin,
        writeMode: settings.writeMode,
        rendererDir: getRendererDir(),
        callRpc,
      });

      const lanIp = getLanIp();
      this.status = {
        state: 'running',
        port,
        url: `http://${lanIp ?? '127.0.0.1'}:${port}`,
        lanIp: lanIp ?? '',
      };

      this.sseCleanup = registerSseHook((channel, data) => {
        this.server.broadcastSSE({ channel, data });
      });

      log.info(`LAN server started at ${this.status.url}`);
    } catch (e) {
      this.status = { state: 'error', error: String(e) };
      log.error('LAN server failed to start:', e);
      throw e;
    }
  }

  async stop(): Promise<void> {
    // If a start is in-flight, wait for it to finish before stopping
    if (this.startPromise) {
      await this.startPromise.catch(() => {});
    }
    this.sseCleanup?.();
    this.sseCleanup = null;
    await this.server.stop();
    this.status = { state: 'stopped' };
    log.info('LAN server stopped');
  }

  generatePin(): string {
    return String(crypto.randomInt(100_000, 999_999));
  }

  getStatus(): LanServerStatus {
    return this.status;
  }

  getUrl(): string | null {
    return this.status.state === 'running' ? this.status.url : null;
  }

  async getQrCode(): Promise<string | null> {
    if (this.status.state !== 'running') return null;
    const settings = await appSettingsService.get('lanServer');
    const url = `${this.status.url}/?pin=${settings.pin}`;
    const qrcode = await import('qrcode');
    return qrcode.toDataURL(url);
  }

  async reconcile(): Promise<void> {
    if (this.status.state !== 'running') return;
    const settings = await appSettingsService.get('lanServer');
    this.server.setWriteMode(settings.writeMode);
  }

  dispose(): void {
    this.sseCleanup?.();
    this.sseCleanup = null;
    this.server.stop();
  }
}

export const lanServerService = new LanServerService();
