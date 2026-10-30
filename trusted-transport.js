import {PROTOCOL,generateIdentity,makeHello,acceptChallenge,trustedPacket,trustedResponse,randomId,from64,text} from './trusted-crypto.js';
import {relayOrigin,accountToken,pairingInfo} from './client-platform.js';
let identityPromise;
export function browserIdentity(){return identityPromise||=(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('codex-pocket-trust',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{
    const get=()=>new Promise((resolve,reject)=>{const r=db.transaction('keys').objectStore('keys').get('identity');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    let identity=await get();if(!identity){identity=await generateIdentity();await new Promise((resolve,reject)=>{const tx=db.transaction('keys','readwrite');tx.objectStore('keys').add(identity,'identity');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);}).catch(async error=>{const existing=await get();if(!existing)throw error;identity=existing;});}
    if(identity.privateKey.extractable)throw new Error('浏览器设备私钥未安全保存，请重新建立绑定');return identity;
  }finally{db.close();}
})();}
export class TrustedConnection {
  constructor(bridge,{identity=browserIdentity,token=accountToken,pin=pairingInfo}={}){this.bridge=bridge;this.account=true;this.pending=new Map();this.subscriptions=new Set();this.retry=500;this.identity=identity;this.token=token;this.pin=pin;}
  get epoch(){return this.session?this.wireEpoch:null;}
  connect(){if(this.closed)return Promise.reject(new Error('设备连接已关闭'));if(this.connecting)return this.connecting;if(this.socket?.readyState===WebSocket.OPEN&&this.session)return Promise.resolve();const attempt=this.open();this.connecting=attempt;attempt.finally(()=>{if(this.connecting===attempt)this.connecting=null;}).catch(()=>{});return attempt;}
  async open(){
    const pin=this.pin(this.bridge),identity=await this.identity(),token=this.token();if(!token)throw new Error('请先登录账号');
    if(this.closed)throw new Error('设备连接已关闭');
    return new Promise((resolve,reject)=>{
      const url=new URL('/relay/client/'+encodeURIComponent(this.bridge),relayOrigin);url.protocol=url.protocol==='https:'?'wss:':'ws:';
      const socket=new WebSocket(url.href,['pocket.account.v1','auth.'+token]);this.socket=socket;this.session=null;let handshaking=false;
      const timer=setTimeout(()=>{socket.close();reject(Object.assign(new Error('Mac 验证尚未完成，请检查本地批准状态后重试'),{code:'not-sent'}));},25000);
      socket.onmessage=event=>{
        if(this.socket!==socket||this.closed)return;
        let m;try{m=JSON.parse(event.data);}catch{return;}
        if(m.type==='welcome'){
          if(handshaking)return;handshaking=true;this.wireEpoch=m.epoch;this.clientId=m.clientId;
          (async()=>{
            const channel={bridgeId:this.bridge,epoch:m.epoch,clientId:m.clientId,id:randomId()},hello=await makeHello(identity,pin.macPublicKey,channel,globalThis.localStorage?.getItem('pocket-browser-name')||'我的浏览器');
            const challenge=await this.exchange(socket,channel.id,hello.hello);this.session=await acceptChallenge(identity,hello.hello,hello.ephemeral,channel,challenge);
            const c={...channel,id:randomId()},box=await trustedPacket(this.session,c,'authorize',{token:pin.token||''});
            let result;try{result=await this.jsonExchange(socket,c,box,this.session);}catch(error){if(error.code==='local-approval-required'){const hash=await crypto.subtle.digest('SHA-256',text(identity.publicKey)),fingerprint=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('').match(/.{1,8}/g).join(' ');error.message+='。浏览器指纹：'+fingerprint;}throw error;}
            if(result.status!==200)throw Object.assign(new Error(result.error),{status:result.status,code:result.code});
            if(this.socket!==socket||this.closed)throw new Error('连接已变化，请重新连接');
            sessionStorage.removeItem('pocket-pair-ticket:'+this.bridge);this.retry=500;clearTimeout(timer);const reconnected=this.hasConnected;this.hasConnected=true;resolve();
            if(reconnected)for(const sub of this.subscriptions)sub.reconnect();
          })().catch(error=>{this.session=null;clearTimeout(timer);reject(error);socket.close();});
        }else if(m.type==='offline'){this.session=null;this.failPending(new Error('Mac 暂时离线'));clearTimeout(timer);reject(new Error('Mac 暂时离线'));}
        else if(m.type==='response'){
          const p=this.pending.get(m.id);if(!p)return;
          p.chain=p.chain.then(async()=>{
            if(m.sequence!==p.sequence++)throw new Error('响应顺序不匹配');
            if(m.box?.protocol!==PROTOCOL)throw new Error('中继返回了未认证响应，已拒绝');
            if(m.box.kind==='error')throw Object.assign(new Error(m.box.error||'Mac 验证失败'),{code:m.box.code});
            if(p.hello){p.resolve(m.box);this.pending.delete(m.id);return;}
            const value=await trustedResponse(p.session,p.channel,m.box,m.sequence);if(this.pending.get(m.id)===p)p.deliver(value);
          }).catch(error=>{this.pending.delete(m.id);p.reject(error);});
        }
      };
      socket.onclose=event=>{clearTimeout(timer);if(this.socket!==socket)return;this.socket=null;this.session=null;reject(new Error('连接暂时中断'));this.failPending(new Error('连接中断，正在确认已发送操作'));for(const sub of this.subscriptions)sub.dispatchEvent(new Event('error'));if(event.code===1008&&!this.closed&&/session|access|revoked|migrated/i.test(event.reason||''))window.dispatchEvent(new Event('pocket-access-ended'));if(!this.closed&&this.subscriptions.size){clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect().catch(()=>{}),this.retry);this.retry=Math.min(this.retry*2,10000);}};
      socket.onerror=()=>{};
    });
  }
  exchange(socket,id,box){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Mac 身份验证超时'));},12000);this.pending.set(id,{hello:true,sequence:0,chain:Promise.resolve(),resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({type:'request',id,box}));});}
  jsonExchange(socket,channel,box,session){return new Promise((resolve,reject)=>{let parts='',status=200;const timer=setTimeout(()=>{this.pending.delete(channel.id);reject(new Error('Mac 操作尚未确认'));},60000);this.pending.set(channel.id,{channel,session,sequence:0,chain:Promise.resolve(),reject:error=>{clearTimeout(timer);reject(error);},deliver:value=>{if(value.kind==='headers')status=value.status;if(value.kind==='chunk')parts+=new TextDecoder().decode(from64(value.body));if(value.kind==='end'){this.pending.delete(channel.id);clearTimeout(timer);try{const result=JSON.parse(parts);if(status>=400)reject(Object.assign(new Error(result.error),{status,code:result.code}));else resolve(result);}catch(error){reject(error);}}}});socket.send(JSON.stringify({type:'request',id:channel.id,box}));});}
  failPending(error){for(const p of this.pending.values())p.reject(error);this.pending.clear();}
  async send(path,payload,deliver,reject){
    try{await this.connect();}catch(error){error.code||='not-sent';throw error;}
    const socket=this.socket,session=this.session,channel={bridgeId:this.bridge,epoch:this.wireEpoch,clientId:this.clientId,id:randomId()};
    const box=await trustedPacket(session,channel,'request',{method:payload===undefined?'GET':'POST',path,body:payload===undefined?'':JSON.stringify(payload),cookie:''});
    if(this.socket!==socket||socket.readyState!==WebSocket.OPEN||this.session!==session)throw Object.assign(new Error('尚未发送，连接正在恢复'),{code:'not-sent'});
    this.pending.set(channel.id,{channel,session,sequence:0,chain:Promise.resolve(),reject,deliver:value=>{deliver(value);if(value.kind==='end')this.pending.delete(channel.id);}});
    socket.send(JSON.stringify({type:'request',id:channel.id,box}));return()=>{this.pending.delete(channel.id);if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'cancel',id:channel.id}));};
  }
  async request(path,payload){
    await this.connect();const channel={bridgeId:this.bridge,epoch:this.wireEpoch,clientId:this.clientId,id:randomId()},socket=this.socket,session=this.session;
    const box=await trustedPacket(session,channel,'request',{method:payload===undefined?'GET':'POST',path,body:payload===undefined?'':JSON.stringify(payload),cookie:''});
    if(this.socket!==socket||socket.readyState!==WebSocket.OPEN||this.session!==session)throw Object.assign(new Error('尚未发送，连接正在恢复'),{code:'not-sent'});
    return this.jsonExchange(socket,channel,box,session);
  }
  events(path){const source=new TrustedEvents(this,path);this.subscriptions.add(source);source.reconnect();return source;}
  close(){this.closed=true;clearTimeout(this.timer);for(const sub of [...this.subscriptions])sub.close();this.failPending(new Error('设备已断开'));this.socket?.close();this.session=null;}
}
class TrustedEvents extends EventTarget {
  constructor(connection,path){super();this.connection=connection;this.path=path;this.generation=0;}
  async reconnect(){if(this.closed)return;const generation=++this.generation;this.cancel?.();let buffer='';try{const cancel=await this.connection.send(this.path,undefined,value=>{if(this.closed||generation!==this.generation)return;if(value.kind==='chunk'){buffer+=new TextDecoder().decode(from64(value.body));let end;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);let event='message',data=[];for(const line of frame.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).trimStart());}if(data.length)this.dispatchEvent(new MessageEvent(event,{data:data.join('\n')}));}}if(value.kind==='end'&&!this.closed){this.dispatchEvent(new Event('error'));clearTimeout(this.timer);this.timer=setTimeout(()=>this.reconnect(),3000);}},()=>this.dispatchEvent(new Event('error')));if(this.closed||generation!==this.generation)cancel();else this.cancel=cancel;}catch{this.dispatchEvent(new Event('error'));}}
  set onerror(handler){this.addEventListener('error',handler);}
  close(){this.closed=true;this.generation++;clearTimeout(this.timer);this.cancel?.();this.connection.subscriptions.delete(this);}
}
