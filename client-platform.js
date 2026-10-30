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
  const pin=localStorage.getItem('pocket-mac-pin:'+bridgeId);if(!pin)throw new Error('请先用手机扫描 Mac 本地“可信设备”页面的二维码，再连接这台 Mac。');
  let ticket;try{ticket=JSON.parse(sessionStorage.getItem('pocket-pair-ticket:'+bridgeId)||'null');}catch{}
  return {macPublicKey:pin,token:ticket?.token};
}
export function receivePairing(){
  if(!independentClient)return;
  const encoded=new URLSearchParams(location.hash.slice(1)).get('pair');if(!encoded)return;
  try{
    const value=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
    if(value.v!==1||value.relayOrigin!==relayOrigin||new URL(value.clientUrl).origin!==location.origin||!/^[\w-]{100,150}$/.test(value.macPublicKey)||!/^[\w-]{32}$/.test(value.token)||!/^[\w-]{10,100}$/.test(value.bridgeId)||value.expiresAt<Date.now())throw new Error('绑定二维码无效或已过期');
    const pin=localStorage.getItem('pocket-mac-pin:'+value.bridgeId);if(pin&&pin!==value.macPublicKey)throw new Error('Mac 身份与已有绑定不一致，请先在 Mac 上核对');
    localStorage.setItem('pocket-mac-pin:'+value.bridgeId,value.macPublicKey);sessionStorage.setItem('pocket-pair-ticket:'+value.bridgeId,JSON.stringify(value));
  }finally{history.replaceState(null,'',location.pathname);}
}
