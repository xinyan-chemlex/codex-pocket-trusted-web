import {generateIdentity} from './trusted-crypto.js?v=0.13.2';

// Keep Mac pins beside the nonextractable signing key, across account sessions.
async function database(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('codex-pocket-trust',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('keys');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function transaction(mode,operation){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('keys',mode);let value;
    const request=operation(tx.objectStore('keys'));request.onsuccess=()=>{value=request.result;};
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('设备绑定保存失败'));
  });}finally{db.close();}
}
const read=key=>transaction('readonly',store=>store.get(key));
let identityPromise;
export function browserIdentity(){
  if(!identityPromise)identityPromise=loadIdentity().catch(error=>{identityPromise=null;throw error;});
  return identityPromise;
}
async function loadIdentity(){
  let identity=await read('identity');
  if(!identity){
    identity=await generateIdentity();
    try{await transaction('readwrite',store=>store.add(identity,'identity'));}
    catch(error){const existing=await read('identity');if(!existing)throw error;identity=existing;}
  }
  if(identity.privateKey.extractable)throw new Error('浏览器设备私钥未安全保存，请重新建立绑定');
  return identity;
}
function legacyPin(id){try{return localStorage.getItem('pocket-mac-pin:'+id);}catch{return null;}}
export async function savedMacPin(id){
  const stored=await read('mac:'+id),legacy=legacyPin(id);
  if(stored&&legacy&&stored!==legacy)throw new Error('Mac 身份记录不一致，请在 Mac 本地核对');
  if(stored)return stored;
  if(legacy){await saveMacPin(id,legacy);return legacy;}
  return null;
}
export async function saveMacPin(id,pin){
  // Compare and write in one transaction so another tab cannot replace a pin.
  const db=await database();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction('keys','readwrite'),store=tx.objectStore('keys'),request=store.get('mac:'+id);let conflict;
    request.onsuccess=()=>{if(request.result&&request.result!==pin){conflict=new Error('Mac 身份与已有绑定不一致，请在 Mac 本地核对');tx.abort();}else store.put(pin,'mac:'+id);};
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(conflict||tx.error);
  });}finally{db.close();}
  try{localStorage.setItem('pocket-mac-pin:'+id,pin);}catch{}
}
export async function retainBrowserTrust(){
  // Best effort only: browsers may refuse persistent storage, especially private tabs.
  try{await globalThis.navigator?.storage?.persist?.();}catch{}
}
