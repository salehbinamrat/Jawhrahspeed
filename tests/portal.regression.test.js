'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../js/portal.core.js'), 'utf8');
const chapSource = fs.readFileSync(path.join(__dirname, '../js/portal.chap.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
class Storage {
  constructor(values={}) { this.map = {...values}; }
  getItem(k) { return Object.hasOwn(this.map,k) ? this.map[k] : null; }
  setItem(k,v) { this.map[k] = String(v); }
  removeItem(k) { delete this.map[k]; }
}
class Element {
  constructor(id='') { this.id=id; this.className=''; this.style={}; this.value=''; this.checked=false; this.disabled=false; this.textContent=''; this.children=[]; this.firstChild=null; this.listeners={}; this.attributes={}; this.type='text'; }
  addEventListener(t,f){ (this.listeners[t]??=[]).push(f); }
  setAttribute(k,v){this.attributes[k]=String(v);}
  removeAttribute(k){delete this.attributes[k];}
  getAttribute(k){return this.attributes[k]??null;}
  appendChild(e){this.children.push(e);this.firstChild=this.children[0]||null;}
  removeChild(e){this.children=this.children.filter(x=>x!==e);this.firstChild=this.children[0]||null;}
  querySelectorAll(){return [];} focus(){}
  emit(t){ for(const cb of this.listeners[t] || []) cb({preventDefault(){},returnValue:true}); }
}
function simulator({loginError='invalid username or password', success=false, bootUser=null, blockState=null, passwordOptIn=false, savedCards=null, cookieThrows=false, authMode='pap', chapBroken=false}={}) {
  let clock = 1700000000000, nextTimer=0;
  let tasks=[], requests=[];
  function delay(fn, ms){const task={id:++nextTimer,at:clock+(Number(ms)||0),fn}; tasks.push(task);return task.id;}
  function cancel(id){tasks=tasks.filter(t=>t.id!==id);}
  function advance(ms){ const target=clock+ms;for(let i=0;i<1000;i++){
    tasks.sort((a,b)=>a.at-b.at || a.id-b.id);const next=tasks[0];if(!next||next.at>target) break;
    tasks.shift();clock=next.at;next.fn();}clock=target;
  }
  class FakeDate extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
  const local=new Storage(savedCards?{'jawhara_success_cards_v3':JSON.stringify({savedAt:clock-1000,cards:savedCards})}:{});
  if(passwordOptIn) local.setItem('jawhara_success_cards_v3_password_opt_in','1');
  const session=new Storage(blockState?{'jawhara_bad_attempts_v3':JSON.stringify(blockState)}:{});
  const nodes={}; const el=id=>nodes[id]??(nodes[id]=new Element(id));
  const username=el('input-username'), password=el('input-password');
  const form=new Element('form');form.name='login';form.elements={namedItem:n=> n==='username'?username:n==='password'?password:null};form.submit=()=>{requests.push({method:'NATIVE'});};
  const speed=['hotspot','najm-speed-3m','najm-speed-10m','najm-speed-open'].map((value,i)=>Object.assign(new Element(),{value,checked:i===0}));
  const doc={readyState:'complete',forms:{login:form},body:el('body'),documentElement:el('html'),cookie:'',hidden:false,
    getElementById:el,createElement:()=>new Element(),querySelector(q){if(q==='.login-submit')return el('submit');if(q==='.logout-submit')return el('logout');if(q==='script[enable-hot-blocker]'){const e=el('blocker');e.setAttribute('try-count','10');e.setAttribute('block-time','1');return e;}if(q==='[count-down-span]')return el('countdown');return null;},
    querySelectorAll(){return [];},getElementsByName(n){return n==='speed-choice'?speed:[];},addEventListener(){} };
  if (cookieThrows) Object.defineProperty(doc, 'cookie', {
    get(){throw new Error('cookie read blocked by captive WebView');},
    set(){throw new Error('cookie write blocked by captive WebView');}
  });
  const win={PORTAL_CONFIG:{site:'jawhara',passwordRequired:true,storageKey:'jawhara_success_cards_v3',speedKey:'jawhara_speed_choice',blockKey:'jawhara_bad_attempts_v3',speedPorts:{'najm-speed-3m':62021,'najm-speed-10m':62022,'najm-speed-open':62024},speedNames:{hotspot:'هوتسبوت','najm-speed-3m':'ضعيفة','najm-speed-10m':'متوسطة','najm-speed-open':'مفتوحة'}},
    location:{protocol:'http:',hostname:'router.local',search:''},navigator:{userAgent:'Android 6',hardwareConcurrency:4},localStorage:local,sessionStorage:session,Intl,Image:class {set src(url){requests.push({image:url});}}};
  class XHR {
    open(method,url){this.method=method;this.url=url;this.readyState=1;}setRequestHeader(){}
    send(body){requests.push({method:this.method,url:this.url,body});delay(()=>{
      const reply=this.url.startsWith('/login?var=challenge')?{action:'onChapInfo',mode:authMode,id:chapBroken?'$(chap-id-esc)':'%F9',challenge:'%00%10%20%30%40%50%60%70%80%90%A0%B0%C0%D0%E0%F0'}:
        this.url.startsWith('/status')?{action:'onStatusQuery',logged_in:bootUser?'yes':'no',username:bootUser,remain_bytes_total:'---',session_time_left:'---'}:
        this.url.startsWith('/login')?(success?{action:'onLoggedIn',logged_in:'yes'}:{action:'onLoginError',logged_in:'no',error_orig:loginError}):{action:'onLoggedOut',logged_in:'no'};
      this.readyState=4;this.status=200;this.responseText=JSON.stringify(reply);if(this.onreadystatechange)this.onreadystatechange();
    },1);}
    abort(){this.aborted=true;}
  }
  win.XMLHttpRequest=XHR;
  vm.runInNewContext(chapSource,{window:win,document:doc});
  vm.runInNewContext(source,{window:win,document:doc,Image:win.Image,Date:FakeDate,setTimeout:delay,clearTimeout:cancel,console,encodeURIComponent,decodeURIComponent});
  advance(5); // initial status request
  function enter(user='card1',pass='secret',speedName='hotspot'){
    username.value=user;password.value=pass;
    speed.forEach(s=>s.checked=s.value===speedName);form.emit('submit');advance(speedName==='hotspot'?5:720);
  }
  return {win,doc,el,form,local,session,speed,requests,advance,enter};
}

test('specific errors are accurate; ambiguous errors do not claim card or password failure',()=>{
 const classify=simulator().win.PortalDiagnostics.classifyHotspotError;
 for(const text of ['radius reject','Access-Reject','authentication failed','login denied','no valid profile']) {
   const e=classify(text,true);
   assert.equal(e.credentialFailure,false,text);
 }
 assert.equal(classify('already logged in',true).message,'الكرت لديه جلسة نشطة');
 assert.match(classify('no valid profile',true).message,/باقة صالحة/);
 assert.match(classify('radius reject',false).message,/تعذر/);
});

test('expired browser block resets count; the first new mistake does not immediately relock',()=>{
 const sim=simulator({blockState:{count:10,until:1699999000000}});
 sim.enter('bad','pass');
 const state=JSON.parse(sim.session.getItem('jawhara_bad_attempts_v3'));
 assert.equal(state.count,1);
 assert.equal(state.until,0);
 assert.notEqual(sim.el('block').style.display,'block');
});

test('without explicit opt-in, last two card names remain but passwords are not persisted',()=>{
 const sim=simulator({success:true,savedCards:[{username:'old',password:'old-secret'}]});
 const old=JSON.parse(sim.local.getItem('jawhara_success_cards_v3'));
 assert.equal(old.cards[0].username,'old');
 assert.equal(old.cards[0].password,'');
 assert.equal(old.savedAt,1699999999000,'scrubbing old credentials must not extend retention');
 sim.enter('new','new-secret');
 const cards=JSON.parse(sim.local.getItem('jawhara_success_cards_v3')).cards;
 assert.deepEqual(cards.map(c=>c.username),['new','old']);
 assert.ok(cards.every(c=>c.password===''));
});

test('explicit save-password opt-in retains credentials, and disabling clears them',()=>{
 const sim=simulator({success:true,passwordOptIn:true});
 sim.enter('alice','password1');
 assert.equal(JSON.parse(sim.local.getItem('jawhara_success_cards_v3')).cards[0].password,'password1');
 const checkbox=sim.el('rememberPasswordChoice');checkbox.checked=false;checkbox.emit('change');
 assert.equal(JSON.parse(sim.local.getItem('jawhara_success_cards_v3')).cards[0].password,'');
 assert.equal(sim.local.getItem('jawhara_success_cards_v3_password_opt_in'),null);
});

test('failed attempts never persist requested speed; successful attempts show requested, not verified speed',()=>{
 const failed=simulator();failed.enter('card1','secret','najm-speed-10m');
 assert.equal(failed.session.getItem('jawhara_speed_choice'),null);
 const ok=simulator({success:true});ok.enter('card1','secret','najm-speed-10m');
 assert.equal(ok.session.getItem('jawhara_speed_choice'),'najm-speed-10m');
 assert.match(ok.el('speed_choice').textContent,/متوسطة/);
 assert.match(html,/السرعة المطلوبة عند الدخول/);
});

test('unknown quota/uptime fields show unavailable, not unlimited',()=>{
 const sim=simulator({bootUser:'card1'});
 assert.equal(sim.el('remain_bytes_total').textContent,'غير متاح');
 assert.equal(sim.el('session_time_left').textContent,'غير متاح');
 assert.notEqual(sim.el('speed_choice').textContent,'هوتسبوت');
});

test('HTML offers accessible inputs and retains every speed, popup and logo',()=>{
 for(const id of ['login','status','block','previous-cards','price','sell-point','instructions','jawharaAnimatedLogo','rememberPasswordChoice']) assert.match(html,new RegExp('id="'+id+'"'));
 for(const speed of ['hotspot','najm-speed-3m','najm-speed-10m','najm-speed-open'])assert.match(html,new RegExp('value="'+speed+'"'));
 assert.match(html,/aria-label="اسم المستخدم/);
 assert.match(html,/aria-label="كلمة المرور/);
 assert.match(html,/action="\$\(link-login-only\)"/);
});

test('custom speed keeps all three port signals and domain parameter, without storing a rejected choice',()=>{
 const sim=simulator({loginError:'invalid password'});
 sim.enter('card1','p','najm-speed-3m');
 const images=sim.requests.filter(x=>x.image);
 assert.equal(images.length,3);
 assert.ok(images.every(x=>x.image.includes(':62021/najm-speed.gif')));
 const login=sim.requests.find(x=>x.url?.startsWith('/login') && x.method === 'POST');
 assert.ok(login);
 assert.match(login.body,/domain=najm-speed-3m/);
 assert.equal(sim.session.getItem('jawhara_speed_choice'),null);
});

test('the two-card popup can fill the saved username and opted-in password',()=>{
 const sim=simulator({success:true,passwordOptIn:true});
 sim.enter('alice','alpha');
 // Emulate the second successful login through seeded history to verify the actual click handler.
 const seeded=simulator({passwordOptIn:true,savedCards:[{username:'bob',password:'bravo'},{username:'alice',password:'alpha'}]});
 const list=seeded.el('previousCardsList');
 assert.equal(list.children.length,2);
 list.children[1].emit('click');
 assert.equal(seeded.form.elements.namedItem('username').value,'alice');
 assert.equal(seeded.form.elements.namedItem('password').value,'alpha');
});

test('logout still works and clears requested-speed state',()=>{
 const sim=simulator({success:true});
 sim.enter('card1','p','najm-speed-10m');
 assert.equal(sim.session.getItem('jawhara_speed_choice'),'najm-speed-10m');
 sim.el('logout').emit('click');sim.advance(5);
 assert.ok(sim.requests.some(x=>x.url?.startsWith('/logout')));
 assert.equal(sim.session.getItem('jawhara_speed_choice'),null);
 assert.equal(sim.el('login').style.display,'block');
});

test('restricted captive WebViews without cookie access can still initialize and log in',()=>{
 const sim=simulator({cookieThrows:true, success:true});
 sim.enter('alice','correct');
 assert.ok(sim.requests.some(r=>r.url?.startsWith('/login')));
 assert.equal(sim.el('status').style.display,'block');
});

test('CHAP-enabled router gets a fresh challenge and receives digest, never plaintext',()=>{
 const sim=simulator({success:true,authMode:'chap'});
 sim.enter('card9','secret-pass');
 const get=sim.requests.find(x=>x.url?.startsWith('/login?var=challenge'));
 const post=sim.requests.find(x=>x.url?.startsWith('/login') && x.method==='POST');
 assert.ok(get,'CHAP challenge was not requested from /login');
 assert.ok(post,'CHAP login POST was not attempted');
 const id=Buffer.from([249]);
 const challenge=Buffer.from('00102030405060708090a0b0c0d0e0f0','hex');
 const expected=crypto.createHash('md5').update(Buffer.concat([id,Buffer.from('secret-pass'),challenge])).digest('hex');
 const form=new URLSearchParams(post.body);
 assert.equal(form.get('username'),'card9');
 assert.equal(form.get('password'),expected);
 assert.ok(!post.body.includes('secret-pass'), 'plaintext password was transmitted');
 assert.equal(sim.el('status').style.display,'block');
});

test('malformed CHAP response never falls back to sending a raw password',()=>{
 const sim=simulator({authMode:'chap',chapBroken:true});
 sim.enter('card9','secret-pass');
 assert.ok(sim.requests.some(x=>x.url?.startsWith('/login?var=challenge')));
 assert.equal(sim.requests.filter(x=>x.method==='POST' && x.url?.startsWith('/login')).length,0);
 assert.match(sim.el('error').textContent,/تحدي المصادقة/);
 assert.equal(sim.el('manualLoginFallback').getAttribute('hidden'),null);
});
