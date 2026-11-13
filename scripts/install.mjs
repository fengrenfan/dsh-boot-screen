#!/usr/bin/env node
/**
 * Install dsh-boot-screen into a DSH profile.
 *
 *   node scripts/install.mjs [--profile <name>] [--home <dir>] [--dry-run]
 *
 * It links this package into the profile's node_modules and appends one
 * `insert` row to the profile's cordis.patch.yml. Both steps are idempotent
 * and undone by scripts/uninstall.mjs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_NAME = 'dsh-boot-screen';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const dryRun = argv.includes('--dry-run');
const home = resolve(flag('--home', process.env.DSH_HOME || join(homedir(), '.dsh')));
const profileName = flag('--profile', process.env.DSH_PROFILE || 'desktop');
const profileDir = join(home, 'profiles', profileName);

const ENTRY = `\n- insert:\n    - id: boot-screen\n      name: "${PACKAGE_NAME}"\n`;

function main() {
  if (!existsSync(profileDir)) {
    console.error(`profile not found: ${profileDir}`);
    console.error('pass --profile <name> or --home <dsh home>');
    process.exit(1);
  }

  const linkPath = join(profileDir, 'node_modules', PACKAGE_NAME);
  const patchPath = join(profileDir, 'cordis.patch.yml');

  console.log(`package : ${PACKAGE_ROOT}`);
  console.log(`profile : ${profileDir}`);

  if (dryRun) {
    console.log('[dry-run] would link   ', linkPath);
    console.log('[dry-run] would patch  ', patchPath);
    return;
  }

  // 1. link the package
  mkdirSync(dirname(linkPath), { recursive: true });
  try {
    if (lstatSync(linkPath).isSymbolicLink() || existsSync(linkPath)) rmSync(linkPath, { recursive: true, force: true });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  symlinkSync(PACKAGE_ROOT, linkPath, 'dir');
  console.log(`linked  : ${linkPath} -> ${PACKAGE_ROOT}`);

  // 2. add the loader row
  const patch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : '';
  if (patch.includes(`id: boot-screen`)) {
    console.log('patch   : boot-screen row already present, left untouched');
  } else {
    writeFileSync(patchPath, patch + ENTRY);
    console.log(`patched : ${patchPath}`);
  }

  console.log('\ndone. reload the DSH page (Cmd/Ctrl+R) to see the boot screen.');
  console.log('if this profile has no HMR, restart DSH once.');
}

main();
