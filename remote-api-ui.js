const node=(tag,text='',cls='')=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};

export function setupRemoteApiPanel(container,{request,local=false,clientUrl=()=>null}={}){
  if(!container)return {refresh:async()=>{}};
  let state,busy=false,generation=0,reading=false;
  const title=node('h3',local?'设备 API 转发':'本设备 API 转发'),status=node('span','读取状态…','remote-api-status');
  const heading=node('div','','remote-api-heading');heading.append(title,status);
  const description=node('p','只控制本设备的访问权限。其他设备各自独立开启。');
  const lifetime=node('p','保持本设备的远控页面连接。关闭页面、退出或断线后，临时 Key 自动失效；重新连接需重新开启。','remote-api-note');
  const address=node('input');address.readOnly=true;address.setAttribute('aria-label','远程 API 地址');
  const copy=node('button','复制 API 地址','secondary');copy.type='button';
  const urlRow=node('div','','remote-api-address');urlRow.append(address,copy);urlRow.hidden=true;
  const apiKey=node('input');apiKey.type='password';apiKey.readOnly=true;apiKey.autocomplete='off';apiKey.setAttribute('aria-label','本设备临时 API Key');
  const copyKey=node('button','复制本设备 Key','secondary');copyKey.type='button';
  const keyRow=node('div','','remote-api-address');keyRow.append(apiKey,copyKey);keyRow.hidden=true;
  const toggle=node('button',local?'关闭远程 API 转发':'开启远程 API 转发','primary');toggle.type='button';toggle.disabled=true;
  const link=node('a','登录已绑定设备后开启','remote-api-entry');link.target='_blank';link.rel='noopener noreferrer';link.hidden=true;
  const actions=node('div','','remote-api-actions');actions.append(toggle,link);
  const error=node('p','','error');error.setAttribute('role','alert');
  container.classList.add('remote-api-panel');container.replaceChildren(heading,description,lifetime,urlRow,keyRow,actions,error);
  function render(value){
    state=value;container.hidden=!value.supported;if(!value.supported)return;
    status.textContent=local?`${value.activeDevices||0} 台设备已开启`:value.enabled?(value.online?'本设备已开启':'正在连接'):'本设备已关闭';status.classList.toggle('enabled',value.enabled&&value.online);
    address.value=value.baseUrl||'';urlRow.hidden=!value.baseUrl;
    apiKey.value=value.apiKey||'';keyRow.hidden=local||!value.enabled||!value.apiKey;
    toggle.textContent=local?'关闭所有设备转发':value.enabled?'关闭本设备转发':'开启本设备转发';toggle.hidden=local&&!value.enabled;toggle.disabled=busy;
    toggle.setAttribute('aria-pressed',String(Boolean(value.enabled)));
    const url=clientUrl();link.hidden=!local||!url;if(url)link.href=url;
    if(local)description.textContent='每台设备在自己的远控设置里独立开启。设备断线后，仅关闭它自己的转发。';
  }
  async function refresh(){
    if(reading||busy)return;reading=true;const current=++generation;
    try{const value=await request();if(current===generation){error.textContent='';render(value);}}
    catch(e){if(current===generation){error.textContent=e.message;toggle.disabled=true;apiKey.value='';keyRow.hidden=true;}}
    finally{reading=false;}
  }
  toggle.onclick=async()=>{
    if(busy||!state)return;busy=true;++generation;toggle.disabled=true;error.textContent='';
    const enabled=!state.enabled;toggle.textContent=enabled?'正在开启…':'正在关闭…';
    try{const value=await request({enabled});busy=false;render(value);}
    catch(e){busy=false;error.textContent=e.message;toggle.textContent=local?'关闭所有设备转发':state.enabled?'关闭本设备转发':'开启本设备转发';toggle.disabled=false;apiKey.value='';keyRow.hidden=true;}
  };
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(address.value);copy.textContent='已复制';}catch{address.select();copy.textContent='请选择地址复制';}};
  copyKey.onclick=async()=>{try{await navigator.clipboard.writeText(apiKey.value);copyKey.textContent='已复制';}catch{error.textContent='无法写入剪贴板，请允许浏览器复制后重试';}};
  return {refresh};
}
