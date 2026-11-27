// Atualiza a lista de alunos a partir do CSV da plataforma (protegido pela senha de administrador)
const { safeEqual, writeAlunos, readAlunos, readBody } = require('../_lib');

function parseCSVLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((c === ',' || c === ';') && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const titleCase = (s) => s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error('Arquivo vazio');
  const h = parseCSVLine(lines[0]).map((x) => x.trim().toLowerCase());
  const idx = (fn) => h.findIndex(fn);
  const iE = idx((x) => x.includes('email') || x.includes('e-mail'));
  const iN = idx((x) => x.includes('name') || x.includes('nome'));
  const iC = idx((x) => x.includes('class') || x.includes('turma'));
  const iT = idx((x) => x.includes('access'));
  const iD = idx((x) => x.includes('added on') || x.includes('added'));
  if (iE < 0) throw new Error('Coluna "Email" não encontrada');
  const alunos = {};
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    const email = (c[iE] || '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    let nome = iN >= 0 ? (c[iN] || '').trim() : '';
    if (!nome) nome = email.split('@')[0];
    alunos[email] = {
      nome: titleCase(nome),
      turma: iC >= 0 ? (c[iC] || '').trim() : '',
      tipo: iT >= 0 ? (c[iT] || '').trim() : '',
      data: iD >= 0 ? (c[iD] || '').trim().slice(0, 10) : '',
    };
  }
  return alunos;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pass = req.headers['x-admin-password'] || '';
  if (!process.env.ADMIN_PASSWORD || !safeEqual(pass, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ erro: 'Senha incorreta.' });
  }
  try {
    if (req.method === 'GET') {
      const alunos = await readAlunos();
      return res.status(200).json({ ok: true, total: Object.keys(alunos).length });
    }
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    let text = await readBody(req);
    if (typeof text !== 'string') text = Buffer.isBuffer(text) ? text.toString('utf-8') : String(text.csv || '');
    const modo = String((req.query && req.query.modo) || req.headers['x-modo'] || '').toLowerCase();
    if (modo === 'trocar') {
      // Troca o e-mail de um aluno mantendo nome, turma e data: corpo "antigo;novo" (um por linha)
      const atuais = await readAlunos();
      const feitos = [], erros = [];
      text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
        const [a, n] = l.split(/[;\t,]|\s+/).map((x) => (x || '').trim().toLowerCase()).filter(Boolean);
        if (!a || !n || !/^\S+@\S+\.\S+$/.test(n)) { erros.push(l + ' (formato: antigo;novo)'); return; }
        if (!atuais[a]) { erros.push(a + ' não está na lista'); return; }
        atuais[n] = Object.assign({}, atuais[a], atuais[n] || {});
        delete atuais[a];
        feitos.push(a + ' → ' + n);
      });
      if (!feitos.length) throw new Error(erros.join('; ') || 'Nenhuma troca informada');
      await writeAlunos(atuais);
      return res.status(200).json({ ok: true, trocados: feitos, erros, total: Object.keys(atuais).length });
    }
    if (modo === 'adicionar') {
      // Adiciona e-mails avulsos (um por linha, opcionalmente "e-mail;nome") sem apagar a lista atual
      const atuais = await readAlunos();
      const novos = [];
      text.split(/[\r\n,]+/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
        const [em, ...resto] = l.split(/[;\t]/);
        const email = (em || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return;
        if (!atuais[email]) novos.push(email);
        const nome = resto.join(' ').trim();
        atuais[email] = Object.assign({ nome: nome ? titleCase(nome) : email.split('@')[0], turma: 'Manual', tipo: 'Manual', data: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Recife' }) }, atuais[email] || {}, nome ? { nome: titleCase(nome) } : {});
      });
      if (!novos.length && !text.trim()) throw new Error('Nenhum e-mail informado');
      await writeAlunos(atuais);
      return res.status(200).json({ ok: true, adicionados: novos, total: Object.keys(atuais).length });
    }
    const alunos = parseCSV(text);
    const total = Object.keys(alunos).length;
    if (!total) throw new Error('Nenhum e-mail válido encontrado no CSV');
    await writeAlunos(alunos);
    return res.status(200).json({ ok: true, total });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ erro: (String((req.query && req.query.modo) || req.headers['x-modo'] || '') ? '' : 'Erro ao processar CSV: ') + e.message });
  }
};
