const express = require('express');
const cors = require('cors');
const path = require('path');

// Carregar variáveis de ambiente
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });  

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// No PostgreSQL, chaves estrangeiras já funcionam por padrão.
// Mantemos o middleware de compatibilidade para evitar falhas de fluxo.
app.use((req, res, next) => {
  next();
});

// Helper function to run DB queries with Promises
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) {
    if (err) reject(err);
    else resolve({ id: this.lastID, changes: this.changes });
  });
});

// Disparar Webhook N8N de forma assíncrona e segura
const triggerN8NWebhook = async (type, payload) => {
  try {
    const key = type === 'mensagens' ? 'url_n8n_mensagens' : 'url_n8n_alertas';
    const configRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = ?", [key]);
    const url = configRow ? configRow.valor : '';
    
    if (url && url.startsWith('http')) {
      // Buscar a instancia configurada
      const instRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'whatsapp_instancia'");
      const instancia = instRow ? instRow.valor : 'instancia_principal';
      
      const payloadWithInstance = {
        ...payload,
        instancia
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadWithInstance)
      });
      console.log(`N8N webhook (${type}) disparado. Status: ${response.status}`);
    }
  } catch (error) {
    console.error(`Erro ao disparar webhook N8N (${type}):`, error.message);
  }
};

// Salvar mensagem no banco e notificar N8N
const saveMessageAndNotifyN8N = async (agendamento_id, whatsapp_destino, mensagem, status_envio, data_envio) => {
  const result = await dbRun(
    "INSERT INTO WhatsappMensagens (agendamento_id, whatsapp_destino, mensagem, status_envio, data_envio) VALUES (?, ?, ?, ?, ?)",
    [agendamento_id, whatsapp_destino, mensagem, status_envio, data_envio]
  );
  
  // Classificar evento
  const isAlert = status_envio === 'entregue' && mensagem.includes('Lembramos que seu agendamento');
  const eventType = isAlert ? 'alertas' : 'mensagens';
  
  // Apenas notificar o N8N via webhook para mensagens que precisam ser ativamente enviadas por ele.
  // Mensagens recebidas do paciente ('recebida') ou respostas automáticas de IA do bot ('lido')
  // já estão no fluxo direto de entrada ou de resposta síncrona do próprio N8N, então não devem disparar webhook de saída.
  if (status_envio === 'enviado' || status_envio === 'entregue') {
    await triggerN8NWebhook(eventType, {
      id: result.id,
      agendamento_id,
      whatsapp: whatsapp_destino,
      mensagem,
      status: status_envio,
      data_envio,
      timestamp: Date.now()
    });
  }
  
  return result;
};

// Obter a data e hora atual ajustada para o fuso horário de Brasília (GMT-3)
const getBrazilTime = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(now);
  const day = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  const year = parts.find(p => p.type === 'year').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;
  const second = parts.find(p => p.type === 'second').value;
  
  return {
    dateStr: `${year}-${month}-${day}`, // YYYY-MM-DD
    timeStr: `${hour}:${minute}:${second}`, // HH:MM:SS
    fullDate: new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`)
  };
};

// ==========================================
// 1. DASHBOARD STATS
// ==========================================
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Total de agendamentos hoje
    const totalHoje = await dbGet(
      "SELECT COUNT(*) as count FROM Agendamentos WHERE data_hora LIKE ?",
      [`${hoje}%`]
    );

    // Agendamentos pendentes hoje
    const pendentesHoje = await dbGet(
      "SELECT COUNT(*) as count FROM Agendamentos WHERE data_hora LIKE ? AND status_agendamento = 'pendente'",
      [`${hoje}%`]
    );

    // Total de médicos cadastrados
    const totalMedicos = await dbGet("SELECT COUNT(*) as count FROM Medicos");

    // Taxa de entrega do WhatsApp
    const whatsappStats = await dbGet(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status_envio IN ('entregue', 'lido') THEN 1 ELSE 0 END) as entregues,
        SUM(CASE WHEN status_envio = 'lido' THEN 1 ELSE 0 END) as lidos
      FROM WhatsappMensagens
    `);

    // Faturamento e breakdowns de hoje (Particular vs Convênio)
    const financeiroHoje = await dbAll(`
      SELECT 
        tipo_pagamento, 
        COUNT(*) as count, 
        SUM(valor_combinado) as total
      FROM Agendamentos 
      WHERE data_hora LIKE ? AND status_agendamento NOT IN ('cancelado', 'reagendado')
      GROUP BY tipo_pagamento
    `, [`${hoje}%`]);

    const receitaParticular = financeiroHoje
      .filter(f => f.tipo_pagamento !== 'convenio')
      .reduce((acc, f) => acc + (f.total || 0), 0);

    const consultasConvenio = financeiroHoje
      .filter(f => f.tipo_pagamento === 'convenio')
      .reduce((acc, f) => acc + (f.count || 0), 0);

    const consultasParticular = financeiroHoje
      .filter(f => f.tipo_pagamento !== 'convenio')
      .reduce((acc, f) => acc + (f.count || 0), 0);

    // Linha do tempo dos próximos 5 agendamentos
    const proximosAgendamentos = await dbAll(`
      SELECT a.*, p.nome as paciente_nome, p.whatsapp as paciente_whatsapp, m.nome as medico_nome, m.especialidade
      FROM Agendamentos a
      JOIN Pacientes p ON a.paciente_id = p.id
      JOIN Medicos m ON a.medico_id = m.id
      ORDER BY a.data_hora ASC
      LIMIT 5
    `);

    res.json({
      stats: {
        agendamentosHoje: totalHoje.count || 0,
        pendentesHoje: pendentesHoje.count || 0,
        medicosAtivos: totalMedicos.count || 0,
        whatsappDelivery: whatsappStats.total > 0 ? Math.round((whatsappStats.entregues / whatsappStats.total) * 100) : 100,
        whatsappRead: whatsappStats.total > 0 ? Math.round((whatsappStats.lidos / whatsappStats.total) * 100) : 100,
        faturamentoHoje: receitaParticular,
        consultasConvenio,
        consultasParticular,
        financeiroBreakdown: financeiroHoje
      },
      proximosAgendamentos
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas do dashboard' });
  }
});

