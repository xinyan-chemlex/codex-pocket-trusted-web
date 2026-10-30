import {independentClient} from './client-platform.js';
import {icon} from './icons.js';
const $=id=>document.getElementById(id);
const el=(tag,text='',cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
export async function setupTrustedAdmin(){
  if(independentClient||!['127.0.0.1','localhost'].includes(location.hostname))return;
  const dialog=$('trusted-dialog');if(!dialog)return;
  const request=async body=>{const r=await fetch('/api/local-trust',{cache:'no-store',...body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  let urlDirty=false,inviteBusy=false,listSignature='',invite;
  $('trusted-client-url').oninput=()=>{urlDirty=true;};
  function fingerprint(id){const details=el('details','','trust-fingerprint');details.append(el('summary','核对设备指纹'),el('code',id.match(/.{1,8}/g).join(' ')));return details;}
  function deviceCard(device,pending){
    const card=el('article','',pending?'trust-device-card pending':'trust-device-card');
    const top=el('div','','trust-device-top'),symbol=el('span','','trust-device-icon');symbol.append(icon('phone'));
    const heading=el('div','','trust-device-name');heading.append(el('strong',device.name),el('small',pending?'新设备请求访问':'已允许访问 · '+new Date(device.createdAt).toLocaleDateString('zh-CN')));
    top.append(symbol,heading,el('span',pending?'待确认':'已绑定',pending?'trust-device-badge pending':'trust-device-badge'));card.append(top);
    if(pending){card.append(el('p','请确认这是你刚刚添加的设备，并与手机上显示的指纹核对。','trust-device-hint'),fingerprint(device.id));const actions=el('div','','trust-device-actions'),allow=el('button','确认并允许连接','primary'),reject=el('button','拒绝','secondary');allow.onclick=()=>act({action:'approve',id:device.id});reject.onclick=()=>act({action:'revoke',id:device.id});actions.append(allow,reject);card.append(actions);}
    else{const bottom=el('div','','trust-device-bottom'),remove=el('button','撤销访问','trust-remove');remove.onclick=()=>act({action:'revoke',id:device.id});bottom.append(fingerprint(device.id),remove);card.append(bottom);}
    return card;
  }
  function render(data){
    $('trusted-policy-status').textContent=data.required?'设备验证已开启 · 只有你批准的设备可以访问':'先将 Mac 绑定到账号，再添加访问设备';
    $('trusted-device-count').textContent=String(data.clients.length);
    if(!urlDirty)$('trusted-client-url').value=data.clientUrl||'';
    if(!data.clientUrl)$('trusted-configure').closest('details').open=true;
    const signature=JSON.stringify([data.pending,data.clients]);if(signature===listSignature)return;listSignature=signature;
    const list=$('trusted-clients');list.replaceChildren();
    if(data.pending.length){list.append(el('div','等待你确认 · '+data.pending.length,'trust-list-label'));for(const d of data.pending)list.append(deviceCard(d,true));}
    else{const empty=el('div','','trust-no-pending');empty.append(el('span','✓'),el('strong','没有待确认请求'),el('small','新设备提交绑定后会出现在这里。'));list.append(empty);}
    if(data.clients.length){list.append(el('div','已绑定 · '+data.clients.length,'trust-list-label'));for(const d of data.clients)list.append(deviceCard(d,false));}
  }
  function renderInvite(data){
    invite=data;const box=$('trusted-invite'),image=document.createElement('img');image.src=data.qr;image.alt='新设备绑定二维码';image.className='trust-qr';
    const qr=el('div','','trust-qr-frame');qr.append(image);
    const time=el('div','','trust-invite-time');time.id='trusted-expiry';
    const label=el('div','也可以复制绑定码','trust-code-label'),code=el('div','','trust-code');code.id='trusted-invite-code';for(const group of data.code.split('-'))code.append(el('span',group));
    const actions=el('div','','trust-code-actions'),copy=el('button','复制绑定码','secondary'),link=el('a','打开手机网页','trust-entry-link');copy.type='button';copy.onclick=()=>navigator.clipboard.writeText(data.code).then(()=>{copy.textContent='已复制';}).catch(()=>{copy.textContent='请选中上方绑定码复制';});link.href=data.url.split('#')[0];link.target='_blank';link.rel='noopener noreferrer';actions.append(copy,link);
    box.replaceChildren(qr,time,label,code,actions);updateExpiry();
  }
  function updateExpiry(){if(!invite)return;const seconds=Math.max(0,Math.ceil((invite.expiresAt-Date.now())/1000));$('trusted-expiry').textContent=seconds?'绑定码有效 · '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0'):'此绑定码已过期，请重新生成';$('trusted-invite').classList.toggle('expired',!seconds);}
  async function act(body){
    if(body.action==='invite'&&inviteBusy)return;
    if(body.action==='invite'){inviteBusy=true;$('trusted-invite-button').disabled=true;$('trusted-invite-button').textContent='正在生成…';}
    try{$('trusted-error').textContent='';const data=await request(body);if(body.action==='configure')urlDirty=false;if(body.action==='invite')renderInvite(data);else render(data);}
    catch(error){$('trusted-error').textContent=error.message;}
    finally{if(body.action==='invite'){inviteBusy=false;$('trusted-invite-button').disabled=false;$('trusted-invite-button').textContent=invite?'生成另一份绑定码':'生成新绑定码';}}
  }
  try{render(await request());}catch{return;}
  for(const button of document.querySelectorAll('[data-trusted-admin]')){button.hidden=false;button.onclick=async()=>{render(await request());dialog.showModal();};}
  $('close-trusted').onclick=()=>dialog.close();$('trusted-invite-button').onclick=()=>act({action:'invite'});
  $('trusted-configure').onsubmit=event=>{event.preventDefault();act({action:'configure',clientUrl:$('trusted-client-url').value.trim()});};
  const timer=setInterval(()=>{if(dialog.open){updateExpiry();request().then(render).catch(e=>{$('trusted-error').textContent=e.message;});}},3000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  if(location.hash==='#trust')dialog.showModal();
}
