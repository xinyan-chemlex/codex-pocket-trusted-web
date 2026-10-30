import {independentClient} from './client-platform.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
export async function setupTrustedAdmin(){
  if(independentClient||!['127.0.0.1','localhost'].includes(location.hostname))return;
  const dialog=$('trusted-dialog');if(!dialog)return;
  const request=async body=>{const r=await fetch('/api/local-trust',{cache:'no-store',...body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;};
  let state,urlDirty=false;$('trusted-client-url').oninput=()=>{urlDirty=true;};
  const render=data=>{
    state=data;$('trusted-policy-status').textContent=data.required?'签名保护已启用：只有本地批准的浏览器可以远控。':'签名保护尚未启用：原中继网页仍能控制 Mac。';
    $('trusted-policy').textContent=data.required?'恢复旧网页控制':'启用签名保护';if(!urlDirty)$('trusted-client-url').value=data.clientUrl||'';
    const list=$('trusted-clients');list.replaceChildren();
    for(const c of data.pending){const card=el('article','','mac-card'),name=el('strong',c.name),fingerprint=el('code',c.id.match(/.{1,8}/g).join(' ')),approve=el('button','批准这个浏览器','primary');approve.onclick=()=>act({action:'approve',id:c.id});card.append(el('div','等待本地批准','eyebrow'),name,fingerprint,approve);list.append(card);}
    for(const c of data.clients){const card=el('article','','mac-card'),remove=el('button','撤销设备','secondary danger');remove.onclick=()=>act({action:'revoke',id:c.id});card.append(el('strong',c.name),el('code',c.id.match(/.{1,8}/g).join(' ')),remove);list.append(card);}
    if(!data.pending.length&&!data.clients.length)list.append(el('p','尚未绑定可信浏览器。请先配置独立网页地址，再生成二维码。'));
  };
  const act=async body=>{try{$('trusted-error').textContent='';const data=await request(body);if(body.action==='configure')urlDirty=false;if(body.action==='invite'){const img=document.createElement('img');img.src=data.qr;img.alt='新访问设备绑定二维码';const code=el('div',data.code);code.id='trusted-invite-code';const copy=el('button','复制绑定码','secondary');copy.type='button';copy.onclick=()=>navigator.clipboard.writeText(data.code).then(()=>{copy.textContent='已复制';}).catch(()=>{copy.textContent='请选中上方绑定码复制';});const a=el('a','打开独立网页登录','relay-link');a.href=data.url.split('#')[0];a.target='_blank';a.rel='noopener noreferrer';$('trusted-invite').replaceChildren(el('div','新设备绑定码','eyebrow'),code,copy,img,a,el('p','先在新手机或 iPad 登录，选择“绑定当前设备”，输入此码或扫码。5 分钟内有效，一次使用。每次新增设备生成新码，已有绑定保留；请求到达后核对指纹并批准。'));}else render(data);}catch(e){$('trusted-error').textContent=e.message;}};
  try{render(await request());}catch{return;}
  for(const button of document.querySelectorAll('[data-trusted-admin]')){button.hidden=false;button.onclick=async()=>{render(await request());dialog.showModal();};}
  $('close-trusted').onclick=()=>dialog.close();$('trusted-invite-button').onclick=()=>act({action:'invite'});
  $('trusted-configure').onsubmit=event=>{event.preventDefault();act({action:'configure',clientUrl:$('trusted-client-url').value.trim()});};
  $('trusted-policy').onclick=()=>act({action:'policy',required:!state.required});
  const timer=setInterval(()=>{if(dialog.open)request().then(render).catch(e=>{$('trusted-error').textContent=e.message;});},3000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  if(location.hash==='#trust')dialog.showModal();
}
