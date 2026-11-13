/**
 * dsh-boot-screen — host half.
 *
 * Contributes the boot screen to every served Web shell index, ahead of the
 * shell's module script:
 *
 *   <style>  the boot screen's scoped CSS, at the top of <head>
 *   <script> the boot screen itself, as the first child of <body>, before
 *            #root and before the deferred module entry
 *
 * It uses the webserver's public `tapIndex` transform, which runs after the
 * structured index rows and is the documented escape hatch for markup no
 * injection row expresses.
 *
 * @module dsh-boot-screen
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MANIFEST = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Cordis plugin name. */
export const name = 'boot-screen';

/** The index transform lives on the web server service. */
export const inject = ['webServer'];

const BOOT_JS = fileURLToPath(new URL('./boot.js', import.meta.url));
const BOOT_CSS = fileURLToPath(new URL('./boot.css', import.meta.url));
const PORTRAIT_B64 = fileURLToPath(new URL('./assets/portrait.b64', import.meta.url));

/** Marks an index that already carries the screen. */
const MARKER = 'data-dsh-boot-screen';

/** Defaults; every field is optional in the profile patch. */
const DEFAULTS = {
  /** Play the screen at all. */
  enabled: true,
  /** Global time multiplier: 1 = ~6s, 1.6 = ~3.8s, 0.6 = ~10s. */
  speed: 1,
  /** Skip on later loads in the same tab (sessionStorage). */
  oncePerSession: false,
  /** Let a click or key press skip the sequence. */
  skippable: true,
  /** Start the sequence on load instead of waiting for the start gate. */
  autostart: false,
  /**
   * 'ask'  show a "tap for sound" chip; the click unlocks audio without
   *        skipping (browsers refuse silent autoplay anyway)
   * 'off'  never play audio
   * 'auto' try to start audio without a gesture, fall back to the chip
   */
  sound: 'ask',
  /**
   * Inject the screen into the served index. The desktop shell renders
   * `dsh-app://app/` from the packaged dist instead of this HTTP index, so it
   * always relies on the client half; set false to exercise only that half.
   */
  inline: true,
};

/**
 * Serialize the browser settings into the global the script reads.
 *
 * @param config - Plugin configuration.
 * @returns JavaScript source assigning `globalThis.__DSH_BOOT_SCREEN__`.
 */
export function bootScreenConfigScript(config = {}) {
  const settings = { ...DEFAULTS, ...config };
  return (
    'globalThis.__DSH_BOOT_SCREEN__=' +
    JSON.stringify({
      enabled: settings.enabled,
      speed: settings.speed,
      oncePerSession: settings.oncePerSession,
      skippable: settings.skippable,
      autostart: settings.autostart,
      sound: settings.sound,
      inline: settings.inline,
    }) +
    ';'
  );
}

/**
 * Render the two index fragments for one served document.
 *
 * @param config - Plugin configuration.
 * @returns the style markup and the body script markup.
 */
export function bootScreenFragments(config = {}) {
  // The character travels inline: one request, no asset route, and the
  // desktop shell (which cannot resolve /plugins URLs) gets it too.
  let portrait = '';
  try {
    portrait = readFileSync(PORTRAIT_B64, 'utf8').trim();
  } catch (err) {
    // The package still works without the art: the scene just has no character.
  }
  const art = portrait
    ? 'globalThis.__DSH_BOOT_PORTRAIT__="data:image/webp;base64,' + portrait + '";\n'
    : '';
  const script =
    '<script ' + MARKER + '>' + bootScreenConfigScript(config) + '\n' + art +
    readFileSync(BOOT_JS, 'utf8') + '</script>';
  const style = '<style ' + MARKER + '>' + readFileSync(BOOT_CSS, 'utf8') + '</style>';
  return { style, script };
}

/**
 * Splice the fragments into an index.html body.
 *
 * @param html - The served index document.
 * @param config - Plugin configuration.
 * @returns The document carrying the boot screen, or the input untouched when
 *          it already carries one or has no head/body to splice into.
 */
export function injectBootScreen(html, config = {}) {
  if (typeof html !== 'string' || html.includes(MARKER)) return html;
  const { style, script } = bootScreenFragments(config);

  let out = html;
  const head = /<head(?:\s[^>]*)?>/i.exec(out);
  if (head) {
    const at = head.index + head[0].length;
    out = out.slice(0, at) + style + out.slice(at);
  } else {
    out = style + out;
  }

  const body = /<body(?:\s[^>]*)?>/i.exec(out);
  if (body) {
    const at = body.index + body[0].length;
    out = out.slice(0, at) + script + out.slice(at);
  } else {
    out = out + script;
  }
  return out;
}

/**
 * Register the index transform for the lifetime of the plugin fiber.
 *
 * @param ctx - Host plugin context (with `webServer` injected).
 * @param config - Plugin configuration from the profile patch.
 */
export function apply(ctx, config = {}) {
  if (config && config.enabled === false) return;
  const ws = ctx.webServer;
  if (!ws || typeof ws.tapIndex !== 'function') return;
  const inline = config.inline !== false;

  // Observable facts for `GET /dsh-boot-screen/health`: a public, read-only
  // route that answers even when the index itself needs a browser cookie.
  const stats = {
    version: MANIFEST.version,
    since: new Date().toISOString(),
    renders: 0,
    injected: 0,
    seen: 0,
    lastSeen: null,
    lastUa: null,
  };

  ctx.effect(() => {
    const disposeTap = !inline ? () => {} : ws.tapIndex((html) => {
      stats.renders += 1;
      stats.lastRender = new Date().toISOString();
      try {
        const out = injectBootScreen(html, config);
        if (out !== html) stats.injected += 1;
        return out;
      } catch (err) {
        // A broken asset must never take the shell down.
        return html;
      }
    });

    const send = (res, status, payload) => {
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      });
      res.end(JSON.stringify(payload));
    };

    const disposeHealth = ws.register({
      kind: 'exact',
      path: '/dsh-boot-screen/health',
      handler(req, res) {
        send(res, 200, { ok: true, ...stats });
      },
    });

    // Browser half reports that it actually mounted, so a served-but-dead
    // script is distinguishable from a never-served one.
    const disposeSeen = ws.register({
      kind: 'exact',
      path: '/dsh-boot-screen/seen',
      handler(req, res) {
        if (req.method !== 'POST' && req.method !== 'GET') {
          res.writeHead(405, { allow: 'POST, GET' });
          res.end();
          return;
        }
        stats.seen += 1;
        stats.lastSeen = new Date().toISOString();
        stats.lastUa = String(req.headers['user-agent'] || '').slice(0, 160);
        send(res, 200, { ok: true });
      },
    });

    return () => {
      disposeTap();
      disposeHealth();
      disposeSeen();
    };
  });
}
