const encoder = new TextEncoder(), decoder = new TextDecoder();
export const from64 = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export function to64(bytes) { let text = ''; for (const b of bytes) text += String.fromCharCode(b); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
export const randomKey = () => to64(crypto.getRandomValues(new Uint8Array(32)));
const importKey = value => crypto.subtle.importKey('raw', from64(value), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function passwordKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: from64(salt), iterations: 310000 }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(key, value, label) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(label) }, key, encoder.encode(value));
  return { nonce: to64(nonce), data: to64(new Uint8Array(data)) };
}
async function decrypt(key, box, label) {
  return decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: from64(box.nonce), additionalData: encoder.encode(label) }, key, from64(box.data)));
}
export async function createVault(password, username) {
  const vaultKey = randomKey(), vaultSalt = randomKey();
  return { vaultKey, vaultSalt, vaultBox: await encrypt(await passwordKey(password, vaultSalt), vaultKey, `pocket-vault-v1:${username}`) };
}
export const unlockVault = async (password, account) => decrypt(await passwordKey(password, account.vaultSalt), account.vaultBox, `pocket-vault-v1:${account.username}`);
export const wrapDevice = async (vaultKey, encryptionKey, ownerId, deviceId) => encrypt(await importKey(vaultKey), encryptionKey, JSON.stringify(['pocket-device-v1', ownerId, deviceId]));
export const unlockDevice = async (vaultKey, device, ownerId) => decrypt(await importKey(vaultKey), device.keyBox, JSON.stringify(['pocket-device-v1', ownerId, device.id]));
