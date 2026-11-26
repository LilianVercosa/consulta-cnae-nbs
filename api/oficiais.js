const { verifyToken, bearer } = require('./_lib');
const oficiais = require('./_oficiais');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!verifyToken(bearer(req))) return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  return res.status(200).json(oficiais);
};
