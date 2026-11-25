import { Room } from './room.ts';

export interface RoomOptions {
  maxRooms?: number;
  defaultMaxPlayers?: number;
  replaysDir?: string | null;
  maxBufferedAmount?: number;
}

export interface RoomSummary {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: 'full' | 'open';
  arena: string;
  createdAt: number;
}

export class RoomManager {
  readonly maxRooms: number;
  readonly defaultMaxPlayers: number;
  readonly replaysDir: string | null;
  readonly maxBufferedAmount: number;
  readonly rooms: Map<string, Room>;

  constructor({
    maxRooms = 100,
    defaultMaxPlayers = 4,
    replaysDir = null,
    maxBufferedAmount = 1048576,
  }: RoomOptions = {}) {
    this.maxRooms = maxRooms;
    this.defaultMaxPlayers = defaultMaxPlayers;
    this.replaysDir = replaysDir;
    this.maxBufferedAmount = maxBufferedAmount;
    this.rooms = new Map();
  }

  createRoom({ id, name, maxPlayers }: { id?: string; name?: string; maxPlayers?: number }): Room {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Server room limit reached');
    }

    const roomId =
      id || `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (this.rooms.has(roomId)) {
      throw new Error(`Room with id '${roomId}' already exists`);
    }

    const room = new Room({
      id: roomId,
      name: name || `Sector ${roomId}`,
      maxPlayers: maxPlayers ?? this.defaultMaxPlayers,
      replaysDir: this.replaysDir,
      maxBufferedAmount: this.maxBufferedAmount,
    });

    // Guard against unhandled error events crashing Node.js
    room.on('error', (err: unknown) => {
      console.error(`[RoomManager] Room '${roomId}' emitted error:`, err);
    });

    // Automatically remove room when all players leave
    room.on('empty', () => {
      this.deleteRoom(roomId);
    });

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  async deleteRoom(id: string): Promise<boolean> {
    const room = this.rooms.get(id);
    if (room) {
      await room.close();
      this.rooms.delete(id);
      return true;
    }
    return false;
  }

  listRooms(): RoomSummary[] {
    return Array.from(this.rooms.values()).map((r) => r.toJSON());
  }

  async closeAll(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    for (const room of this.rooms.values()) {
      closePromises.push(room.close());
    }
    await Promise.all(closePromises);
    this.rooms.clear();
  }
}
