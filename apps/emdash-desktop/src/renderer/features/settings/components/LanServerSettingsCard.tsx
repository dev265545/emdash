import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import {
  appSettingsMetaQueryKey,
  invalidateAppSettingsKey,
} from '@renderer/features/settings/app-settings-client';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { Switch } from '@renderer/lib/ui/switch';
import type { AppSettings } from '@shared/core/app-settings';
import type { LanServerStatus } from '@shared/lan-server';
import { SettingRow } from './SettingRow';

const LanServerSettingsCard: React.FC = () => {
  const queryClient = useQueryClient();
  const { value: lanServer, update, isLoading, isSaving } = useAppSettingsKey('lanServer');

  const [status, setStatus] = useState<LanServerStatus>({ state: 'stopped' });
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const poll = () => {
      void rpc.lanServer.getStatus().then(setStatus);
    };
    poll();
    const t = setInterval(poll, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (status.state === 'running') {
      void rpc.lanServer.getQrCode().then(setQrUrl);
    } else {
      setQrUrl(null);
    }
  }, [status.state]);

  const handleEnabledToggle = async (enabled: boolean) => {
    // Persist enabled flag before starting/stopping so a DB failure doesn't
    // leave us running a server that won't auto-start on the next launch.
    const current = await rpc.appSettings.get('lanServer');
    await rpc.appSettings.update('lanServer', {
      ...(current as AppSettings['lanServer']),
      enabled,
    });

    if (enabled) {
      await rpc.lanServer.start();
    } else {
      await rpc.lanServer.stop();
    }

    // Invalidate after start() so the cache picks up any PIN that was just generated.
    await queryClient.cancelQueries({ queryKey: appSettingsMetaQueryKey('lanServer') });
    invalidateAppSettingsKey('lanServer');
  };

  const handleCopyUrl = async () => {
    // Read the URL+PIN directly from the service — avoids stale React Query cache.
    const urlWithPin = await rpc.lanServer.getUrlWithPin();
    if (!urlWithPin) return;
    await rpc.app.clipboardWriteText(urlWithPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegeneratePin = async () => {
    await rpc.lanServer.generatePin();
    invalidateAppSettingsKey('lanServer');
    void rpc.lanServer.getQrCode().then(setQrUrl);
  };

  const disabled = isLoading || isSaving;

  return (
    <div className="flex flex-col gap-0">
      <SettingRow
        title="Enable mobile access"
        description="Serve Emdash on your local network so you can connect from your phone or another device on the same Wi-Fi."
        control={
          <Switch
            checked={lanServer?.enabled ?? false}
            disabled={disabled}
            onCheckedChange={(v) => {
              void handleEnabledToggle(v);
            }}
          />
        }
      />

      <SettingRow
        title="Port"
        description="The port the mobile server listens on. Default: 7788."
        control={
          <input
            type="number"
            min={1024}
            max={65535}
            value={lanServer?.port ?? 7788}
            disabled={disabled}
            onChange={(e) => update({ port: Number(e.target.value) })}
            className="focus:ring-ring w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:ring-1 focus:outline-none"
          />
        }
      />

      <SettingRow
        title="Allow sending messages"
        description="Let connected devices send prompts to running agents. Enable only on trusted networks."
        control={
          <Switch
            checked={lanServer?.writeMode ?? false}
            disabled={disabled}
            onCheckedChange={(v) => update({ writeMode: v })}
          />
        }
      />

      <SettingRow
        title="Start automatically"
        description="Start the mobile server when Emdash launches."
        control={
          <Switch
            checked={lanServer?.autoStartOnLaunch ?? false}
            disabled={disabled}
            onCheckedChange={(v) => update({ autoStartOnLaunch: v })}
          />
        }
      />

      {status.state === 'running' && (
        <div className="bg-muted/20 mt-2 rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-foreground">Running</span>
            <span className="text-sm text-foreground-muted">{status.url}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void handleCopyUrl();
              }}
            >
              {copied ? 'Copied!' : 'Copy URL with PIN'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void handleRegeneratePin();
              }}
            >
              Regenerate PIN
            </Button>
          </div>
          {qrUrl && (
            <div className="mt-4 flex flex-col items-start gap-2">
              <p className="text-xs text-foreground-muted">
                Scan to open on your phone — PIN is embedded in the QR code
              </p>
              <img
                src={qrUrl}
                alt="QR code for mobile access"
                className="h-40 w-40 rounded-lg border border-border"
              />
            </div>
          )}
        </div>
      )}

      {status.state === 'error' && (
        <div className="border-destructive/40 bg-destructive/10 mt-2 rounded-lg border p-3">
          <p className="text-destructive text-sm">Failed to start: {status.error}</p>
        </div>
      )}
    </div>
  );
};

export default LanServerSettingsCard;
