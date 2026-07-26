import { describe, it, expect } from 'vitest';
import { Sanitizer, redactPath } from '../src/telemetry/sanitizer.js';
import { anonymizeContext } from '../src/pipeline/anonymizer.js';

describe('redactPath', () => {
  it('keeps basename', () => {
    expect(redactPath('/Users/alice/proj/src/app.ts')).toBe('<PATH:app.ts>');
  });

  it('handles windows paths', () => {
    expect(redactPath('C:\\Users\\bob\\src\\main.ts')).toBe('<PATH:main.ts>');
  });
});

describe('Sanitizer', () => {
  const home = '/Users/alice';
  const s = new Sanitizer({ homeDir: home, maxStringBytes: 4096 });

  it('scrubs home directory paths', () => {
    const out = s.scrubString(`${home}/Projects/mate-x/src/index.ts`);
    expect(out).toContain('<HOME>');
    expect(out).not.toContain('/Users/alice');
  });

  it('scrubs absolute paths outside home', () => {
    const out = s.scrubString('failed at /var/log/app/error.log');
    expect(out).toMatch(/<PATH:error\.log>/);
    expect(out).not.toContain('/var/log');
  });

  it('scrubs emails', () => {
    expect(s.scrubString('contact alice@example.com please')).toContain(
      '[REDACTED:email]',
    );
    expect(s.scrubString('contact alice@example.com please')).not.toContain(
      'alice@example.com',
    );
  });

  it('scrubs IPv4 addresses', () => {
    expect(s.scrubString('peer 192.168.1.10 connected')).toContain(
      '[REDACTED:ip]',
    );
  });

  it('scrubs UUIDs', () => {
    const out = s.scrubString('id=550e8400-e29b-41d4-a716-446655440000');
    expect(out).toContain('[REDACTED:uuid]');
  });

  it('scrubs JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(s.scrubString(jwt)).toBe('[REDACTED:jwt]');
  });

  it('scrubs nested objects without mutating input', () => {
    const input = {
      user: 'alice@example.com',
      nested: { path: `${home}/secret/file.ts`, ok: true },
    };
    const clone = structuredClone(input);
    const out = s.scrubRecord(input);
    expect(input).toEqual(clone);
    expect(out['user']).toBe('[REDACTED:email]');
    const nested = out['nested'] as Record<string, unknown>;
    expect(String(nested['path'])).toContain('<HOME>');
    expect(nested['ok']).toBe(true);
  });

  it('runs custom key scrubbers after built-ins', () => {
    const custom = new Sanitizer({ homeDir: home });
    custom.addScrubber('email', () => '[CUSTOM]');
    const out = custom.scrubRecord({ email: 'a@b.com', other: 'x' });
    expect(out['email']).toBe('[CUSTOM]');
    expect(out['other']).toBe('x');
  });

  it('scrubs stack traces line by line', () => {
    const stack = `Error: fail
    at run (${home}/app/src/run.ts:12:3)
    at Object.<anonymous> (${home}/app/src/index.ts:1:1)`;
    const scrubbed = s.scrubStack(stack)!;
    expect(scrubbed).not.toContain('/Users/alice');
    expect(scrubbed).toContain('<HOME>');
  });

  it('truncates overlong strings', () => {
    const tiny = new Sanitizer({ maxStringBytes: 20, builtInScrubbers: false });
    const out = tiny.scrubString('abcdefghijklmnopqrstuvwxyz');
    expect(out.length).toBeLessThanOrEqual(20 + '…[truncated]'.length);
    expect(out).toContain('[truncated]');
  });

  it('handles circular references', () => {
    const a: Record<string, unknown> = { x: 1 };
    a['self'] = a;
    const out = s.scrubRecord(a);
    expect(out['self']).toBe('[Circular]');
  });

  it('addScrubber validates inputs', () => {
    expect(() => s.addScrubber('', () => null)).toThrow(TypeError);
    expect(() =>
      s.addScrubber('k', null as unknown as (v: unknown, k: string) => unknown),
    ).toThrow(TypeError);
  });

  it('can disable built-in scrubbers', () => {
    const raw = new Sanitizer({ builtInScrubbers: false });
    expect(raw.scrubString('a@b.com')).toBe('a@b.com');
  });
});

describe('anonymizeContext (delegates to Sanitizer)', () => {
  it('redacts emails and UUIDs', () => {
    const r = anonymizeContext({
      user: 'alice@example.com',
      id: '550e8400-e29b-41d4-a716-446655440000',
      task: 'pay',
    });
    expect(r['user']).toBe('[REDACTED:email]');
    expect(r['id']).toBe('[REDACTED:uuid]');
    expect(r['task']).toBe('pay');
  });
});
