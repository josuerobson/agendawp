const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://agendawp:149agendaxl9@localhost:5432/agendawp';
const pool = new Pool({ connectionString });

async function run() {
  try {
    const res = await pool.query('SELECT * FROM Configuracoes');
    console.log('--- Configuracoes ---');
    res.rows.forEach(r => {
      if (r.chave === 'gemini_api_key') {
        console.log(`${r.chave}: ${r.valor ? '***' + r.valor.slice(-4) : '(empty)'}`);
      } else {
        console.log(`${r.chave}: ${r.valor}`);
      }
    });
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
