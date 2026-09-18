import type { LnwjudApi } from '@nexuspilot/ipc-contracts';

declare global {
  interface Window {
    readonly lnwjud: LnwjudApi;
  }
}

export {};
