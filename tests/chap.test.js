'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root=path.resolve(__dirname,'..');
const src=(x)=>fs.readFileSync(path.join(root,x),'utf8');

function chapApi(){
  const window={};
  vm.runInNewContext(src('js/portal.chap.js'), {window});
  return window.PortalChap;
}
function pct(buf){return Array.from(buf,x=>'%'+x.toString(16).padStart(2,'0').toUpperCase()).join('');}

test('RouterOS CHAP response MD5(id + UTF8 password + challenge) matches Node crypto',()=>{
  const chap=chapApi();
  for (const pass of ['123456','A long password!','كلمة مرور ١٢٣','']) {
    const id=Buffer.from([0xf9]);
    const challenge=Buffer.from([0,10,255,16,43,92,12,19,24,121,0,4,200,0,234,16]);
    const expected=crypto.createHash('md5').update(Buffer.concat([id,Buffer.from(pass),challenge])).digest('hex');
    assert.equal(chap.challengeResponse(pct(id),pass,pct(challenge)),expected);
  }
});
test('CHAP decodes both URL-escaped octets and RouterOS backslash-octal escaped octets',()=>{
  const chap=chapApi();
  const challenge=Buffer.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
  const octal=Array.from(challenge,b=>'\\'+b.toString(8).padStart(3,'0')).join('');
  const escaped=encodeURIComponent(octal);
  const expected=crypto.createHash('md5').update(Buffer.concat([Buffer.from([249]),Buffer.from('abc'),challenge])).digest('hex');
  assert.equal(chap.challengeResponse('%F9','abc',escaped),expected);
});
test('CHAP rejects unresolved RouterOS placeholders and broken challenge bytes',()=>{
  const chap=chapApi();
  for (const bad of ['$(chap-id-esc)','', '%ZZ','%FF%00']){
    assert.throws(()=>chap.challengeResponse(bad,'pw','%00'.repeat(16)));
  }
  assert.throws(()=>chap.challengeResponse('%01','pw',''));
  assert.throws(()=>chap.challengeResponse('%01','pw','%00'.repeat(15)));
});
test('MikroTik login endpoint returns explicit challenge JSON before callback path and a CHAP direct fallback',()=>{
  const login=src('login.html');
  assert.match(login,/\$\(if var == "challenge"\)/);
  assert.match(login,/"action":"onChapInfo"/);
  assert.match(login,/\$\(chap-id-esc\)/);
  assert.match(login,/\$\(chap-challenge-esc\)/);
  assert.match(login,/PortalChap\.challengeResponse/);
  assert.match(login,/js\/portal\.chap\.js/);
  assert.equal(src('flogin.html'),login);
});
test('Front page does not POST cleartext password before challenge negotiation',()=>{
  const core=src('js/portal.core.js');
  assert.match(core,/\/login\?var=challenge/);
  assert.match(core,/PortalChap\.challengeResponse/);
  assert.match(core,/onChapInfo/);
  assert.match(src('index.html'),/js\/portal\.chap\.js\?/);
});
