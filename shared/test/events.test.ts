import { describe, expect, it } from 'vitest';
import { simEvents } from '../src/sim/events.ts';

describe('simEvents / SafeEventTarget', () => {
  it('addEventListener / dispatchEvent / removeEventListener', () => {
    const calls: string[] = [];
    const cb = (e: Event) => calls.push(e.type);
    simEvents.addEventListener('test-event', cb);
    simEvents.dispatchEvent(new Event('test-event'));
    expect(calls).toEqual(['test-event']);
    simEvents.removeEventListener('test-event', cb);
    simEvents.dispatchEvent(new Event('test-event'));
    expect(calls).toEqual(['test-event']);
  });

  it('dispatchEvent with no listeners returns true', () => {
    expect(simEvents.dispatchEvent(new Event('nothing'))).toBe(true);
  });

  it('one throwing listener does not break others', () => {
    const calls: string[] = [];
    simEvents.addEventListener('boom', () => {
      throw new Error('boom');
    });
    simEvents.addEventListener('boom', (e) => calls.push(e.type));
    expect(() => simEvents.dispatchEvent(new Event('boom'))).not.toThrow();
    expect(calls).toEqual(['boom']);
  });
});
