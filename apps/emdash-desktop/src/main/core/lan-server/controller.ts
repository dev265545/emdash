import type { LanServerStatus } from '@shared/lan-server';
import { createRPCController } from '@shared/lib/ipc/rpc';
import { appSettingsService } from '../settings/settings-service';
import { getLanIp } from './lan-ip-resolver';
import { lanServerService } from './lan-server-service';

export const lanServerController = createRPCController({
  getStatus: (): LanServerStatus => lanServerService.getStatus(),

  start: async (): Promise<{ success: boolean }> => {
    await lanServerService.start();
    return { success: true };
  },

  stop: async (): Promise<{ success: boolean }> => {
    await lanServerService.stop();
    return { success: true };
  },

  getUrl: (): string | null => lanServerService.getUrl(),

  getUrlWithPin: async (): Promise<string | null> => {
    const status = lanServerService.getStatus();
    if (status.state !== 'running') return null;
    const settings = await appSettingsService.get('lanServer');
    return `${status.url}/?pin=${settings.pin}`;
  },

  getQrCode: (): Promise<string | null> => lanServerService.getQrCode(),

  getLanIp: (): string | null => getLanIp(),

  generatePin: async (): Promise<string> => {
    const pin = lanServerService.generatePin();
    const current = await appSettingsService.get('lanServer');
    await appSettingsService.update('lanServer', { ...current, pin });
    if (lanServerService.getStatus().state === 'running') {
      await lanServerService.stop();
      await lanServerService.start();
    }
    return pin;
  },
});
