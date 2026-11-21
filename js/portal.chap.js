/* MikroTik HTTP-CHAP (RFC 1321 MD5). Local, ES5-compatible, no remote dependencies.
 * RouterOS response = MD5(chap-id byte + UTF-8 password + 16 challenge bytes).
 * HTTP-CHAP is not TLS: HTTPS is still preferred for confidentiality. */
(function (w) {
'use strict';
var SHIFTS = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
  5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
  4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
  6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
var CONSTANTS = [
  0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
  0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
  0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
  0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
  0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
  0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
  0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
  0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
];
function escapedBytes(value) {
  var s=String(value == null ? '' : value), out=[], i=0, part;
  if (!s || s.indexOf('$(')!==-1) throw new Error('Unresolved RouterOS template');
  while (i<s.length) {
    if (s.charAt(i)==='%') {
      part=s.substr(i+1,2);
      if(!/^[0-9a-fA-F]{2}$/.test(part)) throw new Error('Invalid escaped challenge');
      out.push(parseInt(part,16));i+=3;
    } else if (s.charAt(i)==='+') {out.push(32);i++;}
    else {
      part=s.charCodeAt(i++);
      if (part>127) throw new Error('Non-ASCII challenge encoding');
      out.push(part);
    }
  }
  if (out.length===1 || out.length===16) return out;
  /* Some RouterOS versions URL-escape textual backslash-octal sequences. */
  var ascii='', decoded=[];
  for(i=0;i<out.length;i++) ascii+=String.fromCharCode(out[i]);
  if (!/^(?:\\[0-7]{3})+$/.test(ascii)) return out;
  for(i=0;i<ascii.length;i+=4) decoded.push(parseInt(ascii.substr(i+1,3),8));
  return decoded;
}
function utf8Bytes(value) {
  var result=[],s=String(value),i=0,c,next;
  for (;i<s.length;i++) {
    c=s.charCodeAt(i);
    if(c>=0xd800&&c<=0xdbff && i+1<s.length) {
      next=s.charCodeAt(i+1);
      if(next>=0xdc00&&next<=0xdfff){c=((c-0xd800)<<10)+(next-0xdc00)+0x10000;i++;}
    }
    if(c<0x80)result.push(c);
    else if(c<0x800)result.push(0xc0|(c>>6),0x80|(c&63));
    else if(c<0x10000)result.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));
    else result.push(0xf0|(c>>18),0x80|((c>>12)&63),0x80|((c>>6)&63),0x80|(c&63));
  }
  return result;
}
function hexWord(word) {
  var out='',i,n;
  for(i=0;i<4;i++) {n=(word>>>(8*i))&255;out+=('0'+n.toString(16)).slice(-2);}
  return out;
}
function md5(bytes) {
  var arr=bytes.slice(),bitLow=(arr.length*8)>>>0,bitHigh=Math.floor(arr.length/0x20000000)>>>0;
  arr.push(128);
  while(arr.length%64!==56)arr.push(0);
  var i;
  for(i=0;i<4;i++)arr.push((bitLow>>>(8*i))&255);
  for(i=0;i<4;i++)arr.push((bitHigh>>>(8*i))&255);
  var a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  for(var start=0;start<arr.length;start+=64) {
    var m=[],j;
    for(j=0;j<16;j++){
      var offset=start+j*4;
      m[j]=(arr[offset]|arr[offset+1]<<8|arr[offset+2]<<16|arr[offset+3]<<24)|0;
    }
    var a=a0,b=b0,c=c0,d=d0,f,g,t,rot;
    for(j=0;j<64;j++) {
      if(j<16){f=(b&c)|((~b)&d);g=j;}
      else if(j<32){f=(d&b)|((~d)&c);g=(5*j+1)%16;}
      else if(j<48){f=b^c^d;g=(3*j+5)%16;}
      else {f=c^(b|(~d));g=(7*j)%16;}
      t=(a+f+CONSTANTS[j]+m[g])|0;
      rot=SHIFTS[j];
      a=d;d=c;c=b;b=(b+((t<<rot)|(t>>>(32-rot))))|0;
    }
    a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
  }
  return hexWord(a0)+hexWord(b0)+hexWord(c0)+hexWord(d0);
}
function challengeResponse(id, password, challenge) {
  var idBytes=escapedBytes(id), challengeBytes=escapedBytes(challenge);
  if(idBytes.length!==1 || challengeBytes.length!==16) throw new Error('Missing or malformed CHAP challenge');
  return md5(idBytes.concat(utf8Bytes(password),challengeBytes));
}
w.PortalChap={challengeResponse:challengeResponse};
})(window);
