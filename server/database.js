const { Pool } = require('pg');
const path = require('path');

// Carregar variáveis de ambiente
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://agendawp:149agendaxl9@localhost:5432/agendawp';

console.log('Conectando ao banco de dados PostgreSQL com URL:', connectionString.replace(/:([^:@]+)@/, ':****@'));

const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1') && !connectionString.includes('host.docker.internal') ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente PostgreSQL:', err);
});

// Helper para converter a sintaxe do SQLite "?" para PostgreSQL "$1, $2..."
// E traduzir os INSERT OR REPLACE/IGNORE que são específicos do SQLite.
function prepareQuery(sql) {
  if (typeof sql !== 'string') return sql;
  let cleanSql = sql.trim();

  // 1. Converter placeholders "?" para "$1, $2..."
  let index = 1;
  cleanSql = cleanSql.replace(/\?/g, () => `$${index++}`);

  // 2. Traduzir INSERT OR REPLACE e INSERT OR IGNORE do SQLite
  // Caso 1: ChatState (Chave primária: whatsapp)
  if (/^INSERT\s+OR\s+REPLACE\s+INTO\s+ChatState/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(
      /^INSERT\s+OR\s+REPLACE\s+INTO\s+ChatState\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
      (match, columnsStr, valuesStr) => {
        const columns = columnsStr.split(',').map(c => c.trim());
        const updates = columns
          .filter(c => c.toLowerCase() !== 'whatsapp')
          .map(c => `${c} = EXCLUDED.${c}`)
          .join(', ');
        return `INSERT INTO ChatState (${columnsStr}) VALUES (${valuesStr}) ON CONFLICT (whatsapp) DO UPDATE SET ${updates}`;
      }
    );
  }
  // Caso 2: Configuracoes (Chave primária: chave)
  else if (/^INSERT\s+OR\s+REPLACE\s+INTO\s+Configuracoes/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(
      /^INSERT\s+OR\s+REPLACE\s+INTO\s+Configuracoes/i,
      'INSERT INTO Configuracoes'
    ) + ' ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor';
  }
  // Caso 3: Configuracoes (Ignore)
  else if (/^INSERT\s+OR\s+IGNORE\s+INTO\s+Configuracoes/i.test(cleanSql)) {
    cleanSql = cleanSql.replace(
      /^INSERT\s+OR\s+IGNORE\s+INTO\s+Configuracoes/i,
      'INSERT INTO Configuracoes'
    ) + ' ON CONFLICT (chave) DO NOTHING';
  }

  // 3. Adicionar "RETURNING id" para comandos INSERT que geram ID
  // Tabelas com SERIAL ID: Convenios, Pacientes, Medicos, Disponibilidade, Agendamentos, WhatsappMensagens, Salas, Chamadas
  // Ignoramos ChatState e Configuracoes que usam strings como chave primária
  if (/^INSERT\s+INTO\s+/i.test(cleanSql)) {
    const isExcluded = /ChatState|Configuracoes/i.test(cleanSql);
    const alreadyHasReturning = /RETURNING/i.test(cleanSql);
    if (!isExcluded && !alreadyHasReturning) {
      cleanSql += ' RETURNING id';
    }
  }

  // 4. Ignorar comandos PRAGMA do SQLite
  if (/^PRAGMA\s+/i.test(cleanSql)) {
    return 'SELECT 1';
  }

  return cleanSql;
}

