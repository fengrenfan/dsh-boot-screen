/**
 * Dev harness: render the exact rows the host plugin contributes into a
 * stand-in index.html, so the browser half can be exercised (and screenshotted)
 * without a running DSH host.
 *
 *   node tools/build-harness.mjs [out.html]
 *
 * Query parameters for the generated page:
 *   ?at=3.2&freeze=1   freeze the boot sequence at 3.2s
 *   ?ready=600         mount a fake app into #root after 600ms
 */
import { writeFileSync } from 'node:fs';
import { bootScreenFragments } from '../lib/index.js';

const out = process.argv[2] ?? new URL('./preview.html', import.meta.url).pathname;
const { style, script } = bootScreenFragments({ speed: 1 });

const head = style;
const body = script;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>boot screen harness</title>
${head}
</head>
<body>
<script>
  var q = new URLSearchParams(location.search);
  if (q.has('at')) window.__DSH_BOOT_SCREEN_TEST__ = { at: Number(q.get('at')), freeze: q.has('freeze') };
  if (q.has('freeze')) {
    document.write('<style>' +
      '#dsh-boot .dshb-title h1{animation:none!important;filter:none!important;letter-spacing:.1em!important;opacity:1!important}' +
      '#dsh-boot .dshb-sub,#dsh-boot .dshb-meta{animation:none!important;opacity:1!important}' +
      '</style>');
  }
</script>
${body}
<div id="root"></div>
<script>
  setTimeout(function () {
    var q = new URLSearchParams(location.search);
    var ms = q.has('ready') ? Number(q.get('ready')) : 1400;
    setTimeout(function () {
      document.getElementById('root').innerHTML =
        '<div style="padding:40px;font:14px monospace;color:#9fd">stub app mounted</div>';
    }, ms);
  }, 0);
</script>
</body>
</html>
`;

writeFileSync(out, html);
console.log('wrote', out, html.length, 'bytes');
