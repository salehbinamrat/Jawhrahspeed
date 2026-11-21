'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('legacy stylesheet precedes modern stylesheet for browsers without custom properties', () => {
  const legacy = html.indexOf('css/legacy.css');
  const modern = html.indexOf('css/style.css');
  assert.ok(legacy > 0, 'legacy CSS link missing');
  assert.ok(modern > legacy, 'old browsers need fallbacks loaded first');
  const css = fs.readFileSync(path.join(root, 'css/legacy.css'), 'utf8');
  assert.match(css, /\.login-submit\s*\{/);
  assert.match(css, /\.login-input\s*\{/);
  assert.match(css, /\.app\.active/);
  assert.match(css, /\.speed-choice/);
  assert.ok(!css.includes('var(--'), 'legacy fallback cannot use CSS variables');
  assert.ok(!css.includes('display:grid'), 'legacy fallback must not require CSS Grid');
});

test('smallest phone widths do not inherit a forced 320px screen minimum', () => {
  const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*319px\)/);
  assert.match(css, /\.screen\s*\{min-width:\s*0/);
});

test('deployable contents are checked separately from source and tests', () => {
  const p = spawnSync('python3', ['scripts/build_release.py', '--check-only'], {cwd:root, encoding:'utf8'});
  assert.equal(p.status, 0, p.stderr + '\n' + p.stdout);
  assert.match(p.stdout, /VALIDATED/);
});

test('native RouterOS fallback stays available with POST not JSON callback', () => {
  assert.match(html, /action="\$\(link-login-only\)"/);
  assert.match(html, /method="post"/);
  assert.match(html, /id="manualLoginFallback"/);
  assert.match(fs.readFileSync(path.join(root, 'js/portal.core.js'), 'utf8'), /\$form\.submit\(\)/);
});

test('both modern and legacy short-screen layouts keep the login action accessible', () => {
  const modern = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  const legacy = fs.readFileSync(path.join(root, 'css/legacy.css'), 'utf8');
  assert.match(modern, /r8 compact-height usability/);
  assert.match(modern, /@media \(max-height:760px\)/);
  assert.match(legacy, /@media\(max-height:760px\)/);
  assert.match(legacy, /\.speed-options\{font-size:0\}/);
});
