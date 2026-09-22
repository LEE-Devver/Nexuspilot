import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import path from 'node:path';
import type { AgentEventIngressStatus } from './agent-event-ingress-controller.js';

// A socket inode contains no capability data. The bearer token never touches disk.
export function agentCapabilityDirectory(): string | null {
  return process.platform === 'win32' || process.getuid === undefined
    ? null : `/tmp/nexuspilot-events-${process.getuid()}`;
}

export class AgentEventCapability {
  private server: Server | null = null;
  private readonly clients = new Set<Socket>();
  public constructor(private readonly directory: string, private readonly current: () => AgentEventIngressStatus) {}

  public async start(): Promise<void> {
    if (this.server !== null) return;
    await mkdir(this.directory, { mode: 0o700, recursive: true });
    const dir = await lstat(this.directory);
    if (!dir.isDirectory() || dir.uid !== process.getuid?.() || (dir.mode & 0o077) !== 0) {
      throw new Error('Agent capability directory must be owned by the current user with mode 0700');
    }
    const socketPath = path.join(this.directory, 'capability.sock');
    try {
      const old = await lstat(socketPath);
      if (!old.isSocket() || old.uid !== process.getuid?.()) throw new Error('Untrusted agent capability socket');
      await new Promise<void>((resolve, reject) => {
        const probe = createConnection(socketPath);
        probe.setTimeout(300, () => { probe.destroy(); reject(new Error('Agent capability socket is busy')); });
        probe.once('connect', () => { probe.destroy(); reject(new Error('Another NexusPilot ingress is already running')); });
        probe.once('error', (error: NodeJS.ErrnoException) => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
      });
      const stale = await lstat(socketPath);
      if (stale.ino !== old.ino) throw new Error('Agent capability socket changed');
      await unlink(socketPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const server = createServer((socket) => {
      this.clients.add(socket);
      socket.on('error', () => socket.destroy());
      socket.on('close', () => this.clients.delete(socket));
      socket.setTimeout(300, () => socket.destroy());
      const capability = this.current();
      socket.end(JSON.stringify(capability.running ? { endpoint: capability.endpoint, token: capability.token } : {}));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => { server.off('error', reject); resolve(); });
    });
    this.server = server;
    try { await chmod(socketPath, 0o600); } catch (error) { await this.close(); throw error; }
  }

  public async close(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const socket of this.clients) socket.destroy();
    if (server !== null) await new Promise<void>((resolve) => server.close(() => resolve()));
    // Node removes the bound Unix socket on close; the empty private directory is reusable.
  }
}
