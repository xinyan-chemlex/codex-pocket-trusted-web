import {text,to64,from64} from './trusted-crypto.js';
const ALPHABET='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function bindingCode(){
  const bytes=crypto.getRandomValues(new Uint8Array(20));let bits=0,value=0,out='';
  for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){bits-=5;out+=ALPHABET[(value>>>bits)&31];}}
  return out.match(/.{4}/g).join('-');
}
export function normalizeCode(code){
  if(typeof code!=='string'||code.length>80)throw new Error('请输入 Mac 上显示的绑定码');
  const value=code.toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');
  if(value.length!==32||[...value].some(c=>!ALPHABET.includes(c)))throw new Error('绑定码需为 32 位字母和数字，可直接粘贴');return value;
}
export const codeLookup=async code=>to64(await crypto.subtle.digest('SHA-256',text('pocket-pairing-lookup-v1:'+normalizeCode(code))));
const codeKey=async code=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',text('pocket-pairing-key-v1:'+normalizeCode(code))),'AES-GCM',false,['encrypt','decrypt']);
export async function sealBinding(code,ticket){const nonce=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:text('pocket-pairing-ticket-v1')},await codeKey(code),text(ticket));return {nonce:to64(nonce),data:to64(data)};}
export async function openBinding(code,box){
  if(!box||!/^[\w-]{16}$/.test(box.nonce||'')||typeof box.data!=='string'||box.data.length>8192)throw new Error('绑定信息无效');
  try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(box.nonce),additionalData:text('pocket-pairing-ticket-v1')},await codeKey(code),from64(box.data))));}
  catch{throw new Error('绑定码错误或绑定信息已被修改，请重新生成绑定码');}
}