// Objeto que simula a interface do driver 'sqlite3'
const db = {
  get(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const cleanSql = prepareQuery(sql);
    pool.query(cleanSql, params)
      .then(res => {
        if (typeof callback === 'function') {
          callback(null, res.rows[0] || null);
        }
      })
      .catch(err => {
        console.error('Erro na query (get):', cleanSql, err);
        if (typeof callback === 'function') {
          callback(err);
        }
      });
  },

  all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const cleanSql = prepareQuery(sql);
    pool.query(cleanSql, params)
      .then(res => {
        if (typeof callback === 'function') {
          callback(null, res.rows || []);
        }
      })
      .catch(err => {
        console.error('Erro na query (all):', cleanSql, err);
        if (typeof callback === 'function') {
          callback(err);
        }
      });
  },

  run(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    const cleanSql = prepareQuery(sql);
    pool.query(cleanSql, params)
      .then(res => {
        const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? parseInt(res.rows[0].id, 10) : null;
        const changes = res.rowCount;
        if (typeof callback === 'function') {
          callback.call({ lastID, changes }, null);
        }
      })
      .catch(err => {
        console.error('Erro na query (run):', cleanSql, err);
        if (typeof callback === 'function') {
          callback(err);
        }
      });
  },

  serialize(callback) {
    callback();
  },

  close(callback) {
    pool.end(callback);
  }
};

