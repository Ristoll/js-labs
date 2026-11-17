import { Room } from './room.js';

export class RoomManager {
  /**
   * @param {object} options
   * @param {number} [options.maxRooms=100]
   * @param {number} [options.defaultMaxPlayers=4]
   * @param {string} [options.replaysDir]
   * @param {number} [options.maxBufferedAmount=1048576]
   */
  constructor({ maxRooms = 100, defaultMaxPlayers = 4, replaysDir = null, maxBufferedAmount = 1048576 } = {}) {
    this.maxRooms = maxRooms;
    this.defaultMaxPlayers = defaultMaxPlayers;
    this.replaysDir = replaysDir;
    this.maxBufferedAmount = maxBufferedAmount;
    this.rooms = new Map(); // id -> Room
  }

  createRoom({ id, name, maxPlayers }) {
    if (this.rooms.size >= this.maxRooms) {
      throw new Error('Server room limit reached');
    }

    const roomId = id || `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (this.rooms.has(roomId)) {
      throw new Error(`Room with id '${roomId}' already exists`);
    }

    const room = new Room({
      id: roomId,
      name: name || `Sector ${roomId}`,
      maxPlayers: maxPlayers || this.defaultMaxPlayers,
      replaysDir: this.replaysDir,
      maxBufferedAmount: this.maxBufferedAmount,
    });

    // Automatically remove room when all players leave
    room.on('empty', () => {
      this.deleteRoom(roomId);
    });

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  async deleteRoom(id) {
    const room = this.rooms.get(id);
    if (room) {
      await room.close();
      this.rooms.delete(id);
      return true;
    }
    return false;
  }

  listRooms() {
    return Array.from(this.rooms.values()).map((r) => r.toJSON());
  }

  async closeAll() {
    const closePromises = [];
    for (const room of this.rooms.values()) {
      closePromises.push(room.close());
    }
    await Promise.all(closePromises);
    this.rooms.clear();
  }
}
