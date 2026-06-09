import pkg from 'pg';
const { Pool } = pkg;
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../server/.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://agendawp:149agendaxl9@localhost:5432/agendawp';
const pool = new Pool({ connectionString });

async function run() {
  try {
    console.log('Connecting to:', connectionString);
    const chats = await pool.query('SELECT * FROM WhatsappMensagens ORDER BY id DESC LIMIT 10');
    console.log('--- WhatsappMensagens (Last 10) ---');
    console.log(chats.rows);

    const pacientes = await pool.query('SELECT * FROM Pacientes LIMIT 10');
    console.log('--- Pacientes ---');
    console.log(pacientes.rows);

    const states = await pool.query('SELECT * FROM ChatState LIMIT 10');
    console.log('--- ChatState ---');
    console.log(states.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
