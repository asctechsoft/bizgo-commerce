import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Walk up from `start` until pnpm-workspace.yaml is found. Override with BIZGO_REPO_ROOT. */
export function findRepoRoot(start: string = process.cwd()): string {
  const fromEnv = process.env.BIZGO_REPO_ROOT;
  if (fromEnv) return resolve(fromEnv);
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Repository root (pnpm-workspace.yaml) not found');
    dir = parent;
  }
}
