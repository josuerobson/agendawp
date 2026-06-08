const express = require('express');
const cors = require('cors');
const db = require('./database');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Garantir que foreign keys funcionem para cada conexão
app.use((req, res, next) => {
  db.run('PRAGMA foreign_keys = ON;', (err) => {
    if (err) console.error('Erro ao ativar foreign_keys por requisição:', err);
    next();
  });
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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
  
  await triggerN8NWebhook(eventType, {
    id: result.id,
    agendamento_id,
    whatsapp: whatsapp_destino,
    mensagem,
    status: status_envio,
    data_envio,
    timestamp: Date.now()
  });
  
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
    if (error.message.includes('UNIQUE constraint failed: Pacientes.cpf')) {
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
    const rows = await dbAll("SELECT * FROM Medicos ORDER BY nome ASC");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/medicos', async (req, res) => {
  const { nome, crm, especialidade, patologias_atendidas } = req.body;
  if (!nome || !crm || !especialidade) {
    return res.status(400).json({ error: 'Nome, CRM e Especialidade são obrigatórios' });
  }
  try {
    const result = await dbRun(
      "INSERT INTO Medicos (nome, crm, especialidade, patologias_atendidas) VALUES (?, ?, ?, ?)",
      [nome, crm, especialidade, patologias_atendidas || '']
    );
    res.status(201).json({ id: result.id, nome, crm, especialidade, patologias_atendidas });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: Medicos.crm')) {
      res.status(400).json({ error: 'Já existe um médico cadastrado com este CRM.' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

app.put('/api/medicos/:id', async (req, res) => {
  const { nome, crm, especialidade, patologias_atendidas } = req.body;
  try {
    await dbRun(
      "UPDATE Medicos SET nome = ?, crm = ?, especialidade = ?, patologias_atendidas = ? WHERE id = ?",
      [nome, crm, especialidade, patologias_atendidas, req.params.id]
    );
    res.json({ id: req.params.id, nome, crm, especialidade, patologias_atendidas });
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
        agendamentoId, paciente.whatsapp, notifyMsg, 'lido', nowStr
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
      GROUP BY w.whatsapp_destino
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

// Simular uma resposta do paciente via WhatsApp com fluxo de IA Conversacional (Cérebro do Bot)
app.post('/api/whatsapp/sim-reply', async (req, res) => {
  const { whatsapp, respostaText } = req.body;
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

    // ==========================================
    // FLUXO DE CADASTRO DE NOVO PACIENTE (Se não cadastrado no banco)
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
        // Nome recebido, pedir CPF
        await setChatState(whatsapp, 'AWAITING_CPF', { nome: respostaText });
        responseTextBot = `Prazer em conhecer você, *${respostaText}*! \nAgora, por favor, digite seu *CPF* (apenas números ou no formato 000.000.000-00):`;
      } 
      else if (chatState.estado === 'AWAITING_CPF') {
        // Validar CPF básico
        const cleanCpf = respostaText.replace(/\D/g, '');
        if (cleanCpf.length !== 11) {
          responseTextBot = 'Formato de CPF inválido. Por favor, envie um CPF válido com 11 dígitos:';
        } else {
          // Checar se CPF já existe no banco
          const checkCpf = await dbGet("SELECT id FROM Pacientes WHERE cpf = ?", [respostaText]);
          if (checkCpf) {
            responseTextBot = 'Este CPF já está cadastrado em nosso sistema com outro número. Por favor, revise os dígitos ou digite um CPF diferente:';
          } else {
            await setChatState(whatsapp, 'AWAITING_BIRTHDAY', { 
              nome: chatState.temp_nome, 
              cpf: respostaText 
            });
            responseTextBot = 'CPF recebido! Por fim, qual é a sua *data de nascimento*? (Digite no formato DD/MM/AAAA, ex: 15/05/1990):';
          }
        }
      } 
      else if (chatState.estado === 'AWAITING_BIRTHDAY') {
        // Validar e formatar data
        const parts = respostaText.split('/');
        if (parts.length !== 3 || parts[0].length !== 2 || parts[1].length !== 2 || parts[2].length !== 4) {
          responseTextBot = 'Formato de data inválido. Por favor, digite no formato DD/MM/AAAA (ex: 22/10/1992):';
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
            let listStr = `Encontrei os seguintes horários livres com *${matchMed.nome}* (${matchMed.especialidade}):\n\n`;
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
        const slots = JSON.parse(chatState.temp_slots_json || '[]');
        const selectionIndex = parseInt(respostaText) - 1;

        if (isNaN(selectionIndex) || selectionIndex < 0 || selectionIndex >= slots.length) {
          responseTextBot = `Escolha inválida. Por favor, envie apenas o *número* correspondente da lista (de 1 a ${slots.length}):`;
        } else {
          const selectedSlot = slots[selectionIndex];
          const valor = chatState.temp_pagamento === 'convenio' ? 0 : 150; // R$ 150 fixo simulado para particular

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
          const medico = await dbGet("SELECT nome, especialidade FROM Medicos WHERE id = ?", [chatState.temp_medico_id]);
          const formattedDate = selectedSlot.data.split('-').reverse().join('/');
          
          responseTextBot = `Agendamento Solicitado com Sucesso! 📅🏥\n\n*Resumo do Agendamento*:\n• Paciente: *${paciente.nome}*\n• Médico: *${medico.nome}* (${medico.especialidade})\n• Data: *${formattedDate}* às *${selectedSlot.hora_inicio}h*\n• Tipo: *${chatState.temp_tipo === 'consulta' ? 'Consulta' : 'Exame'}*\n• Pagamento: *${chatState.temp_pagamento === 'convenio' ? 'Convênio' : 'Particular (R$ 150)'}*\n\nSeu agendamento foi registrado com status *Solicitado*. Te aguardamos em nossa clínica!`;
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
