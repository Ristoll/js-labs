import type { ClientInput } from './match.ts';
import type { ClientInput, Match } from './match.ts';
import type { Player, Room } from './room.ts';
import { Bot } from 'shared';

/**
 * Server-side bot manager. Adds AI players to a match and feeds them a
 * `ShipInput` each tick through the same `pendingInputs` path as human
 * clients, so the simulation treats bots identically to humans.
 *
 * Bots are `Player`s with `ws === undefined`, so they appear in the roster but
 * never receive snapshots or broadcasts (they read `match.world` directly).
 */
export class BotManager {
  private match: Match;
  private room: Room;
  private bots = new Map<string, { bot: Bot; playerId: string; seq: number }>();

  constructor(match: Match, room: Room) {
    this.match = match;
    this.room = room;

    match.preTickHandlers.push((nowMs) => this._onPreTick(nowMs));
  }

  /** Add N bots to the match. Returns the new bot player IDs. */
  addBots(names: string[]): string[] {
    const added: string[] = [];
    for (const name of names) {
      const playerId = `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const player: Player = {
        id: playerId,
        name,
        ws: undefined,
        joinedAt: Date.now(),
        preferredCodec: null,
        isBot: true,
      };

      try {
        this.room.addPlayer(player);
      } catch (err) {
        console.error(`[BotManager] Could not add bot '${name}':`, err instanceof Error ? err.message : String(err));
        continue;
      }

      const bot = new Bot({ id: playerId, name, seed: this._hashId(playerId) });
      this.bots.set(playerId, { bot, playerId, seq: 0 });
      added.push(playerId);
    }
    return added;
  }

  /** Remove a bot by player ID. Returns true if removed. */
  removeBot(playerId: string): boolean {
    const entry = this.bots.get(playerId);
    if (!entry) return false;
    try {
      this.room.removePlayer(playerId);
    } catch {
      // best effort
    }
    this.bots.delete(playerId);
    return true;
  }

  /** Remove all bots. */
  removeAllBots(): number {
    const count = this.bots.size;
    for (const playerId of [...this.bots.keys()]) {
      this.removeBot(playerId);
    }
    return count;
  }

  getBotCount(): number {
    return this.bots.size;
  }

  private _onPreTick(nowMs: number): void {
    for (const entry of this.bots.values()) {
      const ship = this.match.playerShips.get(entry.playerId);
      if (!ship || !ship.alive) continue;

      entry.seq++;
      const input: ClientInput = {
        ...entry.bot.think(ship, this.match.world, nowMs),
        seq: entry.seq,
      };

      const queue = this.match.pendingInputs.get(entry.playerId);
      if (queue) {
        if (queue.length < 60) {
          queue.push(input);
        }
      }
    }
  }

  private _hashId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) | 0;
    }
    return Math.abs(h) || 424242;
  }
}
