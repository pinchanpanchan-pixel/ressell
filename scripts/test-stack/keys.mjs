import crypto from 'node:crypto';
const secret = process.env.JWT_SECRET;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (role) => { const h = b64({ alg: 'HS256', typ: 'JWT' }); const p = b64({ iss: 'supabase-test', role, iat: 1700000000, exp: 2000000000 });
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`; };
console.log(`ANON_KEY=${sign('anon')}\nSERVICE_ROLE_KEY=${sign('service_role')}`);
