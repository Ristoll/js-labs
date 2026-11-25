import type { Room } from './room.ts';
import type { TokenBucket } from './rate-limiter.ts';

declare module 'ws' {
  interface WebSocket {
    isAlive: boolean;
    missedPings: number;
    playerId: string | null;
    playerName: string | null;
    joinedRoom: Room | null;
    preferredCodec: 'json' | 'binary' | null;
    rateLimiter: TokenBucket;
  }
}