// Inicialização sequencial e assíncrona do esquema das tabelas
async function initDatabase() {
  try {
    console.log('Iniciando criação de tabelas PostgreSQL...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Salas (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Convenios (
        id SERIAL PRIMARY KEY,
        nome_plano TEXT NOT NULL,
        status_ativo INTEGER DEFAULT 1
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Medicos (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        crm TEXT UNIQUE NOT NULL,
        especialidade TEXT NOT NULL,
        patologias_atendidas TEXT,
        valor_consulta REAL DEFAULT 150.00,
        sala_id INTEGER REFERENCES Salas(id) ON DELETE SET NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Pacientes (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        cpf TEXT UNIQUE NOT NULL,
        whatsapp TEXT NOT NULL,
        data_nascimento TEXT NOT NULL,
        convenio_id INTEGER REFERENCES Convenios (id) ON DELETE SET NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Disponibilidade (
        id SERIAL PRIMARY KEY,
        medico_id INTEGER NOT NULL REFERENCES Medicos (id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        status_disponivel INTEGER DEFAULT 1
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Agendamentos (
        id SERIAL PRIMARY KEY,
        paciente_id INTEGER NOT NULL REFERENCES Pacientes (id) ON DELETE RESTRICT,
        medico_id INTEGER NOT NULL REFERENCES Medicos (id) ON DELETE RESTRICT,
        data_hora TEXT NOT NULL,
        tipo_atendimento TEXT NOT NULL,
        tipo_pagamento TEXT NOT NULL,
        valor_combinado REAL NOT NULL DEFAULT 0.0,
        status_agendamento TEXT NOT NULL DEFAULT 'pendente',
        observacoes TEXT,
        orientacoes_reagendamento TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS WhatsappMensagens (
        id SERIAL PRIMARY KEY,
        agendamento_id INTEGER REFERENCES Agendamentos (id) ON DELETE SET NULL,
        whatsapp_destino TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        status_envio TEXT DEFAULT 'pendente',
        data_envio TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ChatState (
        whatsapp TEXT PRIMARY KEY,
        estado TEXT NOT NULL,
        temp_nome TEXT,
        temp_cpf TEXT,
        temp_tipo TEXT,
        temp_pagamento TEXT,
        temp_convenio_id INTEGER,
        temp_medico_id INTEGER,
        temp_slots_json TEXT
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Chamadas (
        id SERIAL PRIMARY KEY,
        agendamento_id INTEGER REFERENCES Agendamentos(id) ON DELETE SET NULL,
        paciente_nome TEXT NOT NULL,
        medico_nome TEXT NOT NULL,
        sala_nome TEXT NOT NULL,
        data_hora TEXT NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS Configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT
      )
    `);

    // Adições de colunas (caso as tabelas já existam)
    await pool.query(`
      ALTER TABLE Medicos ADD COLUMN IF NOT EXISTS sala_id INTEGER REFERENCES Salas(id) ON DELETE SET NULL;
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE Medicos ADD COLUMN IF NOT EXISTS valor_consulta REAL DEFAULT 150.00;
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE Agendamentos ADD COLUMN IF NOT EXISTS observacoes TEXT;
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE Agendamentos ADD COLUMN IF NOT EXISTS orientacoes_reagendamento TEXT;
    `).catch(() => {});

    console.log('Estrutura de tabelas verificada com sucesso no PostgreSQL.');

    // Semear salas se estiver vazio
    const salasCount = await pool.query('SELECT COUNT(*) as count FROM Salas');
    if (parseInt(salasCount.rows[0].count, 10) === 0) {
      await pool.query("INSERT INTO Salas (nome) VALUES ('Consultório 1')");
      await pool.query("INSERT INTO Salas (nome) VALUES ('Consultório 2')");
      await pool.query("INSERT INTO Salas (nome) VALUES ('Sala de Exames A')");
      console.log('Salas semeadas.');
    }

    // Semear configurações padrão se estiver vazio
    const configCount = await pool.query('SELECT COUNT(*) as count FROM Configuracoes');
    if (parseInt(configCount.rows[0].count, 10) === 0) {
      const defaultConfigs = [
        ['url_n8n_mensagens', ''],
        ['url_n8n_alertas', ''],
        ['whatsapp_instancia', 'instancia_principal'],
        ['whatsapp_token', ''],
        ['nome_clinica', 'Agenda WP'],
        ['telefone_clinica', ''],
        ['bot_ativo', '1'],
        ['bot_mensagem_boas_vindas', 'Olá! Seja bem-vindo à clínica *{clinica}*. Sou a assistente virtual da clínica. 🤖\nIdentifiquei que este número ainda não está cadastrado em nosso sistema.\n\nPara começarmos seu cadastro rápido, por favor, digite seu *nome completo*:'],
        ['lembrete_horario', '08:00'],
        ['lembrete_modelo', 'Olá *{paciente}*! 🏥\nLembramos que seu agendamento de *{tipo}* com *{medico}* está marcado para amanhã (*{data}*) às *{hora}h*.\n\nResponda *1* para *CONFIRMAR* ou *2* para *CANCELAR*.']
      ];
      for (const [chave, valor] of defaultConfigs) {
        await pool.query('INSERT INTO Configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING', [chave, valor]);
      }
      console.log('Configurações padrão semeadas.');
    }

    // Semear dados principais se Convenios estiver vazio
    const conveniosCount = await pool.query('SELECT COUNT(*) as count FROM Convenios');
    if (parseInt(conveniosCount.rows[0].count, 10) === 0) {
      await seedDataSequential();
    }

  } catch (error) {
    console.error('Erro ao inicializar esquema do PostgreSQL:', error);
  }
}

async function seedDataSequential() {
  try {
    console.log('Iniciando semeadura de dados no PostgreSQL...');

    const convenios = [
      ['Unimed Nacional', 1],
      ['Amil Fácil', 1],
      ['Bradesco Saúde Premium', 1],
      ['SulAmérica Exclusivo', 0]
    ];
    for (const c of convenios) {
      await pool.query('INSERT INTO Convenios (nome_plano, status_ativo) VALUES ($1, $2)', c);
    }

    const medicos = [
      ['Dr. Carlos Silva', 'CRM-SP 123456', 'Cardiologia', 'Hipertensão, Arritmia, Insuficiência Cardíaca, Infarto', 180.00],
      ['Dra. Beatriz Santos', 'CRM-SP 234567', 'Pediatria', 'Asma Infantil, Bronquite, Dermatite, Crescimento', 150.00],
      ['Dr. André Marques', 'CRM-SP 345678', 'Ortopedia', 'Tendinite, Hérnia de Disco, Fraturas, Artrose', 200.00],
      ['Dra. Camila Nogueira', 'CRM-SP 456789', 'Endocrinologia', 'Diabetes Mellitus, Obesidade, Hipotireoidismo, Colesterol', 160.00]
    ];
    for (const m of medicos) {
      await pool.query('INSERT INTO Medicos (nome, crm, especialidade, patologias_atendidas, valor_consulta) VALUES ($1, $2, $3, $4, $5)', m);
    }

    const pacientes = [
      ['João Pedro Alves', '123.456.789-00', '5511999998888', '1985-05-15', 1],
      ['Mariana Costa Dias', '234.567.890-11', '5511988887777', '1992-10-22', 2],
      ['Roberto de Oliveira', '345.678.901-22', '5511977776666', '1970-02-08', null],
      ['Juliana M. Vieira', '456.789.012-33', '5511966665555', '1988-12-01', 3]
    ];
    for (const p of pacientes) {
      await pool.query('INSERT INTO Pacientes (nome, cpf, whatsapp, data_nascimento, convenio_id) VALUES ($1, $2, $3, $4, $5)', p);
    }

    const hoje = '2026-06-08';
    const amanha = '2026-06-09';
    const depois = '2026-06-10';

    const disponibilidades = [
      [1, hoje, '09:00', 0],
      [1, hoje, '10:00', 1],
      [1, hoje, '11:00', 1],
      [1, amanha, '09:00', 1],
      [1, amanha, '10:00', 1],
      [1, depois, '14:00', 1],
      [2, hoje, '14:00', 0],
      [2, hoje, '15:00', 1],
      [2, amanha, '14:00', 1],
      [2, amanha, '16:00', 1],
      [3, hoje, '10:00', 1],
      [3, hoje, '11:00', 0],
      [3, amanha, '10:00', 1],
      [3, depois, '11:00', 1],
      [4, hoje, '09:00', 1],
      [4, hoje, '14:00', 0],
      [4, amanha, '09:00', 1],
      [4, amanha, '15:00', 1]
    ];
    for (const d of disponibilidades) {
      await pool.query('INSERT INTO Disponibilidade (medico_id, data, hora_inicio, status_disponivel) VALUES ($1, $2, $3, $4)', d);
    }

    const agendamentos = [
      [1, 1, `${hoje} 09:00`, 'consulta', 'convenio', 120.00, 'confirmado'],
      [2, 2, `${hoje} 14:00`, 'consulta', 'convenio', 150.00, 'pendente'],
      [3, 3, `${hoje} 11:00`, 'exame', 'particular', 250.00, 'realizado'],
      [4, 4, `${hoje} 14:00`, 'consulta', 'convenio', 180.00, 'cancelado']
    ];
    for (const a of agendamentos) {
      await pool.query('INSERT INTO Agendamentos (paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado, status_agendamento) VALUES ($1, $2, $3, $4, $5, $6, $7)', a);
    }

    const mensagens = [
      [1, '5511999998888', 'Olá *João Pedro Alves*! 🏥\nSeu agendamento de *consulta* (Cardiologia) com *Dr. Carlos Silva* está marcado para o dia *08/06/2026* às *09:00*.\n\nResponda *CONFIRMAR* para confirmar sua presença ou *CANCELAR* para desmarcar.', 'lido', '2026-06-08 07:30:00'],
      [2, '5511988887777', 'Olá *Mariana Costa Dias*! 🏥\nSeu agendamento de *consulta* (Endocrinologia) com *Dra. Camila Nogueira* está marcado para o dia *08/06/2026* às *14:00*.\n\nResponda *CONFIRMAR* para confirmar sua presença ou *CANCELAR* para desmarcar.', 'entregue', '2026-06-08 08:00:00'],
      [3, '5511977776666', 'Olá *Roberto de Oliveira*! 🏥\nSeu agendamento de *exame* (Ortopedia) com *Dr. André Marques* está marcado para o dia *08/06/2026* às *11:00*.', 'lido', '2026-06-07 16:00:00'],
      [4, '5511966665555', 'Olá *Juliana M. Vieira*! Seu agendamento de Endocrinologia com Dra. Camila Nogueira para 2026-06-08 às 14:00 foi CANCELADO conforme solicitado.', 'lido', '2026-06-08 08:15:00']
    ];
    for (const m of mensagens) {
      await pool.query('INSERT INTO WhatsappMensagens (agendamento_id, whatsapp_destino, mensagem, status_envio, data_envio) VALUES ($1, $2, $3, $4, $5)', m);
    }

    console.log('Dados semeados com sucesso no PostgreSQL!');
  } catch (error) {
    console.error('Erro durante a semeadura de dados no PostgreSQL:', error);
  }
}

// Disparar a inicialização assíncrona em background
initDatabase();

module.exports = db;
