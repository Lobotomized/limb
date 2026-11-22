// Signaling server: room codes, join, relay, peer-left, errors.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { startSignalingServer } from '../server/signaling';

const PORT = 18787;
let server: ReturnType<typeof startSignalingServer>;

beforeAll(() => {
  server = startSignalingServer(PORT);
});
afterAll(async () => {
  await server.close();
});

function client(): Promise<{ ws: WebSocket; next: () => Promise<Record<string, unknown>> }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const queue: Record<string, unknown>[] = [];
    const waiters: ((m: Record<string, unknown>) => void)[] = [];
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as Record<string, unknown>;
      const w = waiters.shift();
      if (w) w(m);
      else queue.push(m);
    });
    ws.on('open', () => resolve({ ws, next: () => new Promise((r) => (queue.length ? r(queue.shift()!) : waiters.push(r))) }));
  });
}

describe('signaling server', () => {
  it('creates a room, lets a guest join with the code and relays signals both ways', async () => {
    const host = await client();
    host.ws.send(JSON.stringify({ type: 'create' }));
    const created = await host.next();
    expect(created.type).toBe('created');
    expect(String(created.code)).toMatch(/^[A-Z]{4}$/);
    const guest = await client();
    guest.ws.send(JSON.stringify({ type: 'join', code: String(created.code).toLowerCase() }));
    expect((await guest.next()).type).toBe('joined');
    expect((await host.next()).type).toBe('peer-joined');
    host.ws.send(JSON.stringify({ type: 'signal', data: { sdp: 'offer' } }));
    expect(await guest.next()).toEqual({ type: 'signal', data: { sdp: 'offer' } });
    guest.ws.send(JSON.stringify({ type: 'signal', data: { sdp: 'answer' } }));
    expect(await host.next()).toEqual({ type: 'signal', data: { sdp: 'answer' } });
    // A third peer can't join a full room; unknown codes are rejected.
    const third = await client();
    third.ws.send(JSON.stringify({ type: 'join', code: created.code }));
    expect((await third.next()).message).toBe('Room is full');
    third.ws.send(JSON.stringify({ type: 'join', code: 'QQQQ' }));
    expect((await third.next()).message).toBe('No room with that code');
    // Leaving notifies the other peer.
    guest.ws.close();
    expect((await host.next()).type).toBe('peer-left');
    host.ws.close();
    third.ws.close();
  });
});
