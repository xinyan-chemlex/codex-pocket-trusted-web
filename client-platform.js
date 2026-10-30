export const independentClient=document.documentElement.dataset.clientMode==='trusted';
export const relayOrigin=independentClient?document.documentElement.dataset.relayOrigin:location.origin;
const tokenKey='pocket-trusted-account-token';
export const accountToken=()=>independentClient?sessionStorage.getItem(tokenKey):null;
export const forgetAccount=()=>{if(independentClient)sessionStorage.removeItem(tokenKey);};
export async function accountRequest(path,body,csrf='',attemptId=''){
  const response=await fetch(independentClient?relayOrigin+path:path,{credentials:independentClient?'omit':'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'X-Pocket-Attempt':attemptId,...independentClient&&accountToken()?{Authorization:'Bearer '+accountToken()}:{}},...body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Pocket-CSRF':csrf,'X-Pocket-Attempt':attemptId,...independentClient&&accountToken()?{Authorization:'Bearer '+accountToken()}:{}},body:JSON.stringify(body)}});
  const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error||'连接失败'),{status:response.status});
  if(independentClient&&value.sessionToken)sessionStorage.setItem(tokenKey,value.sessionToken);return value;
}
export function pairingInfo(bridgeId){
  if(!independentClient)return null;
  const pin=localStorage.getItem('pocket-mac-pin:'+bridgeId);if(!pin)throw Object.assign(new Error('请先登录，再点击“绑定当前设备”输入绑定码或扫码。'),{code:'pairing-required'});
  let ticket;try{ticket=JSON.parse(sessionStorage.getItem('pocket-pair-ticket:'+bridgeId)||'null');}catch{}
  return {macPublicKey:pin,token:ticket?.token};
}
export const hasMacPin=id=>Boolean(independentClient&&localStorage.getItem('pocket-mac-pin:'+id));
export const pendingPairing=()=>{try{return JSON.parse(sessionStorage.getItem('pocket-pending-pairing')||'null');}catch{return null;}};
export const clearPendingPairing=()=>sessionStorage.removeItem('pocket-pending-pairing');
export function savePairing(value,bridgeId){
  if(!accountToken())throw new Error('请先登录账号，再绑定当前设备');
  if(value.v!==1||value.bridgeId!==bridgeId||value.relayOrigin!==relayOrigin||new URL(value.clientUrl).origin!==location.origin||!/^[\w-]{100,150}$/.test(value.macPublicKey)||!/^[\w-]{32}$/.test(value.token)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<Date.now())throw new Error('绑定信息错误、已过期或不属于所选 Mac');
  const pin=localStorage.getItem('pocket-mac-pin:'+bridgeId);if(pin&&pin!==value.macPublicKey)throw new Error('Mac 身份与已有绑定不一致，请在 Mac 本地核对');
  localStorage.setItem('pocket-mac-pin:'+bridgeId,value.macPublicKey);sessionStorage.setItem('pocket-pair-ticket:'+bridgeId,JSON.stringify(value));clearPendingPairing();
}
export function queuePairing(link){
  const url=new URL(link,location.href);if(url.origin!==location.origin)throw new Error('请扫描这套应用的 Mac 绑定二维码');const params=new URLSearchParams(url.hash.slice(1));
  if(params.has('bind'))sessionStorage.setItem('pocket-pending-pairing',JSON.stringify({code:params.get('bind')}));
  else if(params.has('pair')){const encoded=params.get('pair');if(encoded.length>4096)throw new Error('二维码无效');const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));sessionStorage.setItem('pocket-pending-pairing',JSON.stringify({ticket:value}));}
  else throw new Error('请扫描 Mac 生成的设备绑定二维码');
  window.dispatchEvent(new Event('pocket-pairing-ready'));
}
export function receivePairing(){
  if(!independentClient)return;
  const params=new URLSearchParams(location.hash.slice(1));if(!params.has('pair')&&!params.has('bind'))return;
  try{queuePairing(location.href);}finally{history.replaceState(null,'',location.pathname);}
}
if(independentClient)window.addEventListener('hashchange',()=>{try{receivePairing();}catch(error){const node=document.getElementById('account-error');if(node)node.textContent=error.message;}});
