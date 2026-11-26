/**
 * Client-side build version stamp.
 *
 * Fetches `/health` from the same origin and reads the `version` field the
 * server stamps at build time (git SHA). Displayed in the HUD so operators
 * can confirm which build is running.
 */
let version: string | null = null;

export async function loadVersion(): Promise<string | null> {
  try {
    const res = await fetch('/health', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string | null };
    version = data.version ?? null;
  } catch {
    version = null;
  }
  return version;
}

export function getVersion(): string | null {
  return version;
}
