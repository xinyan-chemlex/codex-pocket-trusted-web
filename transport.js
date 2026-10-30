const from64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const to64 = bytes => { let text = ''; for (const b of bytes) text += String.fromCharCode(b); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); };
const randomId = () => to64(crypto.getRandomValues(new Uint8Array(18)));
const aad = (bridge, epoch, client, id, direction, sequence = 0) => new TextEncoder().encode(JSON.stringify([bridge, epoch, client, id, direction, sequence]));
class RelayConnection {
  constructor(bridge, keyText = null, account = false) {
    this.bridge = bridge; this.pending = new Map(); this.subscriptions = new Set(); this.retry = 500;this.account=account;
    const params = new URLSearchParams(location.hash.slice(1)), saved = localStorage.getItem(`pocket-key:${bridge}`);
    this.keyText = keyText || params.get('key') || saved; if (this.keyText&&!account) localStorage.setItem(`pocket-key:${bridge}`, this.keyText);
  }
  connect() {
    if(this.closed)return Promise.reject(new Error('设备连接已关闭'));
    if(this.socket?.readyState===WebSocket.OPEN&&this.epoch)return Promise.resolve();
    if(this.connecting)return this.connecting;
    // Reserve the connection before key import yields; parallel requests share it.
    const attempt=this.open();this.connecting=attempt;
    attempt.finally(()=>{if(this.connecting===attempt)this.connecting=null;}).catch(()=>{});
    return attempt;
  }
  async open(){
    if(!this.keyText||!crypto.subtle)throw new Error('请先登录并连接 Mac');
    this.key ||= await crypto.subtle.importKey('raw',from64(this.keyText),'AES-GCM',false,['encrypt','decrypt']);
    if(this.closed)throw new Error('设备连接已关闭');
    return new Promise((resolve,reject)=>{
      const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/relay/client/${encodeURIComponent(this.bridge)}`);this.socket=socket;this.epoch=null;
      const timeout=setTimeout(()=>{socket.close();reject(new Error('连接尚未建立，请稍后重试'));},12000);
      socket.onmessage=event=>{
        if(this.closed||this.socket!==socket)return;
        const message=JSON.parse(event.data);
        if(message.type==='welcome'){
          const reconnect=this.hasConnected,changed=this.epoch&&this.epoch!==message.epoch;
          this.epoch=message.epoch;this.clientId=message.clientId;this.retry=500;this.hasConnected=true;clearTimeout(timeout);resolve();
          if(changed)this.failPending();if(reconnect)for(const sub of this.subscriptions)sub.reconnect();
        }else if(message.type==='offline'){
          this.epoch=null;this.failPending();for(const sub of this.subscriptions)sub.dispatchEvent(new Event('error'));
        }else if(message.type==='response'){
          const p=this.pending.get(message.id);if(!p)return;
          p.chain=p.chain.then(async()=>{
            if(message.sequence!==p.sequence++)throw new Error('响应顺序不匹配');
            const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(message.box.nonce),additionalData:aad(this.bridge,p.epoch,p.clientId,message.id,'response',message.sequence)},this.key,from64(message.box.data));
            if(this.pending.get(message.id)!==p)return;p.deliver(JSON.parse(new TextDecoder().decode(plaintext)));
          }).catch(()=>{p.reject(new Error('响应同步失败，请重新连接'));this.pending.delete(message.id);});
        }
      };
      socket.onclose=event=>{
        clearTimeout(timeout);if(this.socket!==socket)return;this.socket=null;this.epoch=null;reject(new Error('连接暂时中断'));this.failPending();
        if(this.account&&event.code===1008&&!this.closed&&/session|access|revoked|migrated/i.test(event.reason||''))window.dispatchEvent(new Event('pocket-access-ended'));
        for(const sub of this.subscriptions)sub.dispatchEvent(new Event('error'));
        if(!this.closed&&this.subscriptions.size){clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect().catch(()=>{}),this.retry);this.retry=Math.min(this.retry*2,10000);}
      };
      socket.onerror=()=>{};
    });
  }
  failPending() { for (const p of this.pending.values()) p.reject(new Error('连接暂时中断，正在确认已发送操作')); this.pending.clear(); }
  async send(path, payload, deliver, reject) {
    if (['/api/local-pairing', '/api/pairing/renew', '/api/devices/revoke'].includes(path.split('?')[0])) throw Object.assign(new Error('设备管理只能在 Mac 控制面板操作'), { status: 403 });
    try{await this.connect();}catch(error){error.code='not-sent';throw error;} const socket=this.socket,id = randomId(), epoch = this.epoch, clientId = this.clientId;
    const request = { method: payload === undefined ? 'GET' : 'POST', path, body: payload === undefined ? '' : JSON.stringify(payload), cookie: this.account?'':localStorage.getItem(`pocket-device:${this.bridge}`) || '' };
    const nonce = crypto.getRandomValues(new Uint8Array(12)), ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad(this.bridge, epoch, clientId, id, 'request') }, this.key, new TextEncoder().encode(JSON.stringify(request)));
    this.pending.set(id, { deliver: value => { if (value.kind === 'headers') this.cookies(value.headers); deliver(value); if (value.kind === 'end') this.pending.delete(id); }, reject, epoch, clientId, chain: Promise.resolve(), sequence: 0 });
    if (this.socket!==socket||socket?.readyState !== WebSocket.OPEN || this.epoch !== epoch||this.clientId!==clientId) { this.pending.delete(id); throw Object.assign(new Error('尚未发送，连接正在恢复，请重试'),{code:'not-sent'}); }
    socket.send(JSON.stringify({ type: 'request', id, box: { nonce: to64(nonce), data: to64(new Uint8Array(ciphertext)) } }));
    return () => { this.pending.delete(id); if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'cancel', id })); };
  }
  cookies(headers = {}) {
    if(this.account)return;
    const cookie = headers['set-cookie']; if (!cookie) return;
    if (/Max-Age=0(?:;|$)/i.test(cookie)) localStorage.removeItem(`pocket-device:${this.bridge}`);
    else localStorage.setItem(`pocket-device:${this.bridge}`, cookie.split(';')[0]);
  }
  request(path, payload) {
    return new Promise((resolve, reject) => {
      let status = 200, parts = [], size = 0, cancel;
      const timer = setTimeout(() => { cancel?.(); reject(Object.assign(new Error('操作结果尚未确认，请检查聊天后再重试'), { code: 'delivery-unconfirmed' })); }, 60000);
      const fail = e => { clearTimeout(timer); reject(e); };
      this.send(path, payload, value => {
        if (value.kind === 'headers') status = value.status;
        if (value.kind === 'chunk') { const chunk = from64(value.body); size += chunk.length; if (size > 32 * 1024 * 1024) { cancel?.(); fail(new Error('响应过大')); return; } parts.push(chunk); }
        if (value.kind === 'end') { clearTimeout(timer); const body = new Uint8Array(size); let offset = 0; for (const p of parts) { body.set(p, offset); offset += p.length; } try { const result = JSON.parse(new TextDecoder().decode(body)); if (status >= 400) reject(Object.assign(new Error(result.error || '操作失败'), { status, code: result.code })); else resolve(result); } catch (e) { reject(e); } }
      }, fail).then(fn => { cancel = fn; }).catch(fail);
    });
  }
  events(path) { const source = new RelayEvents(this, path); this.subscriptions.add(source); source.reconnect(); return source; }
  close(){this.closed=true;clearTimeout(this.timer);for(const sub of [...this.subscriptions])sub.close();this.failPending();this.socket?.close();this.key=null;this.keyText=null;}
}
class RelayEvents extends EventTarget {
  constructor(connection, path) { super(); this.connection = connection; this.path = path; this.closed = false; this.generation = 0; }
  async reconnect() {
    if (this.closed) return; const generation = ++this.generation; this.cancel?.(); let buffer = '', status = 200;
    try { const cancel = await this.connection.send(this.path, undefined, value => {
      if (generation !== this.generation || this.closed) return;
      if (value.kind === 'headers') status = value.status;
      if (value.kind === 'chunk' && status === 200) {
        buffer += new TextDecoder().decode(from64(value.body));
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) { const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2); let event = 'message', data = []; for (const line of frame.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); if (line.startsWith('data:')) data.push(line.slice(5).trimStart()); } if (data.length) this.dispatchEvent(new MessageEvent(event, { data: data.join('\n') })); }
      }
      if (value.kind === 'end' && !this.closed) { this.dispatchEvent(new Event('error')); clearTimeout(this.timer); this.timer = setTimeout(() => this.reconnect(), 3000); }
    }, () => { if (!this.closed) this.dispatchEvent(new Event('error')); });
    if (this.closed || generation !== this.generation) cancel(); else this.cancel = cancel;
    } catch { if (!this.closed) { this.dispatchEvent(new Event('error')); clearTimeout(this.timer); this.timer = setTimeout(() => this.reconnect(), 3000); } }
  }
  set onerror(handler) { this.addEventListener('error', handler); }
  close() { this.closed = true; this.generation++; clearTimeout(this.timer); this.cancel?.(); this.connection.subscriptions.delete(this); }
}
const bridge = document.documentElement.dataset.entry==='accounts'?null:new URLSearchParams(location.search).get('bridge');let relay = bridge ? new RelayConnection(bridge) : null;
export const transport = {
  get connectionState(){return !relay?'local':relay.socket?.readyState===WebSocket.OPEN&&relay.epoch?'online':relay.connecting?'connecting':'reconnecting';},get relay(){return Boolean(relay);},get account(){return Boolean(relay?.account);},get deviceId(){return relay?.bridge;},
  selectDevice(id,key){relay?.close();relay=independentClient?new TrustedConnection(id):new RelayConnection(id,key,true);},
  disconnect(){relay?.close();relay=null;},
  async request(path, payload) {
    if (relay) return relay.request(path, payload);
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...(payload !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}) });
    const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error || '连接失败'), { code: data.code, status: response.status }); return data;
  },
  events: path => relay ? relay.events(path) : new EventSource(path),
};
if (relay?.keyText) {
  const manifest = { name: 'Codex Pocket', short_name: 'Codex Pocket', start_url: `${location.pathname}?bridge=${encodeURIComponent(bridge)}#${new URLSearchParams({ key: relay.keyText })}`, display: 'standalone', background_color: '#f3f4f1', theme_color: '#f3f4f1', icons: [{ src: `${location.origin}/icon.svg`, sizes: 'any', type: 'image/svg+xml' }] };
  document.querySelector('link[rel="manifest"]').href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
}
import {independentClient} from './client-platform.js';
import {TrustedConnection} from './trusted-transport.js';
