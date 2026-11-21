/* Offline tests: node --test tests/portal.test.js. No router or external modules. */
'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
const js = read('js/portal.core.js');
const css = read('css/style.css');

function diagnostics() {
  const win = {PORTAL_CONFIG: {passwordRequired: true}};
  const doc = {readyState:'loading', addEventListener() {}};
  vm.runInNewContext(js, {window:win, document:doc, console, setTimeout, clearTimeout});
  assert.ok(win.PortalDiagnostics, 'diagnostics should initialize on old browsers');
  return win.PortalDiagnostics;
}

test('core script parses and exposes offline classifier', () => {
  assert.equal(typeof diagnostics().classifyHotspotError, 'function');
});

test('MikroTik errors are classified without inventing a quota cause', () => {
  const classify = diagnostics().classifyHotspotError;
  const cases = [
    ['not enough credit', 'NO_CREDIT', 'انتهى رصيد الكرت'],
    ['transfer limit reached', 'DATA_LIMIT', 'انتهى رصيد الكرت'],
    ['uptime limit reached', 'TIME_LIMIT', 'انتهى وقت الكرت'],
    ['account expired', 'EXPIRED', 'انتهت صلاحية الكرت'],
    ['too many active sessions', 'SESSION_LIMIT', 'الكرت لديه جلسة نشطة'],
    ['MAC mismatch', 'DEVICE_RESTRICTION', 'هذا الكرت غير مسموح على هذا الجهاز'],
    ['user not found', 'USER_NOT_FOUND', 'الكرت خطأ، حاول بكرت آخر'],
    ['invalid username or password', 'INVALID_CREDENTIALS', 'اسم المستخدم أو كلمة المرور خطأ'],
    ['RADIUS timeout', 'AUTH_SERVER_UNAVAILABLE', 'خادم الشبكة لا يستجيب، حاول لاحقا'],
    ['unmapped rejection', 'UNKNOWN', 'تعذر تسجيل الدخول، حاول مجددا أو تواصل مع الدعم'],
  ];
  for (const [error, code, message] of cases) {
    const out = classify(error, true);
    assert.equal(out.code, code, error);
    assert.equal(out.message, message, error);
  }
});

test('Arabic numerals normalize, usernames strip spaces, passwords keep spaces', () => {
  const norm = diagnostics().normalize;
  assert.equal(norm(' ١٢۳٤\u200B  ', true), '1234');
  assert.equal(norm(' ١٢۳٤  ', false), ' 1234  ');
});

test('native form fallback stays available and old input markup is valid', () => {
  assert.match(html, /name="login"[^>]*>/);
  assert.match(html, /action="\$\(link-login-only\)"/);
  assert.match(html, /name="username"/);
  assert.match(html, /name="password"/);
  assert.match(html, /id="manualLoginFallback"/);
  assert.doesNotMatch(html, /<\/input>/i);
  assert.match(js, /if \(!canRequest\(\)\) return; \/\* Preserve native POST/);
  assert.match(css, /\.manual-login-fallback\[hidden\]\{display:none!important\}/);
});

test('all referenced assets exist and logo animation is transform-based', () => {
  for (const name of ['css/style.css', 'js/portal.core.js', 'font/Almarai.woff2', 'font/fontello-used.woff']) {
    assert.ok(fs.existsSync(path.join(root,name)), name);
  }
  for (const id of ['jawharaAnimatedLogo', 'login', 'status', 'error', 'previousCardsList', 'speedConfirmation']) {
    assert.match(html, new RegExp('id="' + id + '"'), id);
  }
  assert.match(html, /jawharaR5Spin/);
  assert.match(html, /translate\(-50%,-50%\)/);
  assert.ok(Buffer.byteLength(css) < 75000, 'style should remain lightweight');
  assert.ok(Buffer.byteLength(js) < 75000, 'script should remain lightweight');
});

test('RouterOS template files retain the asynchronous JSON response contracts', () => {
  assert.match(read('login.html'), /"action":"onLoginError"/);
  assert.match(read('flogin.html'), /"action":"onLoginError"/);
  assert.match(read('alogin.html'), /"action":"onLoggedIn"/);
  assert.match(read('status.html'), /"action":"onStatusQuery"/);
  assert.match(read('logout.html'), /"action":"onLoggedOut"/);
  assert.match(read('login.html'), /\$\(error-orig-esc\)/);
});
