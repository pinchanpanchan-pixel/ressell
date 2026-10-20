// Crea las cuentas de prueba en la pila local y autoriza solo a la propietaria.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const keys = Object.fromEntries(readFileSync(process.env.STACK_KEYS ?? '/tmp/mlsupply-stack/keys.env', 'utf8').trim().split('\n').map((l) => l.split('=')));
for (const [email, password] of [['owner@mlsupply.test', 'Owner-Password-123'], ['stranger@mlsupply.test', 'Stranger-Password-123']]) {
  const r = await fetch('http://127.0.0.1:54321/auth/v1/admin/users', {
    method: 'POST',
    headers: { apikey: keys.SERVICE_ROLE_KEY, Authorization: `Bearer ${keys.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  console.log(email, r.status);
}
execFileSync('su', ['postgres', '-c', "psql -tAc \"select private.authorize_owner('owner@mlsupply.test')\""], { stdio: 'inherit' });
