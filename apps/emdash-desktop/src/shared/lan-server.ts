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
