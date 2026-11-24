import { JsonCodec, BinaryCodec } from 'shared/codec';
import { PROTOCOL_VERSION } from 'shared/protocol';

/**
 * Benchmark comparing JSON vs DataView BinaryCodec at 30 Hz with 4 players.
 */
function runBenchmark() {
  const sampleInput = {
    v: PROTOCOL_VERSION,
    type: 'input',
    payload: {
      seq: 1542,
      tick: 300,
      thrust: true,
      reverse: false,
      turn: 0.452,
      fire: true,
    },
  };

  const sampleSnapshot = {
    v: PROTOCOL_VERSION,
    type: 'snapshot',
    payload: {
      tick: 1200,
      serverTime: Date.now(),
      lastProcessedSeq: {
        'player-alpha': 1542,
        'player-bravo': 1539,
        'player-charlie': 1541,
        'player-delta': 1540,
      },
      entities: [
        {
          id: 1,
          kind: 'ship',
          x: 250.4,
          y: 320.1,
          vx: 80.2,
          vy: -15.4,
          angle: 1.57,
          radius: 16,
          alive: true,
          hp: 3,
          thrust: true,
          reverse: false,
          playerId: 'player-alpha',
        },
        {
          id: 2,
          kind: 'ship',
          x: 550.0,
          y: 220.8,
          vx: -40.1,
          vy: 65.2,
          angle: -0.85,
          radius: 16,
          alive: true,
          hp: 2,
          thrust: false,
          reverse: false,
          playerId: 'player-bravo',
        },
        {
          id: 3,
          kind: 'ship',
          x: 780.2,
          y: 510.5,
          vx: 12.0,
          vy: -95.0,
          angle: 2.14,
          radius: 16,
          alive: true,
          hp: 3,
          thrust: true,
          reverse: false,
          playerId: 'player-charlie',
        },
        {
          id: 4,
          kind: 'ship',
          x: 410.9,
          y: 690.3,
          vx: -30.5,
          vy: -10.2,
          angle: -2.95,
          radius: 16,
          alive: true,
          hp: 1,
          thrust: false,
          reverse: true,
          playerId: 'player-delta',
        },
        {
          id: 5,
          kind: 'asteroid',
          x: 150.0,
          y: 150.0,
          vx: 20.0,
          vy: 15.0,
          angle: 0.42,
          radius: 25,
          alive: true,
          angularVelocity: 0.35,
        },
        {
          id: 6,
          kind: 'asteroid',
          x: 920.0,
          y: 250.0,
          vx: -18.0,
          vy: -12.0,
          angle: 1.89,
          radius: 25,
          alive: true,
          angularVelocity: -0.4,
        },
        {
          id: 7,
          kind: 'asteroid',
          x: 600.0,
          y: 700.0,
          vx: 10.0,
          vy: -25.0,
          angle: -1.2,
          radius: 25,
          alive: true,
          angularVelocity: 0.25,
        },
        {
          id: 8,
          kind: 'bullet',
          x: 280.0,
          y: 320.0,
          vx: 400.0,
          vy: 0.0,
          angle: 1.57,
          radius: 3,
          alive: true,
          ttl: 1.2,
          damage: 1,
          ownerId: 'player-alpha',
        },
        {
          id: 9,
          kind: 'bullet',
          x: 520.0,
          y: 230.0,
          vx: -350.0,
          vy: 120.0,
          angle: -0.85,
          radius: 3,
          alive: true,
          ttl: 0.85,
          damage: 1,
          ownerId: 'player-bravo',
        },
        {
          id: 10,
          kind: 'pickup',
          x: 500.0,
          y: 400.0,
          vx: 0.0,
          vy: 0.0,
          angle: 0.8,
          radius: 12,
          alive: true,
          type: 'shield',
        },
      ],
    },
  };

  const ITERATIONS = 10000;

  // 1. JSON Measurements
  const jsonInputEncoded = JsonCodec.encode(sampleInput);
  const jsonSnapEncoded = JsonCodec.encode(sampleSnapshot);
  const jsonSnapBytes = Buffer.byteLength(jsonSnapEncoded);
  const jsonInputBytes = Buffer.byteLength(jsonInputEncoded);

  // Warmup
  for (let i = 0; i < 1000; i++) {
    JsonCodec.decode(JsonCodec.encode(sampleSnapshot));
  }

  const jsonStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const enc = JsonCodec.encode(sampleSnapshot);
    JsonCodec.decode(enc);
  }
  const jsonTotalMs = performance.now() - jsonStart;
  const jsonMicroseconds = (jsonTotalMs * 1000) / ITERATIONS;

  // 2. Binary Measurements
  const binInputEncoded = BinaryCodec.encode(sampleInput);
  const binSnapEncoded = BinaryCodec.encode(sampleSnapshot);
  const binSnapBytes = binSnapEncoded.byteLength;
  const binInputBytes = binInputEncoded.byteLength;

  // Warmup
  for (let i = 0; i < 1000; i++) {
    BinaryCodec.decode(BinaryCodec.encode(sampleSnapshot));
  }

  const binStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const enc = BinaryCodec.encode(sampleSnapshot);
    BinaryCodec.decode(enc);
  }
  const binTotalMs = performance.now() - binStart;
  const binMicroseconds = (binTotalMs * 1000) / ITERATIONS;

  const tickRate = 30;
  const jsonDownKbps = (jsonSnapBytes * tickRate) / 1024;
  const jsonUpKbps = (jsonInputBytes * tickRate) / 1024;

  const binDownKbps = (binSnapBytes * tickRate) / 1024;
  const binUpKbps = (binInputBytes * tickRate) / 1024;

  console.log('\n--- LAB 05 CODEC BENCHMARK (30 Hz, 4 players, 10 entities) ---');
  console.log(
    '| Codec | Bytes/snapshot | KB/s per client (down) | KB/s per client (up) | Encode+decode µs |'
  );
  console.log('|---|---|---|---|---|');
  console.log(
    `| JSON | ${jsonSnapBytes} | ${jsonDownKbps.toFixed(2)} | ${jsonUpKbps.toFixed(2)} | ${jsonMicroseconds.toFixed(2)} |`
  );
  console.log(
    `| Binary (\`DataView\`) | ${binSnapBytes} | ${binDownKbps.toFixed(2)} | ${binUpKbps.toFixed(2)} | ${binMicroseconds.toFixed(2)} |`
  );
  console.log('----------------------------------------------------------------\n');
}

runBenchmark();
