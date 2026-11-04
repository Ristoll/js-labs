import { Room } from './room.js';

export class RoomManager {
  /**
   * @param {object} options
   * @param {number} [options.maxRooms=100]
   * @param {number} [options.defaultMaxPlayers=4]
   * @param {string} [options.replaysDir]
   */
  constructor({ maxRooms = 100, defaultMaxPlayers = 4, replaysDir = null } = {}) {
    this.maxRooms = maxRooms;
    this.defaultMaxPlayers = defaultMaxPlayers;
    this.replaysDir = replaysDir;
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

  deleteRoom(id) {
    const room = this.rooms.get(id);
    if (room) {
      room.close();
      this.rooms.delete(id);
      return true;
    }
    return false;
  }

  listRooms() {
    return Array.from(this.rooms.values()).map((r) => r.toJSON());
  }

  closeAll() {
    for (const room of this.rooms.values()) {
      room.close();
    }
    this.rooms.clear();
  }
}
