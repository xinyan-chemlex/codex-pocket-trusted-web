const node=(tag,text='',cls='')=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};

export function setupRemoteApiPanel(container,{request,local=false,clientUrl=()=>null}={}){
  if(!container)return {refresh:async()=>{}};
  let state,busy=false,generation=0,reading=false;
  const title=node('h3','远程 API 转发'),status=node('span','读取状态…','remote-api-status');
  const heading=node('div','','remote-api-heading');heading.append(title,status);
  const description=node('p','通过服务器访问这台 Mac 的模型 API。开启后仍需 API Key。');
  const lifetime=node('p','默认关闭。Mac 或远控程序重启、远控连接断开后，需要重新开启。','remote-api-note');
  const address=node('input');address.readOnly=true;address.setAttribute('aria-label','远程 API 地址');
  const copy=node('button','复制 API 地址','secondary');copy.type='button';
  const urlRow=node('div','','remote-api-address');urlRow.append(address,copy);urlRow.hidden=true;
  const toggle=node('button',local?'关闭远程 API 转发':'开启远程 API 转发','primary');toggle.type='button';toggle.disabled=true;
  const link=node('a','登录已绑定设备后开启','remote-api-entry');link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;
  const actions=node('div','','remote-api-actions');actions.append(toggle,link);
  const error=node('p','','error');error.setAttribute('role','alert');
  container.classList.add('remote-api-panel');container.replaceChildren(heading,description,lifetime,urlRow,actions,error);
  function render(value){
    state=value;container.hidden=!value.supported;if(!value.supported)return;
    status.textContent=value.enabled?(value.online?'已开启':'正在连接'):'已关闭';status.classList.toggle('enabled',value.enabled&&value.online);
    address.value=value.baseUrl||'';urlRow.hidden=!value.baseUrl;
    toggle.textContent=value.enabled?'关闭远程 API 转发':'开启远程 API 转发';toggle.hidden=local&&!value.enabled;toggle.disabled=busy;
    toggle.setAttribute('aria-pressed',String(Boolean(value.enabled)));
    const url=clientUrl();link.hidden=!local||!url;if(url)link.href=url;
    if(local)description.textContent='请在已绑定设备上登录账号，进入“连接设置”开启。此处可随时关闭转发。';
  }
  async function refresh(){
    if(reading||busy)return;reading=true;const current=++generation;
    try{const value=await request();if(current===generation){error.textContent='';render(value);}}
    catch(e){if(current===generation){error.textContent=e.message;toggle.disabled=true;}}
    finally{reading=false;}
  }
  toggle.onclick=async()=>{
    if(busy||!state)return;busy=true;++generation;toggle.disabled=true;error.textContent='';
    const enabled=!state.enabled;toggle.textContent=enabled?'正在开启…':'正在关闭…';
    try{const value=await request({enabled});busy=false;render(value);}
    catch(e){busy=false;error.textContent=e.message;toggle.textContent=state.enabled?'关闭远程 API 转发':'开启远程 API 转发';toggle.disabled=false;}
  };
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(address.value);copy.textContent='已复制';}catch{address.select();copy.textContent='请选择地址复制';}};
  return {refresh};
}
