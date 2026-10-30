export const PROTOCOL='pocket-trusted-v1';
export const text=value=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
export const from64=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
export const to64=bytes=>{const data=new Uint8Array(bytes);let value='';for(let i=0;i<data.length;i+=32768)value+=String.fromCharCode(...data.subarray(i,i+32768));return btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');};
export const randomId=()=>to64(crypto.getRandomValues(new Uint8Array(24)));
export const helloData=(channel,hello)=>[PROTOCOL,'hello',channel.bridgeId,channel.epoch,channel.clientId,channel.id,hello.macPublicKey,hello.publicKey,hello.ephemeralKey,hello.nonce,hello.name];
export const challengeData=c=>[PROTOCOL,'challenge',c.bridgeId,c.epoch,c.clientId,c.id,c.macPublicKey,c.publicKey,c.clientEphemeralKey,c.clientNonce,c.name,c.sessionId,c.ephemeralKey,c.nonce,c.createdAt,c.expiresAt];
export const packetData=(channel,box)=>[PROTOCOL,box.kind,channel.bridgeId,channel.epoch,channel.clientId,channel.id,box.sessionId,box.counter,box.nonce,box.data];
export const trustedAAD=(channel,sessionId,direction,sequence=0)=>JSON.stringify([PROTOCOL,channel.bridgeId,sessionId,channel.epoch,channel.clientId,channel.id,direction,sequence]);
export async function generateIdentity(){
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  return {privateKey:keys.privateKey,publicKey:to64(await crypto.subtle.exportKey('spki',keys.publicKey))};
}
export const signData=async(key,data)=>to64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,text(data)));
export async function makeHello(identity,macPublicKey,channel,name='我的浏览器'){
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits']);
  const hello={protocol:PROTOCOL,kind:'hello',macPublicKey,publicKey:identity.publicKey,ephemeralKey:to64(await crypto.subtle.exportKey('spki',ephemeral.publicKey)),nonce:randomId(),name};
  hello.signature=await signData(identity.privateKey,helloData(channel,hello));return {hello,ephemeral:ephemeral.privateKey};
}
export async function acceptChallenge(identity,hello,ephemeral,channel,challenge){
  for(const[key,value]of Object.entries({bridgeId:channel.bridgeId,epoch:channel.epoch,clientId:channel.clientId,id:channel.id,macPublicKey:hello.macPublicKey,publicKey:identity.publicKey,clientEphemeralKey:hello.ephemeralKey,clientNonce:hello.nonce,name:hello.name}))if(challenge[key]!==value)throw new Error('Mac 身份或连接信息不匹配，已拒绝连接');
  if(!Number.isSafeInteger(challenge.createdAt)||!Number.isSafeInteger(challenge.expiresAt)||challenge.expiresAt<Date.now()||challenge.createdAt>Date.now()+60000||challenge.expiresAt-challenge.createdAt>60000)throw new Error('Mac 验证请求已过期');
  const mac=await crypto.subtle.importKey('spki',from64(hello.macPublicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},mac,from64(challenge.signature),text(challengeData(challenge))))throw new Error('Mac 身份签名无效，已拒绝连接');
  const peer=await crypto.subtle.importKey('spki',from64(challenge.ephemeralKey),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=await crypto.subtle.deriveBits({name:'ECDH',public:peer},ephemeral,256),material=await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:from64(challenge.nonce),info:text(challengeData(challenge))},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  return {key,sessionId:challenge.sessionId,identity,counter:0};
}
export async function trustedPacket(session,channel,kind,value){
  const nonce=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:text(trustedAAD(channel,session.sessionId,'request'))},session.key,text(value));
  const box={protocol:PROTOCOL,kind,sessionId:session.sessionId,counter:++session.counter,nonce:to64(nonce),data:to64(data)};
  box.signature=await signData(session.identity.privateKey,packetData(channel,box));return box;
}
export async function trustedResponse(session,channel,box,sequence){
  if(box.protocol!==PROTOCOL||box.sessionId!==session.sessionId||box.kind!=='data')throw new Error('Mac 响应协议不匹配');
  const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(box.nonce),additionalData:text(trustedAAD(channel,session.sessionId,'response',sequence))},session.key,from64(box.data));
  return JSON.parse(new TextDecoder().decode(data));
}
