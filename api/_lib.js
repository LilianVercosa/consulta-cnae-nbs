// Funções compartilhadas: token de sessão assinado e lista de alunos no Vercel Blob
const crypto = require('crypto');
const { put, list, del } = require('@vercel/blob');

const SESSION_HOURS = 12;
const ALUNOS_PREFIX = 'privado/alunos-';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET não configurado');
  return s;
}
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function signToken(email) {
  const payload = b64u(JSON.stringify({ e: email, x: Date.now() + SESSION_HOURS * 3600 * 1000 }));
  const sig = b64u(crypto.createHmac('sha256', secret()).update(payload).digest());
  return payload + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', secret()).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.x > Date.now() ? data : null;
  } catch { return null; }
}

function bearer(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

async function findAlunosBlob() {
  const { blobs } = await list({ prefix: ALUNOS_PREFIX });
  if (!blobs.length) return null;
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return blobs;
}

async function readAlunos() {
  const blobs = await findAlunosBlob();
  if (!blobs) return {};
  const r = await fetch(blobs[0].url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Falha ao ler lista de alunos');
  return r.json();
}

async function writeAlunos(alunos) {
  const old = await findAlunosBlob();
  // nome com sufixo aleatório: o endereço do arquivo não pode ser adivinhado
  await put(ALUNOS_PREFIX + 'lista.json', JSON.stringify(alunos), {
    access: 'public', addRandomSuffix: true, contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  if (old && old.length) await del(old.map((b) => b.url));
}

async function readBody(req) {
  if (req.body !== undefined) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf-8');
}

module.exports = { signToken, verifyToken, bearer, safeEqual, readAlunos, writeAlunos, readBody, SESSION_HOURS };
