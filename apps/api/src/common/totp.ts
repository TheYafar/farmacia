import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Códigos de 6 números que cambian cada 30 s (Google Authenticator, Authy, Microsoft Authenticator). RFC 6238. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function nuevoSecreto() {
  const b = randomBytes(20);
  let bits = '', out = '';
  for (const x of b) bits += x.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function decodificar(s: string) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codigoEn(secreto: string, paso: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', decodificar(secreto)).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/** Acepta el código actual y el anterior/siguiente (relojes un poco desfasados). */
export function verificarCodigo(secreto: string, codigo: string, ahora = Date.now()) {
  const paso = Math.floor(ahora / 30_000);
  return [-1, 0, 1].some((d) => timingSafeEqual(Buffer.from(codigoEn(secreto, paso + d)), Buffer.from(codigo.padStart(6, '0').slice(0, 6))));
}

export const urlTotp = (secreto: string, usuario: string, emisor: string) =>
  `otpauth://totp/${encodeURIComponent(`${emisor}:${usuario}`)}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}`;

/** El secreto se guarda cifrado (AES-256-GCM) con una clave derivada del JWT_SECRET. */
const llave = (base: string) => createHash('sha256').update(`totp:${base}`).digest();
export function cifrar(texto: string, base: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', llave(base), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64')).join('.');
}
export function descifrar(guardado: string, base: string) {
  const [iv, tag, datos] = guardado.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', llave(base), iv!);
  d.setAuthTag(tag!);
  return Buffer.concat([d.update(datos!), d.final()]).toString('utf8');
}
