import { test, expect, type Page } from '@playwright/test';

const WS_URL = 'ws://localhost:3099/ws';

async function connectWebSocket(page: Page, name: string) {
  await page.evaluate(
    ({ url, name }: { url: string; name: string }) => {
      (window as any).__ws = { name, url, messages: [], ws: null as WebSocket | null };
      const ws = new WebSocket(url);
      (window as any).__ws.ws = ws;
      const connected = new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = (ev: Event) => reject(new Error(`${name} WebSocket error`));
      });
      ws.onmessage = (ev: MessageEvent) => {
        try {
          (window as any).__ws.messages.push(JSON.parse(ev.data));
        } catch {
          (window as any).__ws.messages.push(ev.data);
        }
      };
      return connected;
    },
    { url: WS_URL, name }
  );
}

async function sendMessage(page: Page, message: unknown) {
  await page.evaluate(
    ({ message }: { message: unknown }) => {
      const ws = (window as any).__ws?.ws as WebSocket | null;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not open');
      }
      ws.send(JSON.stringify(message));
    },
    { message }
  );
}

async function getMessages(page: Page) {
  return page.evaluate(() => (window as any).__ws?.messages ?? []);
}

async function waitForMessage(
  page: Page,
  predicate: (m: unknown) => boolean,
  timeoutMs = 5000
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const messages = await getMessages(page);
    for (const m of messages) {
      if (predicate(m)) return m;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for message matching predicate`);
}

test('two players join same room, see roster, observe movement, and exchange chat', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName === 'webkit', 'webkit not configured');

  await connectWebSocket(page, 'A');
  const pageB = await context.newPage();
  await connectWebSocket(pageB, 'B');

  await sendMessage(page, {
    v: 1,
    type: 'join',
    payload: { roomId: 'alpha', playerName: 'Pilot A' },
  });
  await sendMessage(pageB, {
    v: 1,
    type: 'join',
    payload: { roomId: 'alpha', playerName: 'Pilot B' },
  });

  // Both clients should receive a 'roster' listing both players.
  const rosterA = await waitForMessage(
    page,
    (m: any) => m.type === 'roster' && m.payload.players.length === 2
  );
  expect(rosterA.payload.players).toHaveLength(2);
  expect(rosterA.payload.players.map((p: any) => p.name)).toEqual(
    expect.arrayContaining(['Pilot A', 'Pilot B'])
  );

  const rosterB = await waitForMessage(
    pageB,
    (m: any) => m.type === 'roster' && m.payload.players.length === 2
  );
  expect(rosterB.payload.players).toHaveLength(2);

  // Client A thrusts; client B should observe a snapshot within a few seconds.
  await sendMessage(page, {
    v: 1,
    type: 'input',
    payload: { seq: 1, tick: 1, thrust: true, reverse: false, turn: 0, fire: false },
  });

  const snapshotB = await waitForMessage(pageB, (m: any) => m.type === 'snapshot', 5000);
  expect(snapshotB.type).toBe('snapshot');
  expect(Array.isArray(snapshotB.payload.entities)).toBe(true);

  // Client A chats; client B should receive the chat message.
  await sendMessage(page, { v: 1, type: 'chat', payload: { text: 'hello e2e' } });

  const chatB = await waitForMessage(
    pageB,
    (m: any) => m.type === 'chat' && m.payload.text === 'hello e2e',
    5000
  );
  expect(chatB.type).toBe('chat');
  expect(chatB.payload.text).toBe('hello e2e');

  await pageB.close();
});
