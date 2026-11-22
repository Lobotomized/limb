// Lint rules are part of the architecture: these tests prove they fire.
// Fixture sources are stored as .txt and linted under a virtual path inside src/.
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const eslint = new ESLint({ cwd: resolve(__dirname, '..') });

async function lintFixture(fixture: string, virtualPath: string): Promise<string[]> {
  const code = readFileSync(resolve(__dirname, 'fixtures/lint', fixture), 'utf8');
  const [result] = await eslint.lintText(code, { filePath: resolve(__dirname, '..', virtualPath) });
  return (result?.messages ?? []).map((m) => `${m.ruleId ?? 'fatal'}: ${m.message}`);
}

describe('lint: determinism rules', () => {
  it('rejects Math.random in core', async () => {
    const msgs = await lintFixture('core-uses-math-random.ts.txt', 'src/core/fixture-random.ts');
    expect(msgs.some((m) => m.startsWith('no-restricted-properties') && m.includes('Math.random'))).toBe(true);
  });
  it('rejects Math.sin and ** in content', async () => {
    const msgs = await lintFixture('core-uses-math-sin.ts.txt', 'src/content/fighters/fixture/fighter.ts');
    expect(msgs.some((m) => m.includes('Math.sin'))).toBe(true);
    expect(msgs.some((m) => m.includes('pow'))).toBe(true);
  });
  it('rejects Math.random in bots', async () => {
    const msgs = await lintFixture('core-uses-math-random.ts.txt', 'src/bots/fixture.ts');
    expect(msgs.some((m) => m.includes('Math.random'))).toBe(true);
  });
  it('allows Math.random outside deterministic folders (render)', async () => {
    const msgs = await lintFixture('core-uses-math-random.ts.txt', 'src/render/fixture.ts');
    expect(msgs.filter((m) => m.includes('Math.random'))).toEqual([]);
  });
});

describe('lint: import boundaries', () => {
  it('content importing core logic fails', async () => {
    const msgs = await lintFixture('content-imports-core-logic.ts.txt', 'src/content/fighters/fixture/fighter.ts');
    expect(msgs.some((m) => m.startsWith('boundaries/dependencies'))).toBe(true);
  });
  it('content importing a VALUE from core/schema fails', async () => {
    const msgs = await lintFixture('content-imports-schema-value.ts.txt', 'src/content/fighters/fixture/fighter.ts');
    expect(msgs.some((m) => m.startsWith('boundaries/dependencies'))).toBe(true);
  });
  it('content importing a TYPE from core/schema is allowed', async () => {
    const msgs = await lintFixture('content-imports-schema-type.ts.txt', 'src/content/fighters/fixture/fighter.ts');
    expect(msgs.filter((m) => m.startsWith('boundaries'))).toEqual([]);
  });
  it('core importing render fails', async () => {
    const msgs = await lintFixture('core-imports-render.ts.txt', 'src/core/fixture.ts');
    expect(msgs.some((m) => m.startsWith('boundaries/dependencies'))).toBe(true);
  });
  it('render importing net fails', async () => {
    const msgs = await lintFixture('render-imports-net.ts.txt', 'src/render/fixture.ts');
    expect(msgs.some((m) => m.startsWith('boundaries/dependencies') || m.startsWith('no-restricted-imports'))).toBe(true);
  });
});
