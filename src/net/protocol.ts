/**
 * Compact binary packets.
 *   INPUT   [1][ack u32][first u32][count u8][count x 6-byte inputs][senderTick u32]
 *   HASH    [2][tick u32][hash 8 bytes]
 *   PING    [3][id u32][sentMs f64]
 *   PONG    [4][id u32][sentMs f64]
 *   CONTROL [5][seq u32][json utf-8]     (reliable via resend, see ReliableControl)
 *   ACK     [6][seq u32]
 */
import { INPUT_BYTES, readInput, writeInput, type InputFrame } from '../input/input-frame';

export const PacketType = { INPUT: 1, HASH: 2, PING: 3, PONG: 4, CONTROL: 5, ACK: 6 } as const;

export interface InputPacket {
  type: 1;
  /** Highest tick of the receiver's inputs the sender has (contiguously). */
  ack: number;
  first: number;
  inputs: InputFrame[];
  /** Sender's current simulation tick (for time-sync). */
  senderTick: number;
}
export interface HashPacket {
  type: 2;
  tick: number;
  hash: string;
}
export interface PingPacket {
  type: 3 | 4;
  id: number;
  sentMs: number;
}
export interface ControlPacket {
  type: 5;
  seq: number;
  data: unknown;
}
export interface AckPacket {
  type: 6;
  seq: number;
}
export type Packet = InputPacket | HashPacket | PingPacket | ControlPacket | AckPacket;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodePacket(p: Packet): Uint8Array {
  switch (p.type) {
    case 1: {
      const out = new Uint8Array(1 + 4 + 4 + 1 + p.inputs.length * INPUT_BYTES + 4);
      const v = new DataView(out.buffer);
      v.setUint8(0, 1);
      v.setInt32(1, p.ack);
      v.setUint32(5, p.first);
      v.setUint8(9, p.inputs.length);
      p.inputs.forEach((f, i) => writeInput(v, 10 + i * INPUT_BYTES, f));
      v.setUint32(10 + p.inputs.length * INPUT_BYTES, p.senderTick);
      return out;
    }
    case 2: {
      const out = new Uint8Array(13);
      const v = new DataView(out.buffer);
      v.setUint8(0, 2);
      v.setUint32(1, p.tick);
      v.setUint32(5, parseInt(p.hash.slice(0, 8), 16));
      v.setUint32(9, parseInt(p.hash.slice(8, 16), 16));
      return out;
    }
    case 3:
    case 4: {
      const out = new Uint8Array(13);
      const v = new DataView(out.buffer);
      v.setUint8(0, p.type);
      v.setUint32(1, p.id);
      v.setFloat64(5, p.sentMs);
      return out;
    }
    case 5: {
      const body = enc.encode(JSON.stringify(p.data));
      const out = new Uint8Array(5 + body.length);
      const v = new DataView(out.buffer);
      v.setUint8(0, 5);
      v.setUint32(1, p.seq);
      out.set(body, 5);
      return out;
    }
    case 6: {
      const out = new Uint8Array(5);
      const v = new DataView(out.buffer);
      v.setUint8(0, 6);
      v.setUint32(1, p.seq);
      return out;
    }
  }
}

export function decodePacket(bytes: Uint8Array): Packet | null {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const type = v.getUint8(0);
    switch (type) {
      case 1: {
        const count = v.getUint8(9);
        const inputs: InputFrame[] = [];
        for (let i = 0; i < count; i++) inputs.push(readInput(v, 10 + i * INPUT_BYTES));
        return { type: 1, ack: v.getInt32(1), first: v.getUint32(5), inputs, senderTick: v.getUint32(10 + count * INPUT_BYTES) };
      }
      case 2:
        return { type: 2, tick: v.getUint32(1), hash: v.getUint32(5).toString(16).padStart(8, '0') + v.getUint32(9).toString(16).padStart(8, '0') };
      case 3:
      case 4:
        return { type, id: v.getUint32(1), sentMs: v.getFloat64(5) };
      case 5:
        return { type: 5, seq: v.getUint32(1), data: JSON.parse(dec.decode(bytes.subarray(5))) as unknown };
      case 6:
        return { type: 6, seq: v.getUint32(1) };
      default:
        return null;
    }
  } catch {
    return null; // malformed packets are ignored
  }
}
