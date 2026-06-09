const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Carregar variáveis de ambiente
require('dotenv').config({ path: path.join(__dirname, '../../../../server/.env') });
require('dotenv').config({ path: path.join(__dirname, '../../../server/.env') });
require('dotenv').config({ path: path.join(__dirname, 'server/.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
const connectionString = process.env.DATABASE_URL || 'postgresql://agendawp:149agendaxl9@localhost:5432/agendawp';

console.log('--- SCRIPT DE MIGRAÇÃO DE DADOS ---');
console.log('SQLite origem:', dbPath);
console.log('PostgreSQL destino:', connectionString.replace(/:([^:@]+)@/, ':****@'));

if (!fs.existsSync(dbPath)) {
  console.error('ERRO: Arquivo SQLite não encontrado em:', dbPath);
  process.exit(1);
}

const sqliteDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Erro ao conectar no SQLite:', err.message);
    process.exit(1);
  }
  console.log('Conectado ao SQLite com sucesso.');
});

const pgClient = new Client({
  connectionString,
  ssl: connectionString && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1') && !connectionString.includes('host.docker.internal') ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  try {
    await pgClient.connect();
    console.log('Conectado ao PostgreSQL com sucesso.');

    // 1. Limpar tabelas no PostgreSQL (em ordem reversa das dependências)
    console.log('Limpando tabelas existentes no PostgreSQL...');
    const tablesToClean = [
      'Chamadas',
      'WhatsappMensagens',
      'Agendamentos',
      'Disponibilidade',
      'Pacientes',
      'Medicos',
      'Convenios',
      'Salas',
      'ChatState',
      'Configuracoes'
    ];
    for (const table of tablesToClean) {
      await pgClient.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    console.log('Tabelas limpas com sucesso.');

    // Helper para buscar dados do SQLite
    const sqliteAll = (sql) => new Promise((resolve, reject) => {
      sqliteDb.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Ordem de migração dos dados
    const migrationOrder = [
      {
        name: 'Salas',
        query: 'SELECT * FROM Salas',
        pgInsert: 'INSERT INTO Salas (id, nome) VALUES ($1, $2)',
        mapFn: r => [r.id, r.nome]
      },
      {
        name: 'Convenios',
        query: 'SELECT * FROM Convenios',
        pgInsert: 'INSERT INTO Convenios (id, nome_plano, status_ativo) VALUES ($1, $2, $3)',
        mapFn: r => [r.id, r.nome_plano, r.status_ativo]
      },
      {
        name: 'Medicos',
        query: 'SELECT * FROM Medicos',
        pgInsert: 'INSERT INTO Medicos (id, nome, crm, especialidade, patologias_atendidas, valor_consulta, sala_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        mapFn: r => [r.id, r.nome, r.crm, r.especialidade, r.patologias_atendidas, r.valor_consulta, r.sala_id]
      },
      {
        name: 'Pacientes',
        query: 'SELECT * FROM Pacientes',
        pgInsert: 'INSERT INTO Pacientes (id, nome, cpf, whatsapp, data_nascimento, convenio_id) VALUES ($1, $2, $3, $4, $5, $6)',
        mapFn: r => [r.id, r.nome, r.cpf, r.whatsapp, r.data_nascimento, r.convenio_id]
      },
      {
        name: 'Disponibilidade',
        query: 'SELECT * FROM Disponibilidade',
        pgInsert: 'INSERT INTO Disponibilidade (id, medico_id, data, hora_inicio, status_disponivel) VALUES ($1, $2, $3, $4, $5)',
        mapFn: r => [r.id, r.medico_id, r.data, r.hora_inicio, r.status_disponivel]
      },
      {
        name: 'Agendamentos',
        query: 'SELECT * FROM Agendamentos',
        pgInsert: 'INSERT INTO Agendamentos (id, paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado, status_agendamento, observacoes, orientacoes_reagendamento) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        mapFn: r => [r.id, r.paciente_id, r.medico_id, r.data_hora, r.tipo_atendimento, r.tipo_pagamento, r.valor_combinado, r.status_agendamento, r.observacoes, r.orientacoes_reagendamento]
      },
      {
        name: 'WhatsappMensagens',
        query: 'SELECT * FROM WhatsappMensagens',
        pgInsert: 'INSERT INTO WhatsappMensagens (id, agendamento_id, whatsapp_destino, mensagem, status_envio, data_envio) VALUES ($1, $2, $3, $4, $5, $6)',
        mapFn: r => [r.id, r.agendamento_id, r.whatsapp_destino, r.mensagem, r.status_envio, r.data_envio]
      },
      {
        name: 'Chamadas',
        query: 'SELECT * FROM Chamadas',
        pgInsert: 'INSERT INTO Chamadas (id, agendamento_id, paciente_nome, medico_nome, sala_nome, data_hora) VALUES ($1, $2, $3, $4, $5, $6)',
        mapFn: r => [r.id, r.agendamento_id, r.paciente_nome, r.medico_nome, r.sala_nome, r.data_hora]
      },
      {
        name: 'ChatState',
        query: 'SELECT * FROM ChatState',
        pgInsert: 'INSERT INTO ChatState (whatsapp, estado, temp_nome, temp_cpf, temp_tipo, temp_pagamento, temp_convenio_id, temp_medico_id, temp_slots_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        mapFn: r => [r.whatsapp, r.estado, r.temp_nome, r.temp_cpf, r.temp_tipo, r.temp_pagamento, r.temp_convenio_id, r.temp_medico_id, r.temp_slots_json]
      },
      {
        name: 'Configuracoes',
        query: 'SELECT * FROM Configuracoes',
        pgInsert: 'INSERT INTO Configuracoes (chave, valor) VALUES ($1, $2)',
        mapFn: r => [r.chave, r.valor]
      }
    ];

    for (const step of migrationOrder) {
      console.log(`Migrando tabela "${step.name}"...`);
      const rows = await sqliteAll(step.query);
      console.log(`- Encontrados ${rows.length} registros no SQLite.`);
      
      for (const row of rows) {
        const params = step.mapFn(row);
        await pgClient.query(step.pgInsert, params);
      }
      console.log(`- Inseridos ${rows.length} registros no PostgreSQL.`);
    }

    // 2. Ajustar as sequências SERIAL no PostgreSQL para as tabelas que possuem id numérico auto-incremento
    console.log('Ajustando sequências SERIAL no PostgreSQL...');
    const tablesWithSerial = [
      'Salas',
      'Convenios',
      'Medicos',
      'Pacientes',
      'Disponibilidade',
      'Agendamentos',
      'WhatsappMensagens',
      'Chamadas'
    ];

    for (const table of tablesWithSerial) {
      const seqName = `${table.toLowerCase()}_id_seq`;
      // Definir o próximo valor da sequência baseado no maior ID inserido
      await pgClient.query(`
        SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)
      `);
      console.log(`- Sequência "${seqName}" atualizada.`);
    }

    console.log('MIGRAÇÃO CONCLUÍDA COM SUCESSO!');

  } catch (error) {
    console.error('Erro catastrófico durante a migração:', error);
  } finally {
    sqliteDb.close();
    await pgClient.end();
    console.log('Conexões fechadas.');
  }
}

runMigration();
