// Contraseñas (scrypt) y tokens de sesión.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt N=2^15, r=8, p=1: ~32 MB y ~50-100 ms por verificación.
const N = 2 ** 15, R = 8, P = 1, LARGO = 64;
const MAXMEM = 128 * N * R * 2;

function derivar(clave: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolver, rechazar) => {
    scrypt(clave.normalize('NFKC'), sal, LARGO, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) },
      (err, clave) => (err ? rechazar(err) : resolver(clave)));
  });
}

/** Hash guardable: "scrypt$N$r$p$sal$hash" (base64url). */
export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(clave, sal, N, R, P);
  return ['scrypt', N, R, P, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

/** Comparación en tiempo constante; false ante cualquier formato inválido. */
export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hash, 'base64url');
  const obtenido = await derivar(clave, Buffer.from(sal, 'base64url'), Number(n), Number(r), Number(p));
  return esperado.length === obtenido.length && timingSafeEqual(esperado, obtenido);
}

/** Hash de una clave imposible: se verifica igual cuando el correo no existe (no delata qué correos hay). */
let hashFicticio: Promise<string> | null = null;
export function hashParaUsuarioInexistente(): Promise<string> {
  hashFicticio ??= hashearClave(randomBytes(24).toString('base64url'));
  return hashFicticio;
}

/** Contraseña temporal legible (sin 0/O/1/l/I), 14 caracteres. */
export function claveTemporal(): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(14);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

/** null si sirve; si no, el motivo. */
export function problemaConClave(clave: string, email: string): string | null {
  if (clave.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (clave.length > 200) return 'La contraseña es demasiado larga.';
  if (/^\d+$/.test(clave)) return 'La contraseña no puede ser solo números.';
  if (clave.toLowerCase().includes(email.split('@')[0]!.toLowerCase())) return 'La contraseña no puede contener tu usuario de correo.';
  return null;
}

export const COOKIE_SESION = 'piq_sesion';

/** Token para la cookie y su hash para la base de datos. */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
