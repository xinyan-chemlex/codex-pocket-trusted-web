import{MarkdownIt,DOMPurify,katex,hljs}from'./vendor/bundle.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const math=(text,display)=>{try{return katex.renderToString(text,{displayMode:display,throwOnError:false,trust:false,strict:'ignore',maxExpand:1000});}catch{return escape(text);}};
const md=new MarkdownIt({html:false,linkify:true,typographer:false,breaks:false,highlight:(code,lang)=>{if(['math','latex','tex'].includes(lang))return `<div class="math-block">${math(code,true)}</div>`;try{return hljs.highlight(code,{language:hljs.getLanguage(lang)?lang:'plaintext'}).value;}catch{return escape(code);}}});
md.inline.ruler.before('escape','math_inline',(state,silent)=>{
  const p=state.pos,s=state.src;let open,close;
  if(s.slice(p,p+2)==='\\('){open='\\(';close='\\)';}else if(s[p]==='$'&&s[p+1]!=='$'){open='$';close='$';}else return false;
  let end=s.indexOf(close,p+open.length);while(end>=0&&s[end-1]==='\\')end=s.indexOf(close,end+close.length);
  if(end<0||end===p+open.length||s.slice(p+open.length,end).includes('\n'))return false;
  if(!silent){const token=state.push('math_inline','math',0);token.content=s.slice(p+open.length,end);}state.pos=end+close.length;return true;
});
md.renderer.rules.math_inline=(tokens,i)=>math(tokens[i].content,false);
md.block.ruler.before('fence','math_block',(state,start,end,silent)=>{
  const line=state.src.slice(state.bMarks[start]+state.tShift[start],state.eMarks[start]).trim();const open=line.startsWith('$$')?'$$':line.startsWith('\\[')?'\\[':null;if(!open)return false;
  const close=open==='$$'?'$$':'\\]';let content=line.slice(open.length),next=start+1,found=false;
  if(content.includes(close)){content=content.slice(0,content.indexOf(close));found=true;}else while(next<end){const text=state.src.slice(state.bMarks[next],state.eMarks[next]);next++;if(text.includes(close)){content+='\n'+text.slice(0,text.indexOf(close));found=true;break;}content+='\n'+text;}
  if(!found)return false;if(silent)return true;const token=state.push('math_block','math',0);token.content=content;token.block=true;state.line=next;return true;
});
md.renderer.rules.math_block=(tokens,i)=>`<div class="math-block">${math(tokens[i].content,true)}</div>`;
const fileRef=href=>!/^https?:|^mailto:|^#|^data:|^javascript:/i.test(href)&&(/^(?:file:|\/|\.\.?\/|~\/)/.test(href)||/\.[a-zA-Z0-9]{1,8}(?::\d+)?(?:#.*)?$/.test(href));
md.renderer.rules.link_open=(tokens,i,options,env,self)=>{const t=tokens[i],href=t.attrGet('href')||'';if(fileRef(href)){t.attrSet('data-file',href);t.attrSet('href','#');t.attrSet('class','file-link');}else{t.attrSet('target','_blank');t.attrSet('rel','noopener noreferrer');}return self.renderToken(tokens,i,options);};
md.renderer.rules.image=(tokens,i,options,env)=>{const t=tokens[i],src=t.attrGet('src')||'',alt=t.content||'';return (fileRef(src)||src.startsWith('pocket-image:'))?`<img class="md-image local-image" data-file-image="${escape(src)}" alt="${escape(alt)}">`:`<img class="md-image" src="${escape(src)}" alt="${escape(alt)}" loading="lazy" referrerpolicy="no-referrer">`;};
md.renderer.rules.code_inline=(tokens,i)=>{const text=tokens[i].content;return fileRef(text)&&/\.[a-zA-Z0-9]{1,8}(?::\d+)?$/.test(text)?`<a href="#" class="file-link" data-file="${escape(text)}"><code>${escape(text)}</code></a>`:`<code>${escape(text)}</code>`;};
const slugs=new Map();md.renderer.rules.heading_open=(tokens,i,options,env,self)=>{const text=tokens[i+1]?.content||'',base=text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'')||'heading';const count=slugs.get(base)||0;slugs.set(base,count+1);tokens[i].attrSet('id',base+(count?'-'+count:''));return self.renderToken(tokens,i,options);};
export function renderMarkdown(element,text,{openFile,loadImage,openImage}={}) {
  slugs.clear();element.innerHTML=DOMPurify.sanitize(md.render(String(text||'')),{ADD_ATTR:['target','data-file','data-file-image'],USE_PROFILES:{html:true,svg:true,mathMl:true}});
  for(const table of element.querySelectorAll('table')){const wrap=document.createElement('div');wrap.className='table-scroll';table.before(wrap);wrap.append(table);}
  for(const link of element.querySelectorAll('[data-file]'))link.addEventListener('click',e=>{e.preventDefault();openFile?.(link.dataset.file);});
  for(const img of element.querySelectorAll('[data-file-image]'))loadImage?.(img.dataset.fileImage).then(url=>{img.src=url;img.onclick=()=>openImage?openImage(url,img.alt,img.dataset.fileImage):openFile?.(img.dataset.fileImage);}).catch(()=>{const button=document.createElement('button');button.className='image-fallback';button.textContent=`查看图片：${img.alt||img.dataset.fileImage}`;button.onclick=()=>openFile?.(img.dataset.fileImage);img.replaceWith(button);});
  for(const img of element.querySelectorAll('img:not([data-file-image])'))img.onclick=()=>openImage?.(img.src,img.alt);
}
export function highlightCode(element,text,language='plaintext'){element.textContent=text;try{element.innerHTML=hljs.highlight(text,{language:hljs.getLanguage(language)?language:'plaintext'}).value;}catch{}}
