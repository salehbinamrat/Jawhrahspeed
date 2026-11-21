#!/usr/bin/env python3
"""Chromium smoke tests with inline assets and a fake RouterOS transport.

The runner deliberately uses page.set_content rather than loading a network URL:
these checks do not validate a real MikroTik or any actual speed-profile switch.
"""
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FAKE_XHR = r"""<script>
(function(){
window.__portalLoggedIn=false;
window.XMLHttpRequest=function(){this.readyState=0;this.status=0;this.onreadystatechange=null;this.onerror=null;};
XMLHttpRequest.prototype.open=function(m,u){this._method=m;this._url=u;};
XMLHttpRequest.prototype.setRequestHeader=function(){};
XMLHttpRequest.prototype.abort=function(){};
XMLHttpRequest.prototype.send=function(){
 var t=this, response, url=this._url;
 if(url.indexOf('/login?')===0){window.__portalLoggedIn=true;response={action:'onLoggedIn',logged_in:'yes'};}
 else if(url.indexOf('/logout?')===0){window.__portalLoggedIn=false;response={action:'onLoggedOut',logged_in:'no'};}
 else {response={action:'onStatusQuery',logged_in:window.__portalLoggedIn?'yes':'no',username:'12345',remain_bytes_total:'---',session_time_left:'---',uptime:'0s',bytes_in:'0',bytes_out:'0'};}
 setTimeout(function(){t.responseText=JSON.stringify(response);t.status=200;t.readyState=4;if(t.onreadystatechange)t.onreadystatechange();},0);
};
})();
</script>"""


def prepared_html(legacy_only=False):
    raw = (ROOT / 'index.html').read_text(encoding='utf-8')
    for file in ('legacy.css','style.css'):
        pat = r'<link href="css/' + file.replace('.',r'\.') + r'\?[^\"]+" rel="stylesheet"\s*/>'
        code = (ROOT / 'css' / file).read_text(encoding='utf-8')
        replacement = '' if legacy_only and file=='style.css' else '<style>' + code + '</style>'
        raw, count = re.subn(pat, lambda _:replacement, raw)
        assert count == 1, f'Missing CSS reference: {file}'
    script = (ROOT / 'js/portal.core.js').read_text(encoding='utf-8')
    raw,count = re.subn(r'(<script[^>]*?)\s+src="js/portal.core.js\?[^\"]+"([^>]*>)(\s*)</script>',
                        lambda m:m.group(1)+m.group(2)+script+'</script>',raw)
    assert count == 1, 'Portal JS must run in the browser smoke test'
    raw = raw.replace('<head>', '<head>'+FAKE_XHR, 1)
    if legacy_only:
        raw = raw.replace('<head>', '<head><script>document.documentElement.className+=" no-css-vars"</script>',1)
    return raw


def run():
    findings=[]
    with sync_playwright() as p:
        executable = (shutil.which('chromium') or shutil.which('chromium-browser')
                      or shutil.which('google-chrome'))
        options = {'headless':True, 'args':['--no-sandbox','--disable-dev-shm-usage']}
        if executable: options['executable_path'] = executable
        browser=p.chromium.launch(**options)
        for width,height in [(280,568),(320,568),(360,640),(393,850),(430,740)]:
            page=browser.new_page(viewport={'width':width,'height':height})
            page.set_content(prepared_html(),wait_until='domcontentloaded')
            page.wait_for_timeout(100)
            horizontal=page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth + 2')
            visible=page.locator('.login-submit').is_visible()
            assert visible and not horizontal, (width,visible,horizontal)
            findings.append(f'{width}x{height}: login visible; no horizontal overflow')
            if width==393:
                page.locator('button[parent-id="previous-cards"]').click()
                assert page.locator('#previous-cards').is_visible()
                page.locator('#previous-cards .app-logout').click()
                assert page.locator('.login-submit').is_visible()
                page.locator('input[name=username]').fill('12345')
                page.locator('input[name=password]').fill('abcdef')
                page.locator('.login-submit').click()
                page.locator('#status').wait_for(state='visible', timeout=5000)
                assert page.locator('#username').inner_text().strip()=='12345'
                assert page.locator('#remain_bytes_total').inner_text().strip()=='غير متاح'
                page.locator('.logout-submit').click()
                page.locator('.login-submit').wait_for(state='visible',timeout=5000)
                findings.append('Mock login, status, logout and saved-cards popup passed')
            page.close()
        page=browser.new_page(viewport={'width':320,'height':568},java_script_enabled=False)
        page.set_content(prepared_html())
        assert page.locator('form[name=login] input[name=username]').is_visible()
        assert page.locator('form[name=login] button[type=submit]').is_visible()
        findings.append('No-JavaScript native login form visible')
        page.close()
        page=browser.new_page(viewport={'width':320,'height':568})
        page.set_content(prepared_html(legacy_only=True))
        assert page.locator('.login-submit').is_visible()
        assert page.locator('.speed-choice').count()==4
        assert page.locator('.speed-card').first.is_visible()
        findings.append('Legacy CSS only: login and four speed options visible')
        page.close()
        browser.close()
    print('BROWSER SMOKE PASSED:\n  '+'\n  '.join(findings))


if __name__=='__main__':run()
