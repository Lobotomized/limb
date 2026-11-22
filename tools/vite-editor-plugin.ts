/**
 * Dev-server endpoint for the fighter editor: POST /__editor/save writes a fighter's JSON files
 * into src/content/fighters/<folder>/. Only exists under `npm run dev` (configureServer), only
 * accepts fighter.json / bot.json / visuals.json in a valid folder name, and refuses to write
 * next to a hand-written .ts of the same file. Vite then reloads the page with the new content.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const SAVE_PATH = '/__editor/save';
const FILES = ['fighter.json', 'bot.json', 'visuals.json'] as const;
const FOLDER_RE = /^[a-z][a-z0-9_-]*$/;
const MAX_BYTES = 1_000_000;

export interface SaveRequest {
  folder: string;
  files: Record<string, string>;
}

/** Checks a save request and returns the files to write (absolute path → text), or an error. */
export function planSave(root: string, req: unknown): { writes: [string, string][] } | { error: string } {
  const r = req as Partial<SaveRequest> | null;
  if (!r || typeof r.folder !== 'string' || !FOLDER_RE.test(r.folder)) return { error: 'folder must be a lowercase id (a-z, 0-9, _ or -, starting with a letter)' };
  if (!r.files || typeof r.files !== 'object' || !Object.keys(r.files).length) return { error: 'no files to save' };
  const dir = resolve(root, 'src/content/fighters', r.folder);
  const writes: [string, string][] = [];
  for (const [name, text] of Object.entries(r.files)) {
    if (!(FILES as readonly string[]).includes(name)) return { error: `can't write "${name}" (allowed: ${FILES.join(', ')})` };
    if (typeof text !== 'string' || text.length > MAX_BYTES) return { error: `${name}: must be text under 1 MB` };
    try {
      JSON.parse(text);
    } catch (e) {
      return { error: `${name}: not valid JSON (${(e as Error).message})` };
    }
    const ts = join(dir, name.replace(/\.json$/, '.ts'));
    if (existsSync(ts)) return { error: `${r.folder}/${name.replace(/\.json$/, '.ts')} exists — convert it first with npm run fighters:json -- ${r.folder}` };
    writes.push([join(dir, name), text]);
  }
  return { writes };
}

export function editorSavePlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'limb-clash-editor-save',
    apply: 'serve',
    configResolved(c) {
      root = c.root;
    },
    configureServer(server) {
      server.middlewares.use(SAVE_PATH, (req, res) => {
        const reply = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return reply(405, { error: 'POST only' });
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > MAX_BYTES * 4) req.destroy();
        });
        req.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            return reply(400, { error: 'request body must be JSON' });
          }
          const plan = planSave(root, parsed);
          if ('error' in plan) return reply(400, plan);
          try {
            for (const [path, text] of plan.writes) {
              mkdirSync(resolve(path, '..'), { recursive: true });
              writeFileSync(path, text);
            }
          } catch (e) {
            return reply(500, { error: (e as Error).message });
          }
          reply(200, { ok: true, written: plan.writes.map(([p]) => p.slice(root.length + 1).replace(/\\/g, '/')) });
        });
      });
    },
  };
}
