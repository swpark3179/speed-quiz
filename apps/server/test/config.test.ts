import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseUrlFor, type Config } from '../src/config';

const cfg = (over: Partial<Config> = {}): Config => ({ port: 3000, publicBaseUrl: null, publicPort: null, ...over }) as Config;

function fakeLan(ip: string | null): void {
  vi.spyOn(os, 'networkInterfaces').mockReturnValue(
    ip ? ({ eth0: [{ family: 'IPv4', internal: false, address: ip }] } as unknown as ReturnType<typeof os.networkInterfaces>) : {},
  );
}

describe('baseUrlFor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PUBLIC_BASE_URL wins over everything', () => {
    expect(baseUrlFor(cfg({ publicBaseUrl: 'http://quiz.example.com', publicPort: 80 }), 'http://10.0.0.5:3000')).toBe('http://quiz.example.com');
  });

  it('without PUBLIC_PORT keeps the request origin and the listening port (unchanged behaviour)', () => {
    expect(baseUrlFor(cfg(), 'http://10.0.0.5:3000')).toBe('http://10.0.0.5:3000');
    fakeLan('10.0.0.5');
    expect(baseUrlFor(cfg(), 'http://localhost:3000')).toBe('http://10.0.0.5:3000');
  });

  it('PUBLIC_PORT=80 drops the port from the LAN IP fallback (admin opened localhost)', () => {
    fakeLan('10.0.0.5');
    expect(baseUrlFor(cfg({ publicPort: 80 }), 'http://localhost:3000')).toBe('http://10.0.0.5');
    expect(baseUrlFor(cfg({ publicPort: 80 }), null)).toBe('http://10.0.0.5');
  });

  it('PUBLIC_PORT replaces the port of the admin\'s request origin', () => {
    expect(baseUrlFor(cfg({ publicPort: 80 }), 'http://10.0.0.5:3000')).toBe('http://10.0.0.5');
    expect(baseUrlFor(cfg({ publicPort: 8080 }), 'http://10.0.0.5:3000')).toBe('http://10.0.0.5:8080');
    expect(baseUrlFor(cfg({ publicPort: 80 }), 'http://quiz.local')).toBe('http://quiz.local');
  });

  it('keeps :80 for https origins and falls back to localhost when there is no LAN IP', () => {
    expect(baseUrlFor(cfg({ publicPort: 80 }), 'https://quiz.example.com')).toBe('https://quiz.example.com:80');
    fakeLan(null);
    expect(baseUrlFor(cfg({ publicPort: 80 }), null)).toBe('http://localhost');
  });
});
