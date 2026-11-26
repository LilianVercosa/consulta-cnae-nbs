const { verifyToken, bearer } = require('./_lib');
const dados = require('./_data');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!verifyToken(bearer(req))) return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  return res.status(200).json(dados);
};
