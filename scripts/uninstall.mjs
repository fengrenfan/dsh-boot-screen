#!/usr/bin/env node
/**
 * Remove dsh-boot-screen from a DSH profile.
 *
 *   node scripts/uninstall.mjs [--profile <name>] [--home <dir>] [--dry-run]
 */
import { existsSync, lstatSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

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

/** The exact block install.mjs appends. */
const ENTRY = `\n- insert:\n    - id: boot-screen\n      name: "${PACKAGE_NAME}"\n`;

const linkPath = join(profileDir, 'node_modules', PACKAGE_NAME);
const patchPath = join(profileDir, 'cordis.patch.yml');

if (!existsSync(profileDir)) {
  console.error(`profile not found: ${profileDir}`);
  process.exit(1);
}

if (dryRun) {
  console.log('[dry-run] would unlink', linkPath);
  console.log('[dry-run] would patch ', patchPath);
  process.exit(0);
}

// 1. drop the row
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8');
  if (patch.includes(ENTRY)) {
    writeFileSync(patchPath, patch.replace(ENTRY, '\n'));
    console.log(`unpatched: ${patchPath}`);
  } else if (patch.includes('id: boot-screen')) {
    console.warn('warning: a boot-screen row exists but was edited by hand; remove it manually');
  } else {
    console.log('patch   : no boot-screen row, nothing to do');
  }
}

// 2. drop the link
let present = false;
try {
  lstatSync(linkPath);
  present = true;
} catch {
  present = false;
}
if (present) {
  rmSync(linkPath, { recursive: true, force: true });
  console.log(`unlinked : ${linkPath}`);
} else {
  console.log('link     : nothing to remove');
}

console.log('\ndone. reload the page to return to the stock shell.');
