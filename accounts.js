import { icon } from './icons.js';
import { createVault, unlockVault, unlockDevice } from './account-crypto.js';
import {independentClient,accountRequest,forgetAccount,hasMacPin,pendingPairing,clearPendingPairing,savePairing,queuePairing} from './client-platform.js';
import {codeLookup,openBinding} from './client-binding.js';
import {transport} from './transport.js';
const $ = id => document.getElementById(id);
let account, vaultKey, csrf, localInfo, register = false, selected, callbacks = {},authenticating=false,formReady=false,authGeneration=0,devices=[],bindTarget,bindBusy=false,scanner,bindingNotice=0;
let attemptId=[...crypto.getRandomValues(new Uint8Array(12))].map(x=>x.toString(16).padStart(2,'0')).join('');
function trace(stage,code='none'){if(localInfo||independentClient)return;fetch('/account/client-event',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({attemptId,stage,code}),signal:AbortSignal.timeout(5000)}).catch(()=>{});}
function authStatus(text){const node=$('auth-status');if(node)node.textContent=text;}
const remember=()=>{try{sessionStorage.setItem('pocket-account-unlock',JSON.stringify({id:account.id,csrf,vaultKey}));}catch{}};
const forget=()=>{try{sessionStorage.removeItem('pocket-account-unlock');}catch{}vaultKey=null;};
async function request(path, body) {
  return accountRequest(path,body,csrf||'',attemptId);
}
function show() { $('boot-screen').hidden=true; for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();$('workspace').hidden = true; $('pair-screen').hidden = true; $('account-screen').hidden = false; }
function form() { $('account-form').setAttribute('data-ready',String(formReady)); $('account-submit').disabled=!formReady||authenticating;authStatus(formReady?'':'正在准备登录，请稍候…'); $('account-screen').dataset.view='form';document.querySelector('.auth-eyebrow').textContent=localInfo?'连接你的 Mac':register?'开始使用':'欢迎回来';
  $('bind-current-device').hidden=true;
  $('account-rebind').hidden=true;
  $('account-refresh').hidden=Boolean(localInfo);$('account-logout').hidden=Boolean(localInfo);
  show(); $('mac-picker').hidden = true; $('account-form').hidden = false; $('account-toggle').hidden = false;
  $('account-title').textContent = localInfo ? (localInfo.bound ? '这台 Mac 已绑定' : '绑定这台 Mac') : (register ? '创建账号' : '登录 Codex Pocket');
  $('account-description').textContent = localInfo ? '使用同一账号管理手机和多台 Mac。' : '登录后，只显示你绑定的 Mac。';
  $('account-mac-label').hidden = !localInfo; $('account-confirm-label').hidden = !register;
  $('account-password').autocomplete = register ? 'new-password' : 'current-password';
  $('account-submit').textContent = localInfo ? (register ? '创建账号并绑定 Mac' : '登录并绑定 Mac') : (register ? '创建账号' : '登录');
  $('account-toggle').textContent = register ? '已有账号？登录' : '没有账号？创建账号';
  $('account-back').hidden = !localInfo;
}
async function picker() { $('account-form').setAttribute('data-ready','true'); $('account-screen').dataset.view='devices';document.querySelector('.auth-eyebrow').textContent='你的设备';
  $('bind-current-device').hidden=!independentClient;$('bind-current-device').disabled=true;devices=[];
  $('account-refresh').hidden=false;$('account-logout').hidden=false;
  show(); $('account-form').hidden = true; $('account-toggle').hidden = true; $('mac-picker').hidden = false;
  $('account-title').textContent = '选择你的 Mac'; $('account-description').textContent = `已登录：${account.username}`;
  $('mac-list').replaceChildren(); $('account-error').textContent = '';
  try {
    const data = await request('/account/devices');devices=data.devices;$('bind-current-device').disabled=!devices.length;trace('devices-loaded');authStatus('');
    if (!data.devices.length) { const p = document.createElement('p'); p.className='no-macs';p.append(icon('monitor'));p.append(document.createTextNode('还没有绑定 Mac。在 Mac 桥接程序中登录同一账号即可添加。')); $('mac-list').append(p); }
    for (const device of data.devices) {
      const card = document.createElement('article'); card.className = 'mac-card'+(device.online?' online':' offline');
      const button = document.createElement('button'); button.className = 'mac-select'; button.type = 'button'; button.disabled = !device.online;
      const top=document.createElement('div');top.className='mac-card-top';const symbol=document.createElement('span');symbol.className='mac-symbol';symbol.append(icon('monitor'));const status=document.createElement('span');status.className='mac-state';status.textContent=device.online?'在线':'离线';top.append(symbol,status);
      const name=document.createElement('strong');name.className='mac-name';name.textContent=device.name;
      const meta=document.createElement('span');meta.className='mac-meta';meta.textContent=device.createdAt?'绑定于 '+new Date(device.createdAt).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'你的 Mac 工作空间';
      const action=document.createElement('span');action.className='mac-connect';const label=()=>!device.online?'等待 Mac 上线':independentClient&&!hasMacPin(device.id)?'绑定当前设备':'打开工作空间';action.append(document.createTextNode(label()),icon('arrow'));button.append(top,name,meta,action);
      button.onclick = async () => {if(independentClient&&!hasMacPin(device.id)){beginBinding(device);return;}button.disabled = true; try { const key = independentClient?null:await unlockDevice(vaultKey, device, account.id); selected = device;notifyConnectionMac(device);action.firstChild.textContent='正在连接工作空间…';await callbacks.onSelect(device, key); } catch (e) { $('account-screen').hidden=false;if(independentClient&&['pairing-required','local-approval-required','client-auth-required'].includes(e.code)){beginBinding(device);$('bind-device-status').textContent=e.message;}else $('account-error').textContent = e.message; } finally { button.disabled = !device.online;action.firstChild.textContent=label(); } };
      const actions = document.createElement('div'); actions.className = 'mac-card-actions';
      const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'text-button'; rename.textContent = '重命名';
      rename.onclick = () => { $('rename-mac-id').value = device.id; $('rename-mac-name').value = device.name; $('rename-mac-error').textContent = ''; $('rename-mac-dialog').showModal(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button danger'; remove.textContent = '解除绑定';
      remove.onclick = () => { $('remove-mac-id').value = device.id; $('remove-mac-name').textContent = device.name; $('remove-mac-error').textContent = ''; $('remove-mac-dialog').showModal(); };
      if(independentClient){const bind=document.createElement('button');bind.type='button';bind.className='text-button';bind.textContent='绑定 / 重新绑定当前设备';bind.onclick=()=>beginBinding(device);actions.append(bind);}
      actions.append(rename, remove); card.append(button, actions); $('mac-list').append(card);
    }
    if(independentClient&&pendingPairing()){const pending=pendingPairing(),target=devices.find(d=>d.id===pending.ticket?.bridgeId)||devices[0];if(target)beginBinding(target,{notifyMac:false});}
  } catch (e) { $('account-error').textContent = e.message; if (e.status === 401) { vaultKey = null; form(); } }
}
function stopScanner(){scanner?.destroy();scanner=null;$('bind-device-camera').hidden=true;}
async function requestMacBindingPage(device){
  const generation=++bindingNotice;$('bind-device-mac-status').textContent='正在请 Mac 打开设备管理页…';
  try{const result=await request('/account/binding-start',{id:device.id});if(generation!==bindingNotice||!$('bind-device-dialog').open)return;
    $('bind-device-mac-status').textContent=result.opened?'Mac 已确认打开设备管理页。请在 Mac 生成新绑定码。':result.status==='throttled'?'Mac 刚刚已收到打开请求，请查看 Mac 浏览器中的设备管理页。':'Mac 未能自动打开页面，请在 Mac 打开本地设备管理页。';
  }catch(error){if(generation===bindingNotice)$('bind-device-mac-status').textContent=error.message;}
}
async function notifyConnectionMac(device){
  const accountId=account?.id,generation=authGeneration;
  try{const result=await request('/account/binding-start',{id:device.id});if(account?.id===accountId&&authGeneration===generation&&selected?.id===device.id)callbacks.onMacPageResult?.(result);}
  catch(error){if(account?.id===accountId&&authGeneration===generation&&selected?.id===device.id)callbacks.onMacPageResult?.({opened:false,status:'failed',error:error.message});}
}
function beginBinding(device,{notifyMac=true}={}){
  if(!account||!independentClient)return;bindTarget=device;stopScanner();$('bind-device-status').textContent='在 Mac 本地管理页生成新绑定码。每台手机或平板需要单独绑定，已绑定设备不会受影响。';
  $('bind-device-mac').replaceChildren(...devices.map(d=>{const option=document.createElement('option');option.value=d.id;option.textContent=d.name;return option;}));$('bind-device-mac').value=device.id;
  $('bind-device-name').value=localStorage.getItem('pocket-browser-name')||'我的手机 / 平板';$('bind-device-code').value=pendingPairing()?.code||'';
  $('bind-device-retry').hidden=!hasMacPin(device.id);$('bind-device-dialog').showModal();
  if(notifyMac)requestMacBindingPage(device);else $('bind-device-mac-status').textContent='请在 Mac 设备管理页确认这台设备。';
  const pending=pendingPairing();if(pending?.ticket){clearPendingPairing();runBinding(async()=>pending.ticket);}
}
async function runBinding(getTicket){
  if(bindBusy||!account)return;bindBusy=true;const device=devices.find(d=>d.id===$('bind-device-mac').value);if(!device){bindBusy=false;return;}
  const accountId=account.id,generation=authGeneration,name=$('bind-device-name').value.trim()||'我的手机 / 平板';const controls=[...$('bind-device-form').querySelectorAll('input,select,button')];for(const c of controls)c.disabled=true;$('bind-device-status').textContent=getTicket?'正在验证绑定码…':'正在向 Mac 验证当前设备…';
  try{
    if(getTicket){clearPendingPairing();const ticket=await getTicket();if(account?.id!==accountId||authGeneration!==generation)return;savePairing(ticket,device.id);}
    localStorage.setItem('pocket-browser-name',name);selected=device;$('bind-device-code').value='';stopScanner();
    // Do not clear or reopen the workspace while approval is still pending.
    transport.selectDevice(device.id,null);const status=await transport.request('/api/status');
    if(status.trusted!==true)throw new Error('Mac 尚未确认设备签名');
    $('bind-device-status').textContent='Mac 已确认设备绑定，正在打开工作空间…';await callbacks.onSelect(device,null,{connected:true});$('bind-device-dialog').close();
  }catch(error){
    const waiting=error.code==='local-approval-required',expired=['pairing-required','client-auth-required'].includes(error.code);
    if(expired){sessionStorage.removeItem('pocket-pair-ticket:'+device.id);clearPendingPairing();}
    $('bind-device-status').textContent=waiting?'等待 Mac 本地批准。请核对下方指纹，在 Mac 点击“批准这个浏览器”后，再检查连接。\n'+error.message:expired?'绑定信息已过期或未被 Mac 接受。请在 Mac 重新生成绑定码后输入，尚未批准此设备。':'连接未完成：'+error.message;
    if(!$('bind-device-dialog').open){$('account-screen').hidden=false;$('bind-device-dialog').showModal();}
    $('bind-device-retry').hidden=expired||!hasMacPin(device.id);
  }
  finally{bindBusy=false;for(const c of controls)c.disabled=false;}
}
$('bind-current-device').onclick=()=>{if(devices.length)beginBinding(selected||devices[0]);};
$('close-bind-device').onclick=()=>$('bind-device-dialog').close();$('bind-device-dialog').addEventListener('close',stopScanner);
$('bind-device-mac').onchange=()=>{bindTarget=devices.find(d=>d.id===$('bind-device-mac').value);$('bind-device-retry').hidden=!hasMacPin(bindTarget?.id);if(bindTarget)requestMacBindingPage(bindTarget);};
$('bind-device-form').onsubmit=event=>{event.preventDefault();const code=$('bind-device-code').value;$('bind-device-code').value='';runBinding(async()=>{const id=$('bind-device-mac').value,result=await request('/account/client-pairing',{id,lookup:await codeLookup(code)});return openBinding(code,result.box);});};
$('bind-device-retry').onclick=()=>runBinding();
$('bind-device-scan').onclick=async()=>{
  if(scanner||bindBusy)return;
  try{const {default:QrScanner}=await import('./vendor/qr-scanner/qr-scanner.min.js');$('bind-device-camera').hidden=false;scanner=new QrScanner($('bind-device-video'),result=>{try{queuePairing(result.data||result);const pending=pendingPairing();stopScanner();if(pending?.code){$('bind-device-code').value=pending.code;$('bind-device-form').requestSubmit();}else if(pending?.ticket)runBinding(async()=>pending.ticket);}catch(e){$('bind-device-status').textContent=e.message;}},{returnDetailedScanResult:true,preferredCamera:'environment'});await scanner.start();$('bind-device-status').textContent='将摄像头对准 Mac 上的绑定二维码。画面只在当前设备上识别。';}
  catch{$('bind-device-status').textContent='无法使用摄像头，请允许相机访问，或输入 Mac 上的绑定码。';stopScanner();}
};
window.addEventListener('pocket-pairing-ready',()=>{if(account&&devices.length&&!scanner){const pending=pendingPairing(),device=devices.find(d=>d.id===pending?.ticket?.bridgeId)||devices[0];beginBinding(device,{notifyMac:false});}});
$('account-toggle').onclick = () => { register = !register; $('account-error').textContent = ''; form(); };
$('account-form').onsubmit = async event => {
  event.preventDefault();if(!formReady||authenticating)return;const generation=++authGeneration;attemptId=[...crypto.getRandomValues(new Uint8Array(12))].map(x=>x.toString(16).padStart(2,'0')).join('');let stage='password';authenticating=true;$('account-toggle').disabled=true;trace('login-submit');authStatus('正在验证账号…'); $('account-error').textContent = ''; $('account-submit').disabled = true;
  const username = $('account-username').value.trim().toLowerCase(), password = $('account-password').value;
  try {
    if (register && password !== $('account-confirm').value) throw new Error('两次密码不一致');
    if (localInfo) {
      const result = await request('/api/account/setup', { username, password, register, name: $('account-mac-name').value,replaceBinding:Boolean(localInfo.replaceBinding) });
      history.replaceState(null,'',location.pathname+'#trust');if(callbacks.onLocalBack){await callbacks.onLocalBack();return;}
      $('account-form').hidden = true; $('account-toggle').hidden = true; $('account-screen').dataset.view='bound';$('account-title').textContent = 'Mac 已绑定'; $('account-description').textContent = `${result.deviceName} · ${result.username}`;
      const link = document.createElement('a'); link.className = 'primary wide'; link.href = result.publicOrigin; link.textContent = '打开统一网址'; link.target = '_blank'; link.rel = 'noopener'; $('mac-list').replaceChildren(link); $('mac-picker').hidden = false;
    } else {
      const vault = register ? await createVault(password, username) : null;
      const result = await request(register ? '/account/register' : '/account/login', { username, password, ...(vault ? { vaultSalt: vault.vaultSalt, vaultBox: vault.vaultBox } : {}) });
      trace('password-verified');stage='cookie';try{const session=await request('/account/session');if(session.account.id!==result.account.id)throw new Error('账号会话不匹配');}catch(error){throw new Error(error.status===401?'密码已验证，但浏览器没有保存登录会话。请允许此站点 Cookie 后重试。':'登录会话确认失败，请稍后重试。');}
      trace('cookie-verified');stage='crypto';if(generation!==authGeneration)return;authStatus('正在解锁设备…');if(!crypto?.subtle)throw new Error('当前浏览器不支持安全加密，请使用新版 Safari 或 Chrome 打开 HTTPS 网址。');callbacks.onLogout?.();account = result.account; csrf = result.csrf; vaultKey = independentClient?'trusted-client':vault?.vaultKey || await unlockVault(password, account); remember();trace('vault-unlocked');stage='device';authStatus('登录成功，正在加载你的 Mac…');await picker();
    }
  } catch (e) { trace('error',stage);$('account-error').textContent = e.message;authStatus('登录未完成，请查看上方错误信息。'); }
  finally { authenticating=false;$('account-toggle').disabled=false;if(generation!==authGeneration)return;$('account-password').value = ''; $('account-confirm').value = ''; $('account-submit').disabled = false; }
};
$('account-refresh').onclick = picker;
$('account-rebind').onclick=()=>{localInfo={...localInfo,bound:false,replaceBinding:true};$('account-username').value=localInfo.username||'';form();};
$('account-back').onclick = () => { history.replaceState(null,'',location.pathname);document.body.classList.remove('pairing-only');$('account-screen').hidden = true; localInfo = null; callbacks.onLocalBack?.(); };
$('account-logout').onclick = async () => { try { if(independentClient&&transport.relay)await transport.request('/api/logout',{}).catch(()=>{});await request('/account/logout', {}); } finally { forget();forgetAccount(); account = null; selected = null; callbacks.onLogout?.(); form(); } };
$('rename-mac-form').onsubmit = async e => { e.preventDefault(); try { await request('/account/rename', { id: $('rename-mac-id').value, name: $('rename-mac-name').value }); $('rename-mac-dialog').close(); await picker(); } catch (error) { $('rename-mac-error').textContent = error.message; } };
$('remove-mac-form').onsubmit = async e => { e.preventDefault(); try { await request('/account/remove', { id: $('remove-mac-id').value }); $('remove-mac-dialog').close(); await picker(); } catch (error) { $('remove-mac-error').textContent = error.message; } };
$('close-rename-mac').onclick = () => $('rename-mac-dialog').close(); $('close-remove-mac').onclick = () => $('remove-mac-dialog').close();
export const accountUI = {
  async openMacPage(){if(!account||!selected)throw new Error('请先登录并连接 Mac');return request('/account/binding-start',{id:selected.id});},
  info: () => request('/api/relay-info'),
  async start(handlers) {
    callbacks=handlers;localInfo=null;formReady=false;$('account-form').setAttribute('data-ready','false');trace('boot-start');const generation=++authGeneration;$('account-submit').disabled=true;authStatus('正在准备登录，请稍候…');
    try{
      const result=await request('/account/session');if(generation!==authGeneration||authenticating)return;
      if(!$('account-username').value)$('account-username').value=result.account.username;let saved;try{saved=JSON.parse(sessionStorage.getItem('pocket-account-unlock')||'null');}catch{}
      if(saved?.id===result.account.id&&typeof saved.vaultKey==='string'&&(independentClient||/^[\w-]{43}$/.test(saved.vaultKey))){account=result.account;csrf=result.csrf;vaultKey=saved.vaultKey;formReady=true;remember();authStatus('');await picker();return;}
    }catch(error){if(generation!==authGeneration||authenticating)return;if(error.status!==401)$('account-error').textContent='登录状态读取失败，请检查网络后重试。';}
    if(generation!==authGeneration||authenticating)return;formReady=true;trace('boot-ready');forget();form();
  },
  local(info, onLocalBack) { formReady=true;$('account-form').setAttribute('data-ready','true');callbacks.onLocalBack = onLocalBack; for (const id of ['bind-mac', 'settings-bind-mac']) { $(id).hidden = !info.publicOrigin; $(id).onclick = () => { localInfo = info; register = false; $('account-mac-name').value = info.deviceName || '我的 Mac'; if (info.bound) { $('account-screen').dataset.view='bound';show(); $('account-title').textContent = '这台 Mac 已绑定'; $('account-description').textContent = `${info.deviceName} · ${info.username}`; $('account-form').hidden = true; $('account-toggle').hidden = true; $('mac-picker').hidden = true; $('account-back').hidden = false;$('account-rebind').hidden=false; } else form(); }; } if (location.hash === '#bind') $('bind-mac').click(); },
  async switchMac() { callbacks.onLogout?.(); await picker(); },
  logout: () => $('account-logout').click(),
  async checkSession(){try{const current=await request('/account/session');if(current.account.id===account?.id){csrf=current.csrf;remember();return true;}}catch(e){if(e.status!==401)return true;}forget();callbacks.onLogout?.();form();return false;},
  get selected() { return selected; },
};
window.addEventListener('pocket-access-ended',async()=>{
  if(authenticating||bindBusy)return;
  try{const current=await request('/account/session');if(current.account.id===account?.id&&vaultKey){csrf=current.csrf;remember();callbacks.onLogout?.();await picker();return;}}
  catch(error){if(error.status!==401)return;}
  forget();callbacks.onLogout?.();form();
});
