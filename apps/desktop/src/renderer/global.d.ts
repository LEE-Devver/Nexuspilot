import type { NexusPilotApi } from '@nexuspilot/ipc-contracts';

declare global {
  interface Window {
    readonly nexusPilot: NexusPilotApi;
    /** @deprecated temporary preload compatibility alias */
    readonly lnwjud: NexusPilotApi;
  }
}

export {};
