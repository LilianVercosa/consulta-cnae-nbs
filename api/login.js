const { signToken, readAlunos, readBody, SESSION_HOURS } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
  try {
    let body = await readBody(req);
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const email = String(body.email || '').trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(email)) return res.status(400).json({ erro: 'E-mail inválido.' });

    const alunos = await readAlunos();
    const a = alunos[email];
    if (!a) return res.status(401).json({ erro: 'E-mail não encontrado na lista de alunos.\nVerifique se é o mesmo e-mail usado na compra.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ token: signToken(email), nome: a.nome || email, validadeHoras: SESSION_HOURS });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro no servidor. Tente novamente em instantes.' });
  }
};
