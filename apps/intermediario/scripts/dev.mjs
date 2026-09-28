// Desarrollo: arranca el intermediario con tsx watch y el archivo de entorno de
// desarrollo (pnpm --filter @processiq/intermediario dev).
//
// Lee .env.dev, como la API de desarrollo. Solo si no existe, lee .env, como
// antes: en el PC del servidor, .env tiene los secretos de producción.
// Para llamarlo desde Vite, .env.dev necesita ALLOWED_ORIGINS=http://localhost:5173,
// ACCESS_CODE y ANTHROPIC_API_KEY (ver .env.dev.example; gasta de verdad).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..', '..', '..');
const archivo = ['.env.dev', '.env'].find((n) => existsSync(join(raiz, n)));
if (archivo === '.env') console.warn('Aviso: no hay .env.dev; el intermediario usa .env (en el servidor, los secretos de producción).');
else if (!archivo) console.warn('Aviso: no hay .env.dev ni .env; el intermediario arranca sin clave ni código.');
else console.info(`Intermediario de desarrollo con las variables de ${archivo}`);

const tsx = createRequire(import.meta.url).resolve('tsx/cli');
const args = [tsx, 'watch', ...(archivo ? [`--env-file=${join(raiz, archivo)}`] : []), 'src/index.ts'];
// El PORT de .env.dev es el de la API (8790): el intermediario va en el 8787, al
// que apunta el proxy de Vite. Una variable ya definida gana al archivo.
const env = { ...process.env, PORT: process.env.PORT ?? '8787' };
const hijo = spawn(process.execPath, args, { stdio: 'inherit', cwd: join(import.meta.dirname, '..'), env });
hijo.on('exit', (codigo, senal) => process.exit(senal ? 1 : (codigo ?? 0)));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => hijo.kill(s));
