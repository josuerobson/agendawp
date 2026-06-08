const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Helper para rodar query de inserção e retornar promessa
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve(this);
  });
});

// Habilitar chaves estrangeiras no SQLite e criar tabelas
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON;', (err) => {
    if (err) console.error('Erro ao habilitar foreign keys:', err);
  });

  // Criar tabela de Convenios
  db.run(`
    CREATE TABLE IF NOT EXISTS Convenios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome_plano TEXT NOT NULL,
      status_ativo INTEGER DEFAULT 1
    )
  `);

  // Criar tabela de Pacientes
  db.run(`
    CREATE TABLE IF NOT EXISTS Pacientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      whatsapp TEXT NOT NULL,
      data_nascimento TEXT NOT NULL,
      convenio_id INTEGER,
      FOREIGN KEY (convenio_id) REFERENCES Convenios (id) ON DELETE SET NULL
    )
  `);

  // Criar tabela de Medicos
  db.run(`
    CREATE TABLE IF NOT EXISTS Medicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      crm TEXT UNIQUE NOT NULL,
      especialidade TEXT NOT NULL,
      patologias_atendidas TEXT
    )
  `);

  // Criar tabela de Disponibilidade
  db.run(`
    CREATE TABLE IF NOT EXISTS Disponibilidade (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medico_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      hora_inicio TEXT NOT NULL,
      status_disponivel INTEGER DEFAULT 1,
      FOREIGN KEY (medico_id) REFERENCES Medicos (id) ON DELETE CASCADE
    )
  `);

  // Criar tabela de Agendamentos
  db.run(`
    CREATE TABLE IF NOT EXISTS Agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paciente_id INTEGER NOT NULL,
      medico_id INTEGER NOT NULL,
      data_hora TEXT NOT NULL,
      tipo_atendimento TEXT NOT NULL,
      tipo_pagamento TEXT NOT NULL,
      valor_combinado REAL NOT NULL DEFAULT 0.0,
      status_agendamento TEXT NOT NULL DEFAULT 'pendente',
      FOREIGN KEY (paciente_id) REFERENCES Pacientes (id) ON DELETE RESTRICT,
      FOREIGN KEY (medico_id) REFERENCES Medicos (id) ON DELETE RESTRICT
    )
  `);

  // Criar tabela de Mensagens de WhatsApp (para simulação)
  db.run(`
    CREATE TABLE IF NOT EXISTS WhatsappMensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id INTEGER,
      whatsapp_destino TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      status_envio TEXT DEFAULT 'pendente',
      data_envio TEXT NOT NULL,
      FOREIGN KEY (agendamento_id) REFERENCES Agendamentos (id) ON DELETE SET NULL
    )
  `);

  // Criar tabela de Controle do Estado do Chat (para o Robô de IA)
  db.run(`
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

  // Criar tabela de Salas (Consultórios)
  db.run(`
    CREATE TABLE IF NOT EXISTS Salas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);

  // Adicionar coluna sala_id à tabela Medicos se não existir
  db.run(`
    ALTER TABLE Medicos ADD COLUMN sala_id INTEGER REFERENCES Salas(id) ON DELETE SET NULL;
  `, (err) => {
    // Ignorar erro se a coluna já existe
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Erro ao adicionar coluna sala_id a Medicos:', err.message);
    }
  });

  // Adicionar coluna observacoes à tabela Agendamentos se não existir
  db.run(`
    ALTER TABLE Agendamentos ADD COLUMN observacoes TEXT;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Erro ao adicionar coluna observacoes a Agendamentos:', err.message);
    }
  });

  // Adicionar coluna orientacoes_reagendamento à tabela Agendamentos se não existir
  db.run(`
    ALTER TABLE Agendamentos ADD COLUMN orientacoes_reagendamento TEXT;
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Erro ao adicionar coluna orientacoes_reagendamento a Agendamentos:', err.message);
    }
  });

  // Criar tabela de Chamadas (Painel de Senha)
  db.run(`
    CREATE TABLE IF NOT EXISTS Chamadas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id INTEGER,
      paciente_nome TEXT NOT NULL,
      medico_nome TEXT NOT NULL,
      sala_nome TEXT NOT NULL,
      data_hora TEXT NOT NULL,
      FOREIGN KEY (agendamento_id) REFERENCES Agendamentos(id) ON DELETE SET NULL
    )
  `);

  console.log('Tabelas de banco de dados verificadas/criadas.');

  // Verificar e semear Salas de forma independente
  db.get('SELECT COUNT(*) as count FROM Salas', (err, row) => {
    if (!err && row && row.count === 0) {
      db.run("INSERT INTO Salas (nome) VALUES ('Consultório 1')");
      db.run("INSERT INTO Salas (nome) VALUES ('Consultório 2')");
      db.run("INSERT INTO Salas (nome) VALUES ('Sala de Exames A')");
      console.log('Salas semeadas de forma independente.');
    }
  });

  // Verificar se já existem registros para evitar duplicar sementes
  db.get('SELECT COUNT(*) as count FROM Convenios', (err, row) => {
    if (err) {
      console.error('Erro ao verificar dados existentes:', err);
      return;
    }

    if (row.count === 0) {
      console.log('Banco de dados vazio. Iniciando semeadura de dados sequencial...');
      seedDataSequential();
    } else {
      console.log('Banco de dados já contém registros. Pulando semeadura.');
    }
  });
});

