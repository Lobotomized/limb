/**
 * Tiny WebRTC signaling server. It only introduces peers: a host creates a room and gets a
 * code, a guest joins with the code, and SDP/ICE messages are relayed between them.
 * No game data ever passes through it.
 *
 *   npm run server            (PORT env var, default 8787; entry: server/main.ts)
 *
 * Protocol (JSON over WebSocket):
 *   -> {type:'create'}                 <- {type:'created', code}
 *   -> {type:'join', code}             <- {type:'joined', code} (guest), {type:'peer-joined'} (host)
 *   -> {type:'signal', data}           <- {type:'signal', data} (to the other peer)
 *                                      <- {type:'peer-left'} | {type:'error', message}
 */
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O: easy to read aloud
const CODE_LEN = 4;
const MAX_ROOMS = 10_000;

interface Room {
  host: WebSocket;
  guest: WebSocket | null;
  created: number;
}

export function startSignalingServer(port: number): { close: () => Promise<void>; port: number } {
  const rooms = new Map<string, Room>();
  const roomOf = new Map<WebSocket, string>();
  const http = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
    res.end(`limb-clash signaling ok, ${rooms.size} rooms\n`);
  });
  const wss = new WebSocketServer({ server: http });
  const send = (ws: WebSocket | null, msg: unknown): void => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const newCode = (): string => {
    for (;;) {
      let c = '';
      for (let i = 0; i < CODE_LEN; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  };
  const leave = (ws: WebSocket): void => {
    const code = roomOf.get(ws);
    if (!code) return;
    roomOf.delete(ws);
    const room = rooms.get(code);
    if (!room) return;
    const other = room.host === ws ? room.guest : room.host;
    send(other, { type: 'peer-left' });
    if (other) roomOf.delete(other);
    rooms.delete(code);
  };
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg: { type?: string; code?: string; data?: unknown };
      try {
        msg = JSON.parse(String(raw)) as typeof msg;
      } catch {
        return send(ws, { type: 'error', message: 'Bad message' });
      }
      if (msg.type === 'create') {
        leave(ws);
        if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'error', message: 'Server full' });
        const code = newCode();
        rooms.set(code, { host: ws, guest: null, created: Date.now() });
        roomOf.set(ws, code);
        send(ws, { type: 'created', code });
      } else if (msg.type === 'join') {
        const code = String(msg.code ?? '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { type: 'error', message: 'No room with that code' });
        if (room.guest) return send(ws, { type: 'error', message: 'Room is full' });
        leave(ws);
        room.guest = ws;
        roomOf.set(ws, code);
        send(ws, { type: 'joined', code });
        send(room.host, { type: 'peer-joined' });
      } else if (msg.type === 'signal') {
        const code = roomOf.get(ws);
        const room = code ? rooms.get(code) : undefined;
        if (!room) return;
        send(room.host === ws ? room.guest : room.host, { type: 'signal', data: msg.data });
      }
    });
    ws.on('close', () => leave(ws));
    ws.on('error', () => leave(ws));
  });
  http.listen(port);
  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}