// ==========================================
// 2. CONVENIOS API
// ==========================================
app.get('/api/convenios', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM Convenios ORDER BY nome_plano ASC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/convenios', async (req, res) => {
  const { nome_plano, status_ativo } = req.body;
  if (!nome_plano) return res.status(400).json({ error: 'Nome do plano é obrigatório' });
  
  try {
    const activeVal = status_ativo === undefined ? 1 : status_ativo;
    const result = await dbRun(
      "INSERT INTO Convenios (nome_plano, status_ativo) VALUES (?, ?)",
      [nome_plano, activeVal]
    );
    res.status(201).json({ id: result.id, nome_plano, status_ativo: activeVal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/convenios/:id', async (req, res) => {
  const { nome_plano, status_ativo } = req.body;
  try {
    await dbRun(
      "UPDATE Convenios SET nome_plano = ?, status_ativo = ? WHERE id = ?",
      [nome_plano, status_ativo, req.params.id]
    );
    res.json({ id: req.params.id, nome_plano, status_ativo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/convenios/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM Convenios WHERE id = ?", [req.params.id]);
    res.json({ message: 'Convênio excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Não é possível excluir este convênio (pode estar associado a um paciente).' });
  }
});

// ==========================================
// 3. PACIENTES API
// ==========================================
app.get('/api/pacientes', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT p.*, c.nome_plano as convenio_nome 
      FROM Pacientes p
      LEFT JOIN Convenios c ON p.convenio_id = c.id
      ORDER BY p.nome ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/pacientes', async (req, res) => {
  const { nome, cpf, whatsapp, data_nascimento, convenio_id } = req.body;
  if (!nome || !cpf || !whatsapp || !data_nascimento) {
    return res.status(400).json({ error: 'Nome, CPF, WhatsApp e Data de Nascimento são obrigatórios' });
  }
  try {
    const result = await dbRun(
      "INSERT INTO Pacientes (nome, cpf, whatsapp, data_nascimento, convenio_id) VALUES (?, ?, ?, ?, ?)",
      [nome, cpf, whatsapp, data_nascimento, convenio_id || null]
    );
    res.status(201).json({ id: result.id, nome, cpf, whatsapp, data_nascimento, convenio_id });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: Pacientes.cpf') || 
        (error.code === '23505' && error.message.includes('cpf'))) {
      res.status(400).json({ error: 'Já existe um paciente cadastrado com este CPF.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/pacientes/:id', async (req, res) => {
  const { nome, cpf, whatsapp, data_nascimento, convenio_id } = req.body;
  try {
    await dbRun(
      "UPDATE Pacientes SET nome = ?, cpf = ?, whatsapp = ?, data_nascimento = ?, convenio_id = ? WHERE id = ?",
      [nome, cpf, whatsapp, data_nascimento, convenio_id || null, req.params.id]
    );
    res.json({ id: req.params.id, nome, cpf, whatsapp, data_nascimento, convenio_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/pacientes/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM Pacientes WHERE id = ?", [req.params.id]);
    res.json({ message: 'Paciente excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Não é possível excluir este paciente (pode estar associado a agendamentos).' });
  }
});

// ==========================================
// 4. MEDICOS API
// ==========================================
app.get('/api/medicos', async (req, res) => {
  try {
    const brTime = getBrazilTime();
    const rows = await dbAll(`
      SELECT 
        m.*,
        COALESCE(SUM(CASE WHEN d.status_disponivel = 1 AND d.data >= ? THEN 1 ELSE 0 END), 0) as slots_futuros
      FROM Medicos m
      LEFT JOIN Disponibilidade d ON m.id = d.medico_id
      GROUP BY m.id
      ORDER BY m.nome ASC
    `, [brTime.dateStr]);
    
    const formatted = rows.map(r => ({
      ...r,
      slots_futuros: parseInt(r.slots_futuros || 0, 10)
    }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/medicos', async (req, res) => {
  const { nome, crm, especialidade, patologias_atendidas, valor_consulta } = req.body;
  if (!nome || !crm || !especialidade) {
    return res.status(400).json({ error: 'Nome, CRM e Especialidade são obrigatórios' });
  }
  const valor = valor_consulta !== undefined && valor_consulta !== null ? parseFloat(valor_consulta) : 150.00;
  try {
    const result = await dbRun(
      "INSERT INTO Medicos (nome, crm, especialidade, patologias_atendidas, valor_consulta) VALUES (?, ?, ?, ?, ?)",
      [nome, crm, especialidade, patologias_atendidas || '', valor]
    );
    res.status(201).json({ id: result.id, nome, crm, especialidade, patologias_atendidas, valor_consulta: valor });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: Medicos.crm') || 
        (error.code === '23505' && error.message.includes('crm'))) {
      res.status(400).json({ error: 'Já existe um médico cadastrado com este CRM.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/medicos/:id', async (req, res) => {
  const { nome, crm, especialidade, patologias_atendidas, valor_consulta } = req.body;
  const valor = valor_consulta !== undefined && valor_consulta !== null ? parseFloat(valor_consulta) : 150.00;
  try {
    await dbRun(
      "UPDATE Medicos SET nome = ?, crm = ?, especialidade = ?, patologias_atendidas = ?, valor_consulta = ? WHERE id = ?",
      [nome, crm, especialidade, patologias_atendidas, valor, req.params.id]
    );
    res.json({ id: req.params.id, nome, crm, especialidade, patologias_atendidas, valor_consulta: valor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/medicos/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM Medicos WHERE id = ?", [req.params.id]);
    res.json({ message: 'Médico excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Não é possível excluir este médico (pode estar associado a agendamentos ou disponibilidades).' });
  }
});

// ==========================================
// 5. DISPONIBILIDADE API
// ==========================================
app.get('/api/disponibilidade', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT d.*, m.nome as medico_nome, m.especialidade
      FROM Disponibilidade d
      JOIN Medicos m ON d.medico_id = m.id
      ORDER BY d.data ASC, d.hora_inicio ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar slots disponíveis de um médico específico em uma data
app.get('/api/disponibilidade/filtrar', async (req, res) => {
  const { medico_id, data } = req.query;
  if (!medico_id || !data) {
    return res.status(400).json({ error: 'Médico e Data são obrigatórios para filtragem' });
  }
  try {
    const rows = await dbAll(
      "SELECT * FROM Disponibilidade WHERE medico_id = ? AND data = ? AND status_disponivel = 1 ORDER BY hora_inicio ASC",
      [medico_id, data]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/disponibilidade', async (req, res) => {
  const { medico_id, data, hora_inicio } = req.body;
  if (!medico_id || !data || !hora_inicio) {
    return res.status(400).json({ error: 'Médico, Data e Hora de início são obrigatórios' });
  }
  try {
    // Evitar duplicados
    const exist = await dbGet(
      "SELECT id FROM Disponibilidade WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
      [medico_id, data, hora_inicio]
    );
    if (exist) {
      return res.status(400).json({ error: 'Este médico já possui este horário de disponibilidade configurado.' });
    }

    const result = await dbRun(
      "INSERT INTO Disponibilidade (medico_id, data, hora_inicio, status_disponivel) VALUES (?, ?, ?, 1)",
      [medico_id, data, hora_inicio]
    );
    res.status(201).json({ id: result.id, medico_id, data, hora_inicio, status_disponivel: 1 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cadastrar disponibilidade em lote (datas e horas)
app.post('/api/disponibilidade/lote', async (req, res) => {
  const { medico_id, datas, horas } = req.body;
  if (!medico_id || !datas || !horas || !Array.isArray(datas) || !Array.isArray(horas)) {
    return res.status(400).json({ error: 'Médico, lista de datas e lista de horas são obrigatórios' });
  }

  try {
    const inserted = [];
    const duplicated = [];

    for (const d of datas) {
      for (const h of horas) {
        // Verificar se já existe
        const exist = await dbGet(
          "SELECT id FROM Disponibilidade WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
          [medico_id, d, h]
        );
        if (exist) {
          duplicated.push({ data: d, hora: h });
        } else {
          const result = await dbRun(
            "INSERT INTO Disponibilidade (medico_id, data, hora_inicio, status_disponivel) VALUES (?, ?, ?, 1)",
            [medico_id, d, h]
          );
          inserted.push({ id: result.id, data: d, hora: h });
        }
      }
    }

    res.status(201).json({ success: true, count: inserted.length, inserted, duplicated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/disponibilidade/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM Disponibilidade WHERE id = ?", [req.params.id]);
    res.json({ message: 'Horário excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. AGENDAMENTOS API (Integrated with simulated WhatsApp triggers)
// ==========================================
app.get('/api/agendamentos', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT a.*, p.nome as paciente_nome, p.whatsapp as paciente_whatsapp, m.nome as medico_nome, m.especialidade
      FROM Agendamentos a
      JOIN Pacientes p ON a.paciente_id = p.id
      JOIN Medicos m ON a.medico_id = m.id
      ORDER BY a.data_hora DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agendamentos', async (req, res) => {
  const { paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado } = req.body;
  if (!paciente_id || !medico_id || !data_hora || !tipo_atendimento || !tipo_pagamento) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
  }

  // data_hora vem no formato YYYY-MM-DD HH:MM
  const parts = data_hora.split(' ');
  const data = parts[0];
  const hora = parts[1];

  try {
    // 1. Verificar se o horário do médico está livre
    const disp = await dbGet(
      "SELECT id, status_disponivel FROM Disponibilidade WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
      [medico_id, data, hora]
    );

    if (!disp) {
      return res.status(400).json({ error: 'Horário não configurado na disponibilidade do médico.' });
    }
    if (disp.status_disponivel === 0) {
      return res.status(400).json({ error: 'O horário selecionado já está ocupado.' });
    }

    // 2. Inserir o agendamento
    const valor = valor_combinado || 0;
    const result = await dbRun(
      "INSERT INTO Agendamentos (paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado, status_agendamento) VALUES (?, ?, ?, ?, ?, ?, 'pendente')",
      [paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor]
    );

    const agendamentoId = result.id;

    // 3. Atualizar disponibilidade do médico para ocupada (status_disponivel = 0)
    await dbRun(
      "UPDATE Disponibilidade SET status_disponivel = 0 WHERE id = ?",
      [disp.id]
    );

    // 4. Buscar informações completas para montar a mensagem do WhatsApp
    const paciente = await dbGet("SELECT nome, whatsapp FROM Pacientes WHERE id = ?", [paciente_id]);
    const medico = await dbGet("SELECT nome, especialidade FROM Medicos WHERE id = ?", [medico_id]);

    const formattedDate = data.split('-').reverse().join('/'); // DD/MM/YYYY
    const msgTemplate = `Olá *${paciente.nome}*! 🏥
Seu agendamento de *${tipo_atendimento}* (${medico.especialidade}) com *${medico.nome}* está marcado para o dia *${formattedDate}* às *${hora}*.

Responda *CONFIRMAR* para confirmar sua presença ou *CANCELAR* para desmarcar.`;

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // 5. Salvar mensagem no WhatsApp simulated log
    // Começa como 'enviado', e mudaremos para 'entregue' e 'lido' após alguns segundos de simulação
    const msgResult = await saveMessageAndNotifyN8N(
      agendamentoId, paciente.whatsapp, msgTemplate, 'enviado', nowStr
    );

    // Simular que o WhatsApp foi entregue após 2 segundos e lido após 4 segundos
    const msgId = msgResult.id;
    setTimeout(() => {
      db.run("UPDATE WhatsappMensagens SET status_envio = 'entregue' WHERE id = ?", [msgId]);
    }, 2000);

    setTimeout(() => {
      db.run("UPDATE WhatsappMensagens SET status_envio = 'lido' WHERE id = ?", [msgId]);
    }, 4500);

    res.status(201).json({
      id: agendamentoId,
      paciente_id,
      medico_id,
      data_hora,
      tipo_atendimento,
      tipo_pagamento,
      valor_combinado: valor,
      status_agendamento: 'pendente'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Alteração direta do status do agendamento (Confirmado, Realizado, Cancelado)
app.put('/api/agendamentos/:id/status', async (req, res) => {
  const { status } = req.body;
  const agendamentoId = req.params.id;
  if (!status) return res.status(400).json({ error: 'Status é obrigatório' });

  try {
    // 1. Buscar o agendamento atual
    const agendamento = await dbGet("SELECT * FROM Agendamentos WHERE id = ?", [agendamentoId]);
    if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado' });

    // 2. Atualizar o status do agendamento
    await dbRun(
      "UPDATE Agendamentos SET status_agendamento = ? WHERE id = ?",
      [status, agendamentoId]
    );

    // 3. Se for cancelado ou reagendado, devemos liberar o slot de disponibilidade novamente!
    if (status === 'cancelado' || status === 'reagendado') {
      const parts = agendamento.data_hora.split(' ');
      const data = parts[0];
      const hora = parts[1];

      await dbRun(
        "UPDATE Disponibilidade SET status_disponivel = 1 WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
        [agendamento.medico_id, data, hora]
      );
    } 
    // Se voltar de cancelado ou reagendado para outro status ativo (confirmado/pendente/realizado), reservamos novamente
    else if ((agendamento.status_agendamento === 'cancelado' || agendamento.status_agendamento === 'reagendado') && status !== 'cancelado' && status !== 'reagendado') {
      const parts = agendamento.data_hora.split(' ');
      const data = parts[0];
      const hora = parts[1];

      await dbRun(
        "UPDATE Disponibilidade SET status_disponivel = 0 WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
        [agendamento.medico_id, data, hora]
      );
    }

    // 4. Enviar mensagem de aviso de WhatsApp sobre a alteração
    const paciente = await dbGet("SELECT nome, whatsapp FROM Pacientes WHERE id = ?", [agendamento.paciente_id]);
    const medico = await dbGet("SELECT nome FROM Medicos WHERE id = ?", [agendamento.medico_id]);
    
    let notifyMsg = '';
    if (status === 'confirmado') {
      notifyMsg = `Olá *${paciente.nome}*! 🏥 Confirmamos sua consulta/exame com *${medico.nome}* em nosso sistema. Nos vemos em breve!`;
    } else if (status === 'cancelado') {
      notifyMsg = `Olá *${paciente.nome}*. Seu agendamento com *${medico.nome}* foi cancelado em nosso sistema. Caso tenha sido um engano, favor entrar em contato.`;
    }

    if (notifyMsg) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await saveMessageAndNotifyN8N(
        agendamentoId, paciente.whatsapp, notifyMsg, 'enviado', nowStr
      );
    }

    res.json({ id: agendamentoId, status_agendamento: status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/agendamentos/:id', async (req, res) => {
  const agendamentoId = req.params.id;
  try {
    const agendamento = await dbGet("SELECT * FROM Agendamentos WHERE id = ?", [agendamentoId]);
    if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado' });

    // Liberar a disponibilidade do médico associado
    const parts = agendamento.data_hora.split(' ');
    const data = parts[0];
    const hora = parts[1];
    
    await dbRun(
      "UPDATE Disponibilidade SET status_disponivel = 1 WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
      [agendamento.medico_id, data, hora]
    );

    // Deletar o agendamento
    await dbRun("DELETE FROM Agendamentos WHERE id = ?", [agendamentoId]);
    res.json({ message: 'Agendamento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 7. SIMULATED WHATSAPP PANEL API
// ==========================================
// Buscar todas as mensagens agrupadas por número de whatsapp
app.get('/api/whatsapp/chats', async (req, res) => {
  try {
    const chats = await dbAll(`
      SELECT 
        w.whatsapp_destino as numero, 
        COALESCE(p.nome, 'Novo Lead (' || w.whatsapp_destino || ')') as paciente_nome,
        p.id as paciente_id,
        MAX(w.data_envio) as ultima_data,
        (SELECT mensagem FROM WhatsappMensagens WHERE whatsapp_destino = w.whatsapp_destino ORDER BY data_envio DESC LIMIT 1) as ultima_mensagem
      FROM WhatsappMensagens w
      LEFT JOIN Pacientes p ON w.whatsapp_destino = p.whatsapp
      GROUP BY w.whatsapp_destino, p.nome, p.id
      ORDER BY ultima_data DESC
    `);
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar conversa completa de um número de WhatsApp específico
app.get('/api/whatsapp/chat/:numero', async (req, res) => {
  try {
    const messages = await dbAll(
      "SELECT * FROM WhatsappMensagens WHERE whatsapp_destino = ? ORDER BY data_envio ASC",
      [req.params.numero]
    );
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Limpar todas as conversas do whatsapp e resetar chatbot
app.post('/api/whatsapp/clear', async (req, res) => {
  try {
    await dbRun("DELETE FROM WhatsappMensagens");
    await dbRun("DELETE FROM ChatState");
    res.json({ success: true, message: 'Histórico de conversas e chatbot limpos com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helpers para controle de estado do Chatbot
const getChatState = (whatsapp) => dbGet("SELECT * FROM ChatState WHERE whatsapp = ?", [whatsapp]);
const setChatState = (whatsapp, state, data = {}) => {
  const { nome = null, cpf = null, tipo = null, pagamento = null, convenio_id = null, medico_id = null, slots_json = null } = data;
  return dbRun(
    `INSERT OR REPLACE INTO ChatState 
     (whatsapp, estado, temp_nome, temp_cpf, temp_tipo, temp_pagamento, temp_convenio_id, temp_medico_id, temp_slots_json) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [whatsapp, state, nome, cpf, tipo, pagamento, convenio_id, medico_id, slots_json]
  );
};
const deleteChatState = (whatsapp) => dbRun("DELETE FROM ChatState WHERE whatsapp = ?", [whatsapp]);

// Lista de saudações comuns para triagem e humanização
const GREETINGS = [
  'BOM DIA', 'BOA TARDE', 'BOA NOITE', 'OLA', 'OLÁ', 'OI', 'OIE', 'HELLO', 'HI', 'COMO VAI', 'TUDO BEM',
  'TUDO JOIA', 'TUDO BOM', 'COMO ESTA', 'COMO ESTÁ'
];

// Limpar saudações e termos comuns do input de nome para evitar cadastro inválido
const cleanNameInput = (text) => {
  let name = text.trim();
  // Remover saudações no início (ex: "Olá Carlos", "Bom dia Carlos")
  const greetingsRegex = /^(bom dia|boa tarde|boa noite|ola|olá|oi|oie|hello|hi)[,\s!.]*/i;
  name = name.replace(greetingsRegex, '');
  
  // Remover expressões introdutórias comuns (ex: "meu nome é Carlos", "me chamo Carlos")
  const introsRegex = /^(meu nome é|meu nome e|me chamo|sou o|sou a|aqui é|aqui e)[,\s]*/i;
  name = name.replace(introsRegex, '');
  
  return name.trim();
};

// Validar se o nome limpo parece um nome completo e válido
const validateName = (cleanedName) => {
  if (!cleanedName) return { valid: false, reason: 'greeting_only' };
  
  // Verificar se possui números
  if (/\d/.test(cleanedName)) {
    return { valid: false, reason: 'has_numbers' };
  }
  
  // Verificar se possui símbolos especiais não comuns em nomes
  if (/[#@!$%^&*()_+={}\[\]:;\"'<>?~|\\\/]/.test(cleanedName)) {
    return { valid: false, reason: 'has_symbols' };
  }

  const words = cleanedName.split(/\s+/).filter(w => w.length > 0);
  
  // Se for exatamente uma das saudações comuns (caso o regex de limpeza falhe)
  if (words.length === 1 && GREETINGS.includes(words[0].toUpperCase())) {
    return { valid: false, reason: 'greeting_only' };
  }
  
  // Exigir pelo menos 2 palavras para ser considerado Nome Completo
  if (words.length < 2) {
    return { valid: false, reason: 'single_word' };
  }
  
  return { valid: true };
};

// Função auxiliar para limpar blocos de código markdown que a IA possa retornar
const cleanJsonString = (str) => {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
};

// Processar resposta do paciente via IA do Google Gemini com histórico e contexto dinâmico
const processGeminiChatbot = async (whatsapp, respostaText, paciente, chatState, apiKey, model, systemInstruction, clinicaName) => {
  try {
    // 1. Obter Médicos Ativos
    const medicos = await dbAll("SELECT id, nome, especialidade, patologias_atendidas, valor_consulta FROM Medicos");

    // 2. Obter Convênios Ativos
    const convenios = await dbAll("SELECT id, nome_plano FROM Convenios WHERE status_ativo = 1");

    // 3. Obter slots disponíveis futuros (próximos 30 dias)
    const brTime = getBrazilTime();
    const dbSlots = await dbAll(
      "SELECT d.id, d.data, d.hora_inicio, m.nome as medico_nome, m.especialidade FROM Disponibilidade d JOIN Medicos m ON d.medico_id = m.id WHERE d.data >= ? AND d.status_disponivel = 1 ORDER BY d.data ASC, d.hora_inicio ASC LIMIT 50",
      [brTime.dateStr]
    );

    // Filtrar horários com pelo menos 1 hora de antecedência em relação ao momento atual do Brasil
    const slotsDisponiveis = dbSlots.filter(slot => {
      const slotDate = new Date(`${slot.data}T${slot.hora_inicio}:00`);
      const diffMs = slotDate.getTime() - brTime.fullDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      return diffHours >= 1.0;
    });

    // 4. Buscar histórico de conversas do paciente (últimas 10 mensagens)
    const historyRows = await dbAll(
      "SELECT mensagem, status_envio FROM WhatsappMensagens WHERE whatsapp_destino = ? ORDER BY id DESC LIMIT 10",
      [whatsapp]
    );
    
    // Agrupar mensagens consecutivas com a mesma role para evitar erro 400 Bad Request da API do Gemini
    const chatHistory = [];
    historyRows.reverse().forEach(row => {
      const role = row.status_envio === 'recebida' ? 'user' : 'model';
      
      if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === role) {
        chatHistory[chatHistory.length - 1].parts[0].text += "\n" + row.mensagem;
      } else {
        chatHistory.push({
          role: role,
          parts: [{ text: row.mensagem }]
        });
      }
    });

    // Garantir que a lista termine com uma mensagem de 'user'
    if (chatHistory.length === 0) {
      chatHistory.push({
        role: 'user',
        parts: [{ text: respostaText }]
      });
    } else if (chatHistory[chatHistory.length - 1].role !== 'user') {
      chatHistory.push({
        role: 'user',
        parts: [{ text: respostaText }]
      });
    }

    // 5. Montar estado atual mesclando o banco e o ChatState
    const stateData = {
      nome: paciente ? paciente.nome : (chatState ? chatState.temp_nome : null),
      cpf: paciente ? paciente.cpf : (chatState ? chatState.temp_cpf : null),
      data_nascimento: paciente ? paciente.data_nascimento : (chatState ? chatState.temp_slots_json : null), // temp_slots_json armazena birthDate temporariamente para novos cadastros
      tipo_atendimento: chatState ? chatState.temp_tipo : null,
      tipo_pagamento: chatState ? chatState.temp_pagamento : null,
      convenio_id: chatState ? chatState.temp_convenio_id : null,
      medico_id: chatState ? chatState.temp_medico_id : null,
    };

    // Obter nome do convênio associado ao convenio_id se existir
    let convenioNome = null;
    if (stateData.convenio_id) {
      const conv = convenios.find(c => c.id === stateData.convenio_id);
      if (conv) convenioNome = conv.nome_plano;
    }

    // Obter nome do médico associado ao medico_id se existir
    let medicoNome = null;
    if (stateData.medico_id) {
      const med = medicos.find(m => m.id === stateData.medico_id);
      if (med) medicoNome = med.nome;
    }

    // 6. Criar instruções contextuais detalhadas para a IA
    let customSystemInstruction = systemInstruction.replace(/{clinica}/g, clinicaName);

    // Adicionar dados técnicos do sistema ao prompt do sistema para guiar a IA
    const contextualInstruction = `${customSystemInstruction}

---
CONTEXTO E DADOS DO SISTEMA EM TEMPO REAL:
1. Data/Hora Atual no Brasil (Brasília): ${brTime.dateStr} às ${brTime.timeStr} (Horário de Brasília). Use isto para saber o que significa "hoje", "amanhã", "esta semana", etc.
2. Nome da Clínica: ${clinicaName}
3. Paciente Já Cadastrado: ${paciente ? "SIM" : "NÃO"}
4. Dados Coletados Atuais da Sessão:
   - Nome do Paciente: ${stateData.nome || "(Ainda não coletado/não cadastrado)"}
   - CPF do Paciente: ${stateData.cpf || "(Ainda não coletado/não cadastrado)"}
   - Data de Nascimento: ${stateData.data_nascimento || "(Ainda não coletado/não cadastrado)"}
   - Tipo de Atendimento: ${stateData.tipo_atendimento || "(Não definido)"}
   - Forma de Pagamento: ${stateData.tipo_pagamento || "(Não definida)"}
   - Convênio Selecionado: ${convenioNome || "(Nenhum)"}
   - Médico Selecionado: ${medicoNome || "(Nenhum)"}

5. Lista de Convênios Médicos Aceitos e seus IDs (Caso o paciente mencione um plano, você DEVE extrair o ID exato dele na resposta JSON):
${JSON.stringify(convenios.map(c => ({ id: c.id, nome: c.nome_plano })))}

6. Lista de Médicos Ativos, Especialidades, Patologias que tratam, Valor de Consulta Particular e seus IDs (Se o paciente indicar interesse ou sintomas relacionados, você DEVE sugerir o médico correspondente e extrair o ID dele no JSON):
${JSON.stringify(medicos.map(m => ({ id: m.id, nome: m.nome, especialidade: m.especialidade, trata: m.patologias_atendidas || 'Clínica Geral', valor_consulta: m.valor_consulta })))}

7. Lista de Horários/Slots Livres Disponíveis e seus IDs (Selecione somente os horários correspondentes ao médico que o paciente escolheu. Mostre apenas as datas e horários correspondentes ao médico de interesse na conversa. Você DEVE extrair o slot_id correto no JSON quando o paciente confirmar qual horário prefere):
${JSON.stringify(slotsDisponiveis.map(s => ({ id: s.id, data: s.data.split('-').reverse().join('/'), hora: s.hora_inicio, medico_id: s.medico_id, medico_nome: s.medico_nome })))}

INSTRUÇÕES DO SCHEMA DE RESPOSTA JSON:
Você DEVE retornar a resposta EXATAMENTE no formato JSON com as seguintes propriedades:
- "respostaTextBot": O texto em linguagem natural simpático e humanizado que será enviado ao WhatsApp do paciente.
- "solicitaIntervencaoHumana": Defina como true se o usuário pedir explicitamente para falar com um atendente humano, se expressar raiva/insatisfação extrema, ou se o assunto estiver fora do escopo de agendamentos.
- "dadosExtraidos": Objeto contendo os dados identificados na conversa atual. Se não foram identificados ou não se aplicam, defina-os como null ou omita.
  - "nome": Nome completo extraído se o paciente o informar agora ou se já estiver cadastrado.
  - "cpf": CPF formatado ou limpo se informado agora ou se já cadastrado.
  - "data_nascimento": Data de nascimento formatada como YYYY-MM-DD se informada.
  - "tipo_atendimento": "consulta" ou "exame" se selecionado.
  - "tipo_pagamento": "particular" ou "convenio" se selecionado.
  - "convenio_id": ID numérico correspondente da lista de convênios se o paciente usar plano e o plano for aceito.
  - "medico_id": ID numérico correspondente da lista de médicos se o paciente selecionar o médico ou especialidade.
  - "slot_id": ID numérico correspondente do horário escolhido da lista de slots disponíveis, SOMENTE quando o paciente selecionar claramente uma data/hora da lista.
`;

    const payload = {
      contents: chatHistory,
      systemInstruction: {
        parts: [{ text: contextualInstruction }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            respostaTextBot: { type: "STRING" },
            solicitaIntervencaoHumana: { type: "BOOLEAN" },
            dadosExtraidos: {
              type: "OBJECT",
              properties: {
                nome: { type: "STRING" },
                cpf: { type: "STRING" },
                data_nascimento: { type: "STRING" },
                tipo_atendimento: { type: "STRING" },
                tipo_pagamento: { type: "STRING" },
                convenio_id: { type: "INTEGER" },
                medico_id: { type: "INTEGER" },
                slot_id: { type: "INTEGER" }
              }
            }
          },
          required: ["respostaTextBot", "solicitaIntervencaoHumana"]
        }
      }
    };

    // 8. Chamar a API do Gemini via fetch nativo
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Erro na API do Gemini: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    const botJsonResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!botJsonResponseText) {
      throw new Error("Resposta da IA vazia ou malformada.");
    }

    const result = JSON.parse(cleanJsonString(botJsonResponseText));
    
    // Logar dados extraídos
    console.log(`[AI Bot] Resultado do Gemini:`, JSON.stringify(result));

    // 9. Processar o retorno da IA no Banco de Dados
    const dados = result.dadosExtraidos || {};
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (result.solicitaIntervencaoHumana) {
      await setChatState(whatsapp, 'ATENDIMENTO_HUMANO');
      console.log(`[AI Bot] Intervenção humana solicitada para ${whatsapp}.`);
      await saveMessageAndNotifyN8N(null, whatsapp, result.respostaTextBot, 'lido', nowStr);
      return { success: true, botReplied: result.respostaTextBot };
    }

    // Se o paciente ainda não existe no banco
    if (!paciente) {
      // Mesclar dados extraídos atuais com os que já tínhamos no ChatState
      const nomeFinal = dados.nome || (chatState ? chatState.temp_nome : null);
      let cpfFinal = dados.cpf || (chatState ? chatState.temp_cpf : null);
      let birthFinal = dados.data_nascimento || (chatState ? chatState.temp_slots_json : null);

      if (cpfFinal) cpfFinal = cpfFinal.replace(/\D/g, '');
      
      // Se tivermos todos os 3 campos essenciais, cadastramos o paciente no banco!
      if (nomeFinal && cpfFinal && cpfFinal.length === 11 && birthFinal) {
        console.log(`[AI Bot] Todos os dados coletados. Cadastrando paciente: ${nomeFinal}, CPF: ${cpfFinal}`);
        
        // Formatar data de nascimento caso venha no formato brasileiro (DD/MM/AAAA)
        if (birthFinal.includes('/')) {
          const parts = birthFinal.split('/');
          if (parts.length === 3) birthFinal = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        const insertResult = await dbRun(
          "INSERT INTO Pacientes (nome, cpf, whatsapp, data_nascimento, convenio_id) VALUES (?, ?, ?, ?, ?)",
          [nomeFinal, cpfFinal, whatsapp, birthFinal, dados.convenio_id || null]
        );
        paciente = { id: insertResult.id, nome: nomeFinal, whatsapp, cpf: cpfFinal, data_nascimento: birthFinal, convenio_id: dados.convenio_id || null };
        console.log(`[AI Bot] Paciente cadastrado com ID: ${paciente.id}`);
      } else {
        // Se ainda faltam dados para o cadastro, determina o estado correspondente
        let estadoCadastro = 'AWAITING_NAME';
        if (nomeFinal && !cpfFinal) {
          estadoCadastro = 'AWAITING_CPF';
        } else if (nomeFinal && cpfFinal && !birthFinal) {
          estadoCadastro = 'AWAITING_BIRTHDAY';
        }

        await setChatState(whatsapp, estadoCadastro, {
          nome: nomeFinal,
          cpf: cpfFinal,
          tipo: dados.tipo_atendimento || (chatState ? chatState.temp_tipo : null),
          pagamento: dados.tipo_pagamento || (chatState ? chatState.temp_pagamento : null),
          convenio_id: dados.convenio_id || (chatState ? chatState.temp_convenio_id : null),
          medico_id: dados.medico_id || (chatState ? chatState.temp_medico_id : null),
          slots_json: birthFinal
        });
      }
    }

    // Se o paciente existe (ou acabou de ser criado) e escolheu o slot de agendamento!
    if (paciente && dados.slot_id) {
      // Verificar se o slot ainda está disponível
      const slot = await dbGet("SELECT * FROM Disponibilidade WHERE id = ? AND status_disponivel = 1", [dados.slot_id]);
      if (slot) {
        console.log(`[AI Bot] Slot ${dados.slot_id} disponível. Criando agendamento para paciente ID: ${paciente.id}`);
        
        const medico = medicos.find(m => m.id === slot.medico_id);
        const valorConsulta = medico ? (medico.valor_consulta !== null ? medico.valor_consulta : 150.00) : 150.00;
        const tipoPagto = dados.tipo_pagamento || (chatState ? chatState.temp_pagamento : 'particular');
        const valor = tipoPagto === 'convenio' ? 0 : valorConsulta;
        const tipoAtendimento = dados.tipo_atendimento || (chatState ? chatState.temp_tipo : 'consulta');
        
        const dataHoraAgend = `${slot.data} ${slot.hora_inicio}`;

        // Criar o agendamento
        const insertAgend = await dbRun(
          "INSERT INTO Agendamentos (paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado, status_agendamento) VALUES (?, ?, ?, ?, ?, ?, 'solicitado')",
          [paciente.id, slot.medico_id, dataHoraAgend, tipoAtendimento, tipoPagto, valor]
        );

        // Ocupar slot de disponibilidade
        await dbRun("UPDATE Disponibilidade SET status_disponivel = 0 WHERE id = ?", [slot.id]);

        // Limpar o ChatState de triagem
        await deleteChatState(whatsapp);
        console.log(`[AI Bot] Agendamento criado com ID: ${insertAgend.id} e slot ${slot.id} reservado.`);
      } else {
        console.log(`[AI Bot] Slot ${dados.slot_id} já está ocupado. IA precisará sugerir outro.`);
      }
    } else if (paciente) {
      // Determinar o estado mais preciso com base nos dados que ainda faltam
      let proximoEstado = 'AWAITING_SLOT_SELECTION';
      
      const tipoAtend = dados.tipo_atendimento || (chatState ? chatState.temp_tipo : null);
      const tipoPagto = dados.tipo_pagamento || (chatState ? chatState.temp_pagamento : null);
      const convId = dados.convenio_id || (chatState ? chatState.temp_convenio_id : null);
      const medId = dados.medico_id || (chatState ? chatState.temp_medico_id : null);

      if (!tipoAtend) {
        proximoEstado = 'AWAITING_TYPE';
      } else if (!tipoPagto) {
        proximoEstado = 'AWAITING_PAYMENT';
      } else if (tipoPagto === 'convenio' && !convId) {
        proximoEstado = 'AWAITING_CONVENIO';
      } else if (!medId) {
        proximoEstado = 'AWAITING_SPECIALTY';
      }

      // Se já temos o médico, buscar e salvar seus slots futuros para uso em caso de fallback
      let slotsJson = null;
      if (medId) {
        try {
          const dbSlots = await dbAll(
            "SELECT d.id, d.data, d.hora_inicio, m.nome as medico_nome FROM Disponibilidade d JOIN Medicos m ON d.medico_id = m.id WHERE d.medico_id = ? AND d.data >= ? AND d.status_disponivel = 1 ORDER BY d.data ASC, d.hora_inicio ASC LIMIT 5",
            [medId, brTime.dateStr]
          );
          const slotsFiltered = dbSlots.filter(slot => {
            const slotDate = new Date(`${slot.data}T${slot.hora_inicio}:00`);
            const diffMs = slotDate.getTime() - brTime.fullDate.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            return diffHours >= 1.0;
          });
          slotsJson = JSON.stringify(slotsFiltered);
        } catch (e) {
          console.error("Erro ao carregar slots temporários em processGeminiChatbot:", e);
        }
      }

      await setChatState(whatsapp, proximoEstado, {
        tipo: tipoAtend,
        pagamento: tipoPagto,
        convenio_id: convId,
        medico_id: medId,
        slots_json: slotsJson
      });
    }

    // Salvar resposta no histórico e retornar
    await saveMessageAndNotifyN8N(null, whatsapp, result.respostaTextBot, 'lido', nowStr);
    return { success: true, botReplied: result.respostaTextBot };

  } catch (err) {
    console.error(`[AI Bot] Erro geral ao processar com Gemini para ${whatsapp}:`, err);
    try {
      const fs = require('fs');
      const logMsg = `[${new Date().toISOString()}] WhatsApp: ${whatsapp} | Error: ${err.message} | Stack: ${err.stack}\n`;
      fs.appendFileSync(path.join(__dirname, 'gemini_error.log'), logMsg);
    } catch (fsErr) {
      console.error("Erro ao gravar gemini_error.log:", fsErr);
    }
    return { success: false };
  }
};

// Simular uma resposta do paciente via WhatsApp com fluxo de IA Conversacional (Cérebro do Bot)
app.post('/api/whatsapp/sim-reply', async (req, res) => {
  const { whatsapp, respostaText } = req.body;
  console.log(`[Webhook sim-reply] Recebido no backend: whatsapp="${whatsapp}", respostaText="${respostaText}"`);
  
  if (!whatsapp || !respostaText) {
    return res.status(400).json({ error: 'WhatsApp e texto de resposta são obrigatórios' });
  }

  try {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const cleanReply = respostaText.toUpperCase().trim();

    // 1. Inserir a resposta do paciente no histórico
    await saveMessageAndNotifyN8N(null, whatsapp, respostaText, 'recebida', nowStr);

    // 2. Buscar paciente e estado de chat
    let paciente = await dbGet("SELECT * FROM Pacientes WHERE whatsapp = ?", [whatsapp]);
    let chatState = await getChatState(whatsapp);
    
    let responseTextBot = '';
    let targetAgendamentoId = null;

    // Se o paciente já existe ou foi recém cadastrado, podemos checar por respostas do Cron (1 ou 2)
    if (paciente) {
      // Buscar agendamentos de amanhã que possam receber respostas '1' ou '2' do lembrete Cron
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      const amanhaStr = amanha.toISOString().split('T')[0];

      const agendamentoAmanha = await dbGet(`
        SELECT a.*, m.nome as medico_nome
        FROM Agendamentos a
        JOIN Medicos m ON a.medico_id = m.id
        WHERE a.paciente_id = ? AND a.data_hora LIKE ? AND a.status_agendamento IN ('pendente', 'solicitado')
        ORDER BY a.data_hora DESC LIMIT 1
      `, [paciente.id, `${amanhaStr}%`]);

      if (agendamentoAmanha && (cleanReply === '1' || cleanReply === '2' || cleanReply === 'CONFIRMAR' || cleanReply === 'CANCELAR')) {
        targetAgendamentoId = agendamentoAmanha.id;
        if (cleanReply === '1' || cleanReply === 'CONFIRMAR') {
          await dbRun("UPDATE Agendamentos SET status_agendamento = 'confirmado' WHERE id = ?", [targetAgendamentoId]);
          responseTextBot = `Confirmado! Sua presença para o agendamento de amanhã com ${agendamentoAmanha.medico_nome} foi registrada. 🏥`;
        } else {
          await dbRun("UPDATE Agendamentos SET status_agendamento = 'cancelado' WHERE id = ?", [targetAgendamentoId]);
          
          const parts = agendamentoAmanha.data_hora.split(' ');
          await dbRun(
            "UPDATE Disponibilidade SET status_disponivel = 1 WHERE medico_id = ? AND data = ? AND hora_inicio = ?",
            [agendamentoAmanha.medico_id, parts[0], parts[1]]
          );
          responseTextBot = `Seu agendamento com ${agendamentoAmanha.medico_nome} para amanhã foi cancelado e o horário foi liberado em nosso sistema. 🌸`;
        }

        const botTimeStr = new Date(Date.now() + 1000).toISOString().replace('T', ' ').substring(0, 19);
        await saveMessageAndNotifyN8N(targetAgendamentoId, whatsapp, responseTextBot, 'lido', botTimeStr);
        return res.json({ success: true, botReplied: responseTextBot });
      }
    }

    // Verificar se o chatbot está ativo antes de prosseguir com o fluxo de triagem/conversação
    const botAtivoRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'bot_ativo'");
    const botAtivo = botAtivoRow ? botAtivoRow.valor === '1' : true;

    if (!botAtivo) {
      // Se o chatbot estiver inativo, salvamos a mensagem recebida e não geramos resposta automática
      return res.json({ success: true, botReplied: null });
    }

    // Interceptar e usar a IA do Gemini se a chave de API estiver configurada
    const geminiKeyRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'gemini_api_key'");
    const geminiModelRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'gemini_model'");
    const geminiPromptRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'bot_system_instruction'");
    const clinicaNameRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'nome_clinica'");

    const geminiApiKey = geminiKeyRow ? geminiKeyRow.valor : '';
    const geminiModel = (geminiModelRow && geminiModelRow.valor) ? geminiModelRow.valor : 'gemini-2.0-flash';
    const systemInstruction = geminiPromptRow ? geminiPromptRow.valor : '';
    const clinicaName = clinicaNameRow ? clinicaNameRow.valor : 'Agenda WP';

    if (geminiApiKey && geminiApiKey.trim() !== '') {
      console.log(`[AI Bot] Iniciando processamento com Gemini (${geminiModel}) para o número ${whatsapp}`);
      const aiReply = await processGeminiChatbot(whatsapp, respostaText, paciente, chatState, geminiApiKey, geminiModel, systemInstruction, clinicaName);
      if (aiReply.success) {
        return res.json({ success: true, botReplied: aiReply.botReplied });
      } else {
        console.warn("[AI Bot] Falha no processamento com Gemini. Executando fallback para o chatbot clássico baseado em regras.");
      }
    }

    // ==========================================
    // FLUXO DE CADASTRO DE NOVO PACIENTE (Se não cadastrado no banco) - FALLBACK CLÁSSICO
    // ==========================================
    if (!paciente) {
      if (!chatState) {
        // Iniciar cadastro
        await setChatState(whatsapp, 'AWAITING_NAME');
        const welcomeRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'bot_mensagem_boas_vindas'");
        const clinicaRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'nome_clinica'");
        const clinicaName = clinicaRow ? clinicaRow.valor : 'Agenda WP';
        let welcomeTemplate = welcomeRow ? welcomeRow.valor : '';
        if (!welcomeTemplate) {
          welcomeTemplate = 'Olá! Seja bem-vindo à clínica *{clinica}*. Sou a assistente virtual da clínica. 🤖\nIdentifiquei que este número ainda não está cadastrado em nosso sistema.\n\nPara começarmos seu cadastro rápido, por favor, digite seu *nome completo*:';
        }
        responseTextBot = welcomeTemplate.replace(/{clinica}/g, clinicaName);
      } 
      else if (chatState.estado === 'AWAITING_NAME') {
        const cleaned = cleanNameInput(respostaText);
        const validation = validateName(cleaned);

        if (!validation.valid) {
          if (validation.reason === 'greeting_only') {
            responseTextBot = 'Olá! 😊 Para podermos iniciar o seu cadastro, você poderia me informar o seu *nome completo* (nome e sobrenome), por favor?';
          } else if (validation.reason === 'single_word') {
            responseTextBot = 'Ah, para o cadastro preciso do seu *nome completo* (nome e sobrenome). Poderia digitar ele inteirinho para mim? 📝';
          } else {
            responseTextBot = 'Ops, parece que o nome digitado contém números ou caracteres especiais. 🧐 Por favor, digite apenas letras e espaços para o seu *nome completo*:';
          }
        } else {
          // Nome recebido válido, pedir CPF
          await setChatState(whatsapp, 'AWAITING_CPF', { nome: cleaned });
          responseTextBot = `Prazer em conhecer você, *${cleaned}*! 🤝\nAgora, por favor, digite seu *CPF* (apenas números ou no formato 000.000.000-00):`;
        }
      } 
      else if (chatState.estado === 'AWAITING_CPF') {
        // Validar CPF básico
        const cleanCpf = respostaText.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
          responseTextBot = 'Desculpe, não consegui identificar um CPF válido com 11 dígitos. 🧐\n\nPor favor, digite novamente apenas os números do seu CPF (ou no formato 000.000.000-00):';
        } else {
          // Checar se CPF já existe no banco
          const checkCpf = await dbGet("SELECT id FROM Pacientes WHERE cpf = ?", [respostaText]);
          if (checkCpf) {
            responseTextBot = 'Identifiquei que este CPF já está cadastrado com outro contato em nosso sistema. 🏥\n\nPor favor, revise os dígitos ou digite um CPF diferente para prosseguir:';
          } else {
            await setChatState(whatsapp, 'AWAITING_BIRTHDAY', { 
              nome: chatState.temp_nome, 
              cpf: respostaText 
            });
            responseTextBot = 'CPF recebido com sucesso! 👍 Por fim, qual é a sua *data de nascimento*? (Digite no formato DD/MM/AAAA, ex: 15/05/1990):';
          }
        }
      } 
      else if (chatState.estado === 'AWAITING_BIRTHDAY') {
        // Validar e formatar data
        const parts = respostaText.split('/');
        if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
          responseTextBot = 'Ops, não consegui entender a data. 🗓️\n\nPor favor, digite sua data de nascimento no formato *DD/MM/AAAA* (exemplo: *15/05/1990*):';
        } else {
          const birthdayDb = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
          
          // Inserir Paciente
          const result = await dbRun(
            "INSERT INTO Pacientes (nome, cpf, whatsapp, data_nascimento, convenio_id) VALUES (?, ?, ?, ?, NULL)",
            [chatState.temp_nome, chatState.temp_cpf, whatsapp, birthdayDb]
          );

          paciente = { id: result.id, nome: chatState.temp_nome, whatsapp };
          
          // Transicionar para agendamento
          await setChatState(whatsapp, 'AWAITING_TYPE');
          responseTextBot = `Cadastro realizado com sucesso! 🎉\nOlá, *${paciente.nome}*! Como posso ajudar você hoje?\n\nDigite *1* para agendar uma *Consulta*\nDigite *2* para agendar um *Exame*`;
        }
      }
    } 
    // ==========================================
    // FLUXO DE AGENDAMENTO (Para pacientes cadastrados)
    // ==========================================
    else {
      if (!chatState || chatState.estado === 'IDLE') {
        await setChatState(whatsapp, 'AWAITING_TYPE');
        responseTextBot = `Olá, *${paciente.nome}*! Sou o assistente virtual da clínica *Agenda WP*. 🏥\nComo posso ajudar você hoje?\n\nDigite *1* para agendar uma *Consulta*\nDigite *2* para agendar um *Exame*`;
      } 
      else if (chatState.estado === 'AWAITING_TYPE') {
        let tipo = '';
        if (cleanReply === '1' || cleanReply.includes('CONSULTA')) {
          tipo = 'consulta';
        } else if (cleanReply === '2' || cleanReply.includes('EXAME')) {
          tipo = 'exame';
        }

        if (!tipo) {
          responseTextBot = 'Por favor, selecione uma opção válida. Digite *1* para *Consulta* ou *2* para *Exame*:';
        } else {
          await setChatState(whatsapp, 'AWAITING_PAYMENT', { tipo });
          responseTextBot = `Entendido! Você selecionou: *${tipo === 'consulta' ? 'Consulta' : 'Exame'}*.\nComo será a forma de pagamento?\n\nDigite *1* para *Particular*\nDigite *2* para *Plano de Saúde (Convênio)*`;
        }
      } 
      else if (chatState.estado === 'AWAITING_PAYMENT') {
        if (cleanReply === '1' || cleanReply.includes('PARTICULAR')) {
          await setChatState(whatsapp, 'AWAITING_SPECIALTY', { 
            tipo: chatState.temp_tipo, 
            pagamento: 'particular' 
          });
          responseTextBot = 'Qual é a *especialidade médica* ou o *sintoma/patologia* que você deseja tratar? (Ex: Cardiologia, Pediatria, dor de cabeça, febre...):';
        } else if (cleanReply === '2' || cleanReply.includes('PLANO') || cleanReply.includes('CONVENIO')) {
          await setChatState(whatsapp, 'AWAITING_CONVENIO', { 
            tipo: chatState.temp_tipo, 
            pagamento: 'convenio' 
          });
          responseTextBot = 'Por favor, digite o nome do seu *plano de saúde/convênio* (Ex: Unimed, Amil...):';
        } else {
          responseTextBot = 'Opção inválida. Digite *1* para atendimento *Particular* ou *2* para uso de *Plano de Saúde (Convênio)*:';
        }
      } 
      else if (chatState.estado === 'AWAITING_CONVENIO') {
        // Validar se aceitamos
        const listConvenios = await dbAll("SELECT * FROM Convenios WHERE status_ativo = 1");
        const match = listConvenios.find(c => 
          cleanReply.includes(c.nome_plano.toUpperCase()) || 
          c.nome_plano.toUpperCase().includes(cleanReply)
        );

        if (match) {
          // Atualizar o plano do paciente no banco para este atendimento
          await dbRun("UPDATE Pacientes SET convenio_id = ? WHERE id = ?", [match.id, paciente.id]);
          
          await setChatState(whatsapp, 'AWAITING_SPECIALTY', { 
            tipo: chatState.temp_tipo, 
            pagamento: 'convenio',
            convenio_id: match.id 
          });
          responseTextBot = `Perfeito! Aceitamos o plano *${match.nome_plano}*. \n\nQual é a *especialidade médica* ou o *sintoma/patologia* que você deseja tratar? (Ex: Cardiologia, Pediatria...):`;
        } else {
          const activePlans = listConvenios.map(c => `• ${c.nome_plano}`).join('\n');
          responseTextBot = `Infelizmente não aceitamos ou está inativo este convênio. Nossos planos ativos são:\n${activePlans}\n\nPor favor, digite outro plano da lista ou digite *PARTICULAR* para pagar sem plano:`;
          
          // Se escolher particular, atualizamos a rota
          if (cleanReply.includes('PARTICULAR')) {
            await setChatState(whatsapp, 'AWAITING_SPECIALTY', { 
              tipo: chatState.temp_tipo, 
              pagamento: 'particular' 
            });
            responseTextBot = 'Alterado para Particular. Qual é a *especialidade médica* ou o *sintoma/patologia* que você deseja tratar? (Ex: Cardiologia, Pediatria...):';
          }
        }
      } 
      else if (chatState.estado === 'AWAITING_SPECIALTY') {
        // Buscar médico
        const medicos = await dbAll("SELECT * FROM Medicos");
        const matchMed = medicos.find(m => 
          m.especialidade.toUpperCase().includes(cleanReply) ||
          cleanReply.includes(m.especialidade.toUpperCase()) ||
          (m.patologias_atendidas && m.patologias_atendidas.toUpperCase().includes(cleanReply))
        );

        if (matchMed) {
          // Buscar horários com no mínimo 1 hora de proximidade
          const brTime = getBrazilTime();
          const dbSlots = await dbAll(
            "SELECT * FROM Disponibilidade WHERE medico_id = ? AND data >= ? AND status_disponivel = 1 ORDER BY data ASC, hora_inicio ASC LIMIT 20",
            [matchMed.id, brTime.dateStr]
          );

          const slots = dbSlots.filter(slot => {
            const slotDate = new Date(`${slot.data}T${slot.hora_inicio}:00`);
            const diffMs = slotDate.getTime() - brTime.fullDate.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            return diffHours >= 1.0;
          }).slice(0, 5);

          if (slots.length > 0) {
            const valorConsulta = (matchMed.valor_consulta !== null && matchMed.valor_consulta !== undefined) ? matchMed.valor_consulta : 150.00;
            const priceStr = chatState.temp_pagamento === 'particular' ? `\nValor da consulta: *R$ ${valorConsulta.toFixed(2)}*\n` : '';
            
            let listStr = `Encontrei os seguintes horários livres com *${matchMed.nome}* (${matchMed.especialidade}):${priceStr}\n`;
            slots.forEach((s, idx) => {
              const formattedDate = s.data.split('-').reverse().join('/');
              listStr += `${idx + 1} - ${formattedDate} às ${s.hora_inicio}h\n`;
            });
            listStr += '\nDigite o *número* da opção desejada para reservar:';

            await setChatState(whatsapp, 'AWAITING_SLOT_SELECTION', {
              tipo: chatState.temp_tipo,
              pagamento: chatState.temp_pagamento,
              convenio_id: chatState.temp_convenio_id,
              medico_id: matchMed.id,
              slots_json: JSON.stringify(slots)
            });
            responseTextBot = listStr;
          } else {
            responseTextBot = `Encontrei o médico *${matchMed.nome}* (${matchMed.especialidade}), mas ele não possui horários livres nos próximos dias. Gostaria de buscar outra especialidade ou sintoma?`;
          }
        } else {
          responseTextBot = 'Não encontrei especialistas ou patologias correspondentes em nosso sistema. Por favor, tente com outro termo (Ex: Cardiologia, Pediatria, Ortopedia, Endocrinologia):';
        }
      } 
      else if (chatState.estado === 'AWAITING_SLOT_SELECTION') {
        let slots = [];
        try {
          slots = JSON.parse(chatState.temp_slots_json || '[]');
        } catch (e) {
          slots = [];
        }

        if (slots.length === 0) {
          // Se não há slots no estado, redirecionar de volta para buscar especialidade de forma humanizada
          await setChatState(whatsapp, 'AWAITING_SPECIALTY', {
            tipo: chatState.temp_tipo,
            pagamento: chatState.temp_pagamento,
            convenio_id: chatState.temp_convenio_id
          });
          responseTextBot = 'Desculpe-me, não encontrei horários disponíveis para o médico escolhido no momento. 😔\n\nPor favor, digite qual outra *especialidade médica* ou *sintoma* você gostaria de tratar hoje para buscarmos opções:';
        } else {
          const selectionIndex = parseInt(respostaText) - 1;

          if (isNaN(selectionIndex) || selectionIndex < 0 || selectionIndex >= slots.length) {
            responseTextBot = `Ops! Não consegui identificar a sua escolha. 🗓️\n\nPor favor, responda digitando apenas o *número* correspondente da lista acima (de 1 a ${slots.length}):`;
          } else {
          const selectedSlot = slots[selectionIndex];
          const medico = await dbGet("SELECT nome, especialidade, valor_consulta FROM Medicos WHERE id = ?", [chatState.temp_medico_id]);
          const valorConsulta = (medico && medico.valor_consulta !== null && medico.valor_consulta !== undefined) ? medico.valor_consulta : 150.00;
          const valor = chatState.temp_pagamento === 'convenio' ? 0 : valorConsulta;

          // 1. Criar agendamento com status 'solicitado' (Passo 4)
          const dataHoraAgend = `${selectedSlot.data} ${selectedSlot.hora_inicio}`;
          const insertAgend = await dbRun(
            "INSERT INTO Agendamentos (paciente_id, medico_id, data_hora, tipo_atendimento, tipo_pagamento, valor_combinado, status_agendamento) VALUES (?, ?, ?, ?, ?, ?, 'solicitado')",
            [paciente.id, chatState.temp_medico_id, dataHoraAgend, chatState.temp_tipo, chatState.temp_pagamento, valor]
          );

          targetAgendamentoId = insertAgend.id;

          // 2. Ocupar disponibilidade
          await dbRun(
            "UPDATE Disponibilidade SET status_disponivel = 0 WHERE id = ?",
            [selectedSlot.id]
          );

          // 3. Limpar chat state
          await deleteChatState(whatsapp);

          // 4. Enviar mensagem de confirmação
          const formattedDate = selectedSlot.data.split('-').reverse().join('/');
          
          responseTextBot = `Agendamento Solicitado com Sucesso! 📅🏥\n\n*Resumo do Agendamento*:\n• Paciente: *${paciente.nome}*\n• Médico: *${medico.nome}* (${medico.especialidade})\n• Data: *${formattedDate}* às *${selectedSlot.hora_inicio}h*\n• Tipo: *${chatState.temp_tipo === 'consulta' ? 'Consulta' : 'Exame'}*\n• Pagamento: *${chatState.temp_pagamento === 'convenio' ? 'Convênio' : `Particular (R$ ${valor.toFixed(2)})`}*\n\nSeu agendamento foi registrado com status *Solicitado*. Te aguardamos em nossa clínica!`;
        }
      }
    }
  }

    // 3. Gravar resposta do Bot
    if (responseTextBot) {
      const botTimeStr = new Date(Date.now() + 1000).toISOString().replace('T', ' ').substring(0, 19);
      await saveMessageAndNotifyN8N(
        targetAgendamentoId, whatsapp, responseTextBot, 'lido', botTimeStr
      );
    }

    res.json({ success: true, botReplied: responseTextBot });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Enviar uma mensagem manual da clínica para o paciente (agente humano)
app.post('/api/whatsapp/enviar', async (req, res) => {
  const { whatsapp, mensagem } = req.body;
  console.log(`[Painel Enviar] Enviando mensagem manual para: whatsapp="${whatsapp}", mensagem="${mensagem}"`);
  
  if (!whatsapp || !mensagem) {
    return res.status(400).json({ error: 'WhatsApp e mensagem são obrigatórios' });
  }

  try {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // Salvar no histórico como enviado pelo atendente e notificar N8N para disparo real
    await saveMessageAndNotifyN8N(null, whatsapp, mensagem, 'enviado', nowStr);

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 8. AUTOMATION CRON SIMULATOR (Passo 5)
// ==========================================
app.post('/api/automacoes/disparar-lembretes', async (req, res) => {
  try {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    const amanhaStr = amanha.toISOString().split('T')[0]; // YYYY-MM-DD

    // Obter modelo de lembrete e nome da clínica configurados
    const templateRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'lembrete_modelo'");
    const clinicaRow = await dbGet("SELECT valor FROM Configuracoes WHERE chave = 'nome_clinica'");
    
    let template = templateRow ? templateRow.valor : '';
    if (!template) {
      template = 'Olá *{paciente}*! 🏥\nLembramos que seu agendamento de *{tipo}* com *{medico}* está marcado para amanhã (*{data}*) às *{hora}h*.\n\nResponda *1* para *CONFIRMAR* ou *2* para *CANCELAR*.';
    }
    const clinicaName = clinicaRow ? clinicaRow.valor : 'Agenda WP';

    // Buscar agendamentos de amanhã que estão 'pendente' ou 'solicitado' (não cancelados)
    const agendamentosAmanha = await dbAll(`
      SELECT a.*, p.nome as paciente_nome, p.whatsapp as paciente_whatsapp, m.nome as medico_nome, m.especialidade
      FROM Agendamentos a
      JOIN Pacientes p ON a.paciente_id = p.id
      JOIN Medicos m ON a.medico_id = m.id
      WHERE a.data_hora LIKE ? AND a.status_agendamento IN ('pendente', 'solicitado')
    `, [`${amanhaStr}%`]);

    const disparados = [];
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    for (const a of agendamentosAmanha) {
      const hora = a.data_hora.split(' ')[1];
      const dataFormatada = amanhaStr.split('-').reverse().join('/');
      
      const msg = template
        .replace(/{paciente}/g, a.paciente_nome)
        .replace(/{tipo}/g, a.tipo_atendimento === 'consulta' ? 'consulta' : 'exame')
        .replace(/{medico}/g, a.medico_nome)
        .replace(/{data}/g, dataFormatada)
        .replace(/{hora}/g, hora)
        .replace(/{clinica}/g, clinicaName);
      
      // Salvar a mensagem no log e associar ao ID do agendamento
      await saveMessageAndNotifyN8N(a.id, a.paciente_whatsapp, msg, 'entregue', nowStr);
      
      disparados.push({ paciente: a.paciente_nome, hora });
    }

    res.json({ success: true, count: disparados.length, disparados });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao disparar lembretes automáticos' });
  }
});

// ==========================================
// 9. SALAS & CHAMADAS QUEUE PANEL API
// ==========================================

// Listar salas
app.get('/api/salas', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM Salas ORDER BY nome ASC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar sala
app.post('/api/salas', async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome da sala é obrigatório' });
  try {
    const result = await dbRun("INSERT INTO Salas (nome) VALUES (?)", [nome]);
    res.status(201).json({ id: result.id, nome });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir sala
app.delete('/api/salas/:id', async (req, res) => {
  try {
    await dbRun("DELETE FROM Salas WHERE id = ?", [req.params.id]);
    res.json({ message: 'Sala excluída com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar consultório/sala de um médico
app.put('/api/medicos/:id/sala', async (req, res) => {
  const { sala_id } = req.body;
  const medicoId = req.params.id;
  try {
    await dbRun("UPDATE Medicos SET sala_id = ? WHERE id = ?", [sala_id || null, medicoId]);
    res.json({ success: true, medico_id: medicoId, sala_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar agendamentos aguardando atendimento de hoje
app.get('/api/agendamentos/aguardando', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const rows = await dbAll(`
      SELECT a.*, p.nome as paciente_nome, p.whatsapp as paciente_whatsapp, m.nome as medico_nome, m.especialidade
      FROM Agendamentos a
      JOIN Pacientes p ON a.paciente_id = p.id
      JOIN Medicos m ON a.medico_id = m.id
      WHERE a.data_hora LIKE ? AND a.status_agendamento = 'aguardando'
      ORDER BY a.data_hora ASC
    `, [`${hoje}%`]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar últimas chamadas do painel (histórico)
app.get('/api/chamadas/lista', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM Chamadas ORDER BY id DESC LIMIT 10");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chamar paciente
app.post('/api/chamadas', async (req, res) => {
  const { agendamento_id } = req.body;
  if (!agendamento_id) return res.status(400).json({ error: 'ID do agendamento é obrigatório' });
  try {
    // 1. Buscar detalhes do agendamento, do paciente, do médico e da sala do médico
    const agend = await dbGet(`
      SELECT a.*, p.nome as paciente_nome, m.nome as medico_nome, s.nome as sala_nome
      FROM Agendamentos a
      JOIN Pacientes p ON a.paciente_id = p.id
      JOIN Medicos m ON a.medico_id = m.id
      LEFT JOIN Salas s ON m.sala_id = s.id
      WHERE a.id = ?
    `, [agendamento_id]);

    if (!agend) return res.status(404).json({ error: 'Agendamento não encontrado' });
    
    const salaNome = agend.sala_nome || 'Consultório Principal';

    // 2. Mudar status do agendamento para 'chamado'
    await dbRun("UPDATE Agendamentos SET status_agendamento = 'chamado' WHERE id = ?", [agendamento_id]);

    // 3. Registrar chamada na tabela de Chamadas
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const result = await dbRun(`
      INSERT INTO Chamadas (agendamento_id, paciente_nome, medico_nome, sala_nome, data_hora)
      VALUES (?, ?, ?, ?, ?)
    `, [agendamento_id, agend.paciente_nome, agend.medico_nome, salaNome, nowStr]);

    res.status(201).json({
      success: true,
      id: result.id,
      paciente_nome: agend.paciente_nome,
      medico_nome: agend.medico_nome,
      sala_nome: salaNome,
      data_hora: nowStr
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Buscar chamadas realizadas hoje por um médico específico (evitando duplicidade de paciente/agendamento)
app.get('/api/chamadas/medico/:medicoId/hoje', async (req, res) => {
  const { medicoId } = req.params;
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const rows = await dbAll(`
      SELECT c.*, a.tipo_atendimento, a.paciente_id, a.observacoes, a.orientacoes_reagendamento, a.tipo_pagamento
      FROM Chamadas c
      JOIN Agendamentos a ON c.agendamento_id = a.id
      WHERE c.id IN (
        SELECT MAX(id)
        FROM Chamadas
        GROUP BY agendamento_id
      )
      AND a.medico_id = ? 
      AND c.data_hora LIKE ?
      ORDER BY c.id DESC
    `, [medicoId, `${hoje}%`]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar detalhes do atendimento (observações e orientações de reagendamento) pelo médico
app.put('/api/agendamentos/:id/detalhes-atendimento', async (req, res) => {
  const { id } = req.params;
  const { observacoes, orientacoes_reagendamento } = req.body;
  try {
    await dbRun(`
      UPDATE Agendamentos 
      SET observacoes = ?, orientacoes_reagendamento = ?
      WHERE id = ?
    `, [observacoes, orientacoes_reagendamento, id]);
    res.json({ success: true, message: 'Detalhes do atendimento atualizados com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar datas que possuem pelo menos um slot de disponibilidade livre para um médico específico
app.get('/api/medicos/:id/datas-disponiveis', async (req, res) => {
  const { id } = req.params;
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const rows = await dbAll(`
      SELECT DISTINCT data
      FROM Disponibilidade
      WHERE medico_id = ? AND status_disponivel = 1 AND data >= ?
      ORDER BY data ASC
    `, [id, hoje]);
    
    const datas = rows.map(r => r.data);
    res.json(datas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar histórico de atendimentos de um paciente específico (realizados, chamados, etc)
app.get('/api/pacientes/:id/historico-atendimentos', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await dbAll(`
      SELECT a.*, m.nome as medico_nome, m.especialidade
      FROM Agendamentos a
      JOIN Medicos m ON a.medico_id = m.id
      WHERE a.paciente_id = ?
      ORDER BY a.data_hora DESC
    `, [id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Diagnóstico do Chatbot de IA Gemini
app.get('/api/diagnose-ai', async (req, res) => {
  try {
    const configRows = await dbAll("SELECT * FROM Configuracoes");
    const configs = {};
    configRows.forEach(row => {
      configs[row.chave] = row.valor;
    });

    const apiKey = configs['gemini_api_key'] || '';
    const model = configs['gemini_model'] || 'gemini-2.0-flash';
    const botAtivo = configs['bot_ativo'] === '1';
    const systemInstruction = configs['bot_system_instruction'] || '';
    const clinicaName = configs['nome_clinica'] || 'Agenda WP';

    const diagnostics = {
      serverVersion: '1.2.0-GeminiCorrectedHistory',
      botAtivo: botAtivo,
      geminiApiKeyConfigured: apiKey.trim() !== '',
      geminiApiKeyLength: apiKey.trim().length,
      geminiModel: model,
      nomeClinica: clinicaName,
      systemInstructionLength: systemInstruction.length,
      internetAccess: false,
      geminiApiConnection: 'not_tested',
      error: null
    };

    // Testar acesso à internet e conexão com a API do Gemini
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const testRes = await fetch('https://generativelanguage.googleapis.com', {
        method: 'GET',
        signal: controller.signal
      }).catch(() => null);
      
      clearTimeout(timeoutId);
      diagnostics.internetAccess = true;
      
      if (testRes) {
        diagnostics.geminiApiConnection = `reachable (Status: ${testRes.status})`;
      } else {
        diagnostics.geminiApiConnection = 'unreachable';
      }
    } catch (netErr) {
      diagnostics.internetAccess = false;
      diagnostics.geminiApiConnection = `failed: ${netErr.message}`;
    }

    // Testar chamada real com a chave se configurada
    if (apiKey.trim() !== '') {
      // 1. Consultar a lista de modelos disponíveis para esta chave de API
      try {
        const listRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (listRes.ok) {
          const listJson = await listRes.json();
          diagnostics.availableModelsForThisKey = listJson.models?.map(m => m.name.replace('models/', '')) || [];
        } else {
          diagnostics.availableModelsError = await listRes.text();
        }
      } catch (listErr) {
        diagnostics.availableModelsError = listErr.message;
      }

      // 2. Testar a geração de conteúdo
      try {
        const payload = {
          contents: [{ role: 'user', parts: [{ text: 'Hello, this is a diagnostic test message.' }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                testOk: { type: "BOOLEAN" }
              },
              required: ["testOk"]
            }
          }
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          }
        );

        clearTimeout(timeoutId);
        diagnostics.geminiApiHttpStatus = geminiRes.status;

        if (geminiRes.ok) {
          const resJson = await geminiRes.json();
          diagnostics.geminiApiResult = 'success';
          diagnostics.geminiApiResponseParsed = JSON.parse(resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        } else {
          const resText = await geminiRes.text();
          diagnostics.geminiApiResult = 'failed';
          diagnostics.geminiApiErrorText = resText;
        }
      } catch (geminiErr) {
        diagnostics.geminiApiResult = 'error';
        diagnostics.geminiApiErrorText = geminiErr.message;
      }
    }

    res.json(diagnostics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obter todas as configurações
app.get('/api/configuracoes', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM Configuracoes");
    const config = {};
    rows.forEach(row => {
      config[row.chave] = row.valor;
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Atualizar configurações em lote
app.post('/api/configuracoes', async (req, res) => {
  const configs = req.body;
  try {
    for (const [chave, valor] of Object.entries(configs)) {
      await dbRun(
        "INSERT OR REPLACE INTO Configuracoes (chave, valor) VALUES (?, ?)",
        [chave, valor]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir arquivos estáticos do frontend (React build) em produção
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

// Fallback para index.html do React (Single Page Application routing)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Backend server rodando na porta ${PORT}`);
});