async function seedDataSequential() {
  try {
    // 0. Inserir Salas
    await dbRun("INSERT INTO Salas (nome) VALUES ('Consultório 1')");
    await dbRun("INSERT INTO Salas (nome) VALUES ('Consultório 2')");
    await dbRun("INSERT INTO Salas (nome) VALUES ('Sala de Exames A')");
    console.log('Salas semeadas.');

    // 1. Inserir Convenios
    const convenios = [
      ['Unimed Nacional', 1],
      ['Amil Fácil', 1],
      ['Bradesco Saúde Premium', 1],
      ['SulAmérica Exclusivo', 0]
    ];
    for (const c of convenios) {
      await dbRun('INSERT INTO Convenios (nome_plano, status_ativo) VALUES (?, ?)', c);
    }
    console.log('Convenios semeados.');

    // 2. Inserir Medicos
    const medicos = [
      ['Dr. Carlos Silva', 'CRM-SP 123456', 'Cardiologia', 'Hipertensão, Arritmia, Insuficiência Cardíaca, Infarto'],
      ['Dra. Beatriz Santos', 'CRM-SP 234567', 'Pediatria', 'Asma Infantil, Bronquite, Dermatite, Crescimento'],
      ['Dr. André Marques', 'CRM-SP 345678', 'Ortopedia', 'Tendinite, Hérnia de Disco, Fraturas, Artrose'],
      ['Dra. Camila Nogueira', 'CRM-SP 456789', 'Endocrinologia', 'Diabetes Mellitus, Obesidade, Hipotireoidismo, Colesterol']
    ];
    for (const m of medicos) {
      await dbRun('INSERT INTO Medicos (nome, crm, especialidade, patologias_atendidas) VALUES (?, ?, ?, ?)', m);
    }
    console.log('Medicos semeados.');

    // 3. Inserir Pacientes
    const pacientes = [
      ['João Pedro Alves', '123.456.789-00', '5511999998888', '1985-05-15', 1],
      ['Mariana Costa Dias', '234.567.890-11', '5511988887777', '1992-10-22', 2],
      ['Roberto de Oliveira', '345.678.901-22', '5511977776666', '1970-02-08', null],
      ['Juliana M. Vieira', '456.789.012-33', '5511966665555', '1988-12-01', 3]
    ];
    for (const p of pacientes) {
      await dbRun('INSERT INTO Pacientes (nome, cpf, whatsapp, data_nascimento, convenio_id) VALUES (?, ?, ?, ?, ?)', p);
    }
    console.log('Pacientes semeados.');

    // 4. Inserir Disponibilidade
    const hoje = '2026-06-08';
    const amanha = '2026-06-09';
    const depois = '2026-06-10';

    const disponibilidades = [
      [1, hoje, '09:00', 0], // Reservado
      [1, hoje, '10:00', 1],
      [1, hoje, '11:00', 1],
      [1, amanha, '09:00', 1],
      [1, amanha, '10:00', 1],
      [1, depois, '14:00', 1],
      
      [2, hoje, '14:00', 0], // Reservado
      [2, hoje, '15:00', 1],
      [2, amanha, '14:00', 1],
      [2, amanha, '16:00', 1],
      
      [3, hoje, '10:00', 1],
      [3, hoje, '11:00', 0], // Reservado
      [3, amanha, '10:00', 1],
      [3, depois, '11:00', 1],
      
      [4, hoje, '09:00', 1],
      [4, hoje, '14:00', 0], // Reservado
      [4, amanha, '09:00', 1],
      [4, amanha, '15:00', 1]
    ];
    for (const d of disponibilidades) {
      await dbRun('INSERT INTO Disponibilidade (medico_id, data, hora_inicio, status_disponivel) VALUES (?, ?, ?, ?)', d);
    }
    console.log('Disponibilidades semeadas.');

    // 5. Inserir Agendamentos
    const agendamentos = [
      [1, 1, `${hoje} 09:00`, 'consulta', 'convenio', 120.00, 'confirmado'],
      [2, 2, `${hoje} 14:00`, 'consulta', 'convenio', 150.00, 'pendente'],
      [3, 3, `${hoje} 11:00`, 'exame', 'particular', 250.00, 'realizado'],
      [4, 4, `${hoje} 14:00`, 'consulta', 'convenio', 180.00, 'cancelado']
    ];
    for (const a of agendamentos) {
      await dbRun('INSERT INTO Agendamentos (paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado, status_agendamento) VALUES (?, ?, ?, ?, ?, ?, ?)', a);
    }
    console.log('Agendamentos semeados.');

    // 6. Inserir Mensagens de WhatsApp
    const mensagens = [
      [1, '5511999998888', 'Olá *João Pedro Alves*! 🏥\nSeu agendamento de *consulta* (Cardiologia) com *Dr. Carlos Silva* está marcado para o dia *08/06/2026* às *09:00*.\n\nResponda *CONFIRMAR* para confirmar sua presença ou *CANCELAR* para desmarcar.', 'lido', '2026-06-08 07:30:00'],
      [2, '5511988887777', 'Olá *Mariana Costa Dias*! 🏥\nSeu agendamento de *consulta* (Endocrinologia) com *Dra. Camila Nogueira* está marcado para o dia *08/06/2026* às *14:00*.\n\nResponda *CONFIRMAR* para confirmar sua presença ou *CANCELAR* para desmarcar.', 'entregue', '2026-06-08 08:00:00'],
      [3, '5511977776666', 'Olá *Roberto de Oliveira*! 🏥\nSeu agendamento de *exame* (Ortopedia) com *Dr. André Marques* está marcado para o dia *08/06/2026* às *11:00*.', 'lido', '2026-06-07 16:00:00'],
      [4, '5511966665555', 'Olá *Juliana M. Vieira*! Seu agendamento de Endocrinologia com Dra. Camila Nogueira para 2026-06-08 às 14:00 foi CANCELADO conforme solicitado.', 'lido', '2026-06-08 08:15:00']
    ];
    for (const m of mensagens) {
      await dbRun('INSERT INTO WhatsappMensagens (agendamento_id, whatsapp_destino, mensagem, status_envio, data_envio) VALUES (?, ?, ?, ?, ?)', m);
    }
    console.log('Mensagens de WhatsApp semeadas.');
    console.log('Banco de dados semeado com sucesso!');

  } catch (error) {
    console.error('Erro durante a semeadura de dados:', error);
  }
}

module.exports = db;
