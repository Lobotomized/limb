/**
 * Events emitted by the simulation. Rendering, audio and UI react to them but never
 * change the simulation. Every event has a stable `key` (tick + content) so rollback
 * can de-duplicate presentation effects across resimulation.
 */
import type { Vec2 } from './math';

export interface PartRef {
  fighter: number;
  part: number;
}

interface Base {
  tick: number;
  key: string;
}

export type SimEvent =
  | (Base & {
      type: 'hit';
      a: PartRef;
      /** null when A hit a wall. */
      b: PartRef | null;
      damage: number;
      impact: number;
      point: Vec2;
    })
  | (Base & { type: 'partDied'; ref: PartRef; point: Vec2 })
  | (Base & { type: 'partDetached'; ref: PartRef }) // lost through an ancestor
  | (Base & { type: 'coreDied'; fighter: number; point: Vec2 })
  | (Base & { type: 'ringOut'; fighter: number })
  | (Base & { type: 'roundStart'; round: number; wins: [number, number] })
  | (Base & { type: 'fightStart'; round: number })
  | (Base & { type: 'roundOver'; round: number; winner: number | null; reason: 'core' | 'ringout' | 'draw'; wins: [number, number] })
  | (Base & { type: 'matchOver'; winner: number; wins: [number, number] })
  | (Base & { type: 'dash'; fighter: number })
  | (Base & { type: 'moveStarted'; fighter: number; slot: number; move: number })
  | (Base & { type: 'debrisRemoved'; ref: PartRef })
  | (Base & { type: 'ability'; ability: string; data: unknown });

export type SimEventType = SimEvent['type'];

type Without<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type SimEventInput = Without<SimEvent, 'tick' | 'key'>;

/** Collects events for one tick and gives each a stable key. */
export class EventSink {
  readonly events: SimEvent[] = [];
  constructor(private readonly tick: number) {}

  emit(e: SimEventInput): void {
    // Key from the event's integer fields only, so a resimulated tick that produces the
    // "same" hit (tiny float differences aside) maps to the same presentation effect.
    const ids = JSON.stringify(e, (_k, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? undefined : v));
    const key = `${this.tick}:${ids}`;
    this.events.push({ ...e, tick: this.tick, key } as SimEvent);
  }
}
