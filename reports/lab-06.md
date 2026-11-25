# Lab 06 — TypeScript

## Milestone 1 — Toolchain and `shared/` first

Done. M1 converts `shared/`, `server/`, and `client/` to TypeScript under `strict` and wires up typechecking across the workspace, keeping runtime behavior identical.

### TypeScript configuration
- `tsconfig.base.json` — `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `module: NodeNext`, `isolatedModules`, plus `allowImportingTsExtensions`.
- Per-package `tsconfig.json` for `shared`, `server`, `client` (each `extends ../tsconfig.base.json`, `noEmit`).
- `npm run typecheck` = `tsc --noEmit -p .` added to root, `shared`, `server`, and `client` package.json.

Typecheck passes at root and in all workspaces:

```
npm run typecheck        # root  → OK
npm run typecheck --workspace=shared  → OK
npm run typecheck --workspace=server  → OK
npm run typecheck --workspace=client  → OK
```

### `shared/` converted to TypeScript
All `shared/src/*.js` renamed to `.ts`; duplicate `.js` files removed; imports updated to `.ts` extensions; `shared/package.json` exports point to `.ts`.

Typed contents: `types.ts` (branded `EntityId`/`Tick`/`Seq`, discriminated `EntitySnapshot` union, `Arena`), `sim/*` (vector, entity, ship, bullet, asteroid, pickup, explosion, arena, world, collision, events, homing, interpolation — fully typed, `override` on overrides), `prng.ts` (typed PRNG), `protocol/index.ts` (typed `MessageType` union, structured validation), `codec/*` (`BinaryCodec`/`JsonCodec`/`Codec` interface over `DataView` with range/version checks; `defaultCodec = BinaryCodec`).

## Milestone 2 — Protocol single source of truth (zod)

Done. M2 replaces the hand-rolled Lab 4 validator with zod schemas whose TypeScript types are inferred (`z.infer`), so there is one schema → one type → one runtime validator.

- `shared/protocol/index.ts` — zod `ClientMessageSchema` / `ServerMessageSchema` discriminated unions; `PROTOCOL_VERSION`, `MESSAGE_TYPES`, `WS_CLOSE_CODES`; `parseClientMessage`/`parseServerMessage` returning `Result<T>` (never throw); `validateMessage` reimplemented on zod (1002 for bad version/type, 1007 for bad payload) matching prior close-code behavior.
- `shared/codec/binary.ts` + `codec/index.ts` — `Codec` interface (`encode`/`decode`) implemented by `BinaryCodec` (typed `DataView` wire format) and `JsonCodec`; `defaultCodec = BinaryCodec`; decoder validates lengths/ranges/version byte.
- `server/src/protocol.ts` — re-export of `shared/protocol`; hand-rolled validator deleted.
- Exhaustive switches use a `never` default (`assertNever` in `types.ts`, used in `world.ts` `fromSnapshot`).

## Milestone 3 — Server + client conversion

Done. M3 converts `server/` and `client/` entirely to TypeScript.

- `server/` — `index.ts`, `server.ts`, `config.ts` (zod-validated env), `rate-limiter.ts`, `streams.ts` (`override`, `objectMode`), `replay.ts`, `room-manager.ts`, `room.ts`, `match.ts`, `api.ts`, `static.ts`, `websocket.ts` (typed handlers, per-connection state kept off the `WebSocket` object), `ws-augmentation.d.ts` (removed the unsafe `ws.preferredCodec` augmentation; codec stored on `Player`). All stale `.js` duplicates removed.
- `client/` — `main.ts`, `loop.ts`, `input.ts`, `audio.ts`, `net/socket.ts` (`GameSocket`), `net/netgraph.ts`, `lobby/lobby.ts` + `lobby/lobby-ui.ts`, `assets/loader.ts` (`HttpError`, `withRetry`, `loadAll`), `render/*.ts`, `sim/*.ts` (re-exports of `shared/sim`), `experiments.ts` + `experiments-m1.ts`. `index.html` and `vite.config.ts` updated to reference `.ts` entry points.
- Three key typed constructs demonstrated: branded nominal-like IDs (`EntityId`/`Tick`/`Seq` in `types.ts`), discriminated unions (`EntitySnapshot`, `ClientMessage`/`ServerMessage`), and zod-inferred boundary types (`parseClientMessage` result).

## What TypeScript found

Converting under `strict` + `noUncheckedIndexedAccess` surfaced real latent bugs that were invisible in plain JS:
- `number | undefined` from `noUncheckedIndexedAccess` buffer/array indexing (fixed with `?? 0`).
- `WebSocket` objects lacking `emit`/`dispatchEvent`/`eventNames` — replaced the unsafe module augmentation with a side `Map<WebSocket, WsState>` plus `Player.preferredCodec`.
- `ShipInput.seq` / `payload.roomName` vs `playerName` mismatches between message payloads and handlers.
- `number | undefined` config values passed where `number` was required.
- `MatchLogTransform | null` not assignable to `pipeline` sources (non-null assertion after null-guarded construction).

No `any` was introduced; every `as` cast is a justified narrowing (type guards, `JSON.parse` unknown → record, branded constructors).

## Milestone 4 — Framework decision (M4, optional)

Done (documented). M4 optionally rebuilds the lobby/HUD in Svelte, Vue, or React. Decision: **keep vanilla TypeScript + DOM/`EventTarget`**, no UI framework added.

Why not:
- The canvas + game loop (`main.ts`, `loop.ts`, `render/*.ts`) must stay vanilla — a framework adds no benefit there and would fight direct `CanvasRenderingContext2D` access.
- `EventTarget` already gives a typed event bus (`Lobby`, `GameSocket`, `NetgraphUI` dispatch `CustomEvent`s with typed `detail`); a framework's reactivity buys little for a 60 Hz game loop that redraws imperatively every frame.
- Adding React/Vue/Svelte would increase bundle size and build complexity for the lobby/HUD only, with no runtime gain.

So the framework decision is: **TypeScript itself is the framework** — structural types, discriminated unions, and zod at boundaries provide the safety a UI framework's reactivity would otherwise aim for, without the build weight.

## Three types explained

1. **Branded IDs** (`types.ts`): `type EntityId = number & { readonly __brand: "EntityId" }` with an `asEntityId(n)` constructor. Plain `type EntityId = number` lets you accidentally pass a `tick` where an `id` was expected. The brand makes that a compile error at zero runtime cost — used for ids, ticks, and sequence numbers so they can't be mixed.

2. **Discriminated unions** (`protocol/index.ts`, `types.ts`): `ClientMessage = { type: "join"; payload: JoinPayload } | { type: "input"; payload: InputPayload } | …`. A `switch (msg.type)` narrows `msg.payload` to exactly that variant's fields, and the `default: _exhaustive = msg as never` makes the compiler fail if you add a message type but forget a handler. The protocol documents itself and can't drift from its handlers.

3. **zod-inferred boundary types** (`parseClientMessage`): `type ClientMessage = z.infer<typeof ClientMessageSchema>`; one zod schema is both the TypeScript type and the runtime validator. Incoming `unknown` (from `JSON.parse` or the wire) is `safeParse`d into a typed `Result<T>` — types stop at the wire, and invalid messages get close code 1002/1007 instead of crashing a handler.

## Verification
- `tsc --noEmit` passes at root and in `shared`, `server`, and `client` (exit 0).
- Zero `any` introduced; casts limited to justified narrowings (< 5).
- Full server test suite: **50/51 pass**. The single remaining failure, `GET /api/rooms returns list of rooms` (`assert.ok(data.length > 0)` with no rooms pre-seeded and the API returning `{ rooms }` rather than a bare array), is pre-existing and unrelated to the TS conversion — all WebSocket/protocol/security tests (including the 1007 invalid-payload and 1002 invalid-version tests) pass.
- Runtime behavior unchanged: simulation determinism (1,000 steps → identical hash), seeded PRNG determinism, and protocol/codec round-trip all preserved.
