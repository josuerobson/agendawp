import React, { useState, useEffect } from 'react';
import { Save, Settings, AlertCircle, Info, Sparkles, Link, Bell, Shield, MessageSquare, Trash2, RefreshCw, Cpu, X } from 'lucide-react';

function ConfiguracoesView() {
  const [configs, setConfigs] = useState({
    url_n8n_mensagens: '',
    url_n8n_alertas: '',
    whatsapp_instancia: 'instancia_principal',
    whatsapp_token: '',
    nome_clinica: 'Agenda WP',
    telefone_clinica: '',
    bot_ativo: '1',
    bot_mensagem_boas_vindas: '',
    lembrete_horario: '08:00',
    lembrete_modelo: '',
    gemini_api_key: '',
    gemini_model: 'gemini-2.0-flash',
    bot_system_instruction: ''
  });

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Estados para Monitor de Logs da IA
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchConfigs();
    fetchLogs(false);
    
    // Auto-refresh de logs a cada 10 segundos
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async (silent = true) => {
    if (!silent) setLogsLoading(true);
    try {
      const res = await fetch('/api/ai-logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Erro ao buscar logs da IA:', err);
    } finally {
      if (!silent) setLogsLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm('Tem certeza que deseja apagar todos os logs de execução da IA? Esta ação não pode ser desfeita.')) {
      return;
    }
    try {
      const res = await fetch('/api/ai-logs/clear', { method: 'POST' });
      if (res.ok) {
        setSuccess('Logs da IA limpos com sucesso! 🗑️');
        fetchLogs(false);
        setTimeout(() => setSuccess(''), 5000);
      } else {
        throw new Error('Falha ao limpar logs');
      }
    } catch (err) {
      setError('Erro ao limpar os logs da IA: ' + err.message);
      setTimeout(() => setError(''), 5000);
    }
  };

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/configuracoes');
      if (!res.ok) throw new Error('Falha ao carregar configurações');
      const data = await res.json();
      
      // Merge with default values if keys don't exist
      setConfigs(prev => ({
        ...prev,
        ...data
      }));
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar as configurações do servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (key, val) => {
    setConfigs(prev => ({
      ...prev,
      [key]: val
    }));
  };

  const handleSaveConfigs = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');

    try {
      const res = await fetch('/api/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar configurações.');
      }

      setSuccess('Configurações salvas com sucesso! 🚀');
      
      // Update sidebar dynamically if Clinic Name changed
      window.dispatchEvent(new CustomEvent('config-updated', { detail: configs }));
      
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    }
  };

  const [clearing, setClearing] = useState(false);

  const handleClearConversations = async () => {
    if (!window.confirm('Tem certeza absoluta que deseja apagar todo o histórico de conversas do WhatsApp e resetar a assistente virtual? Esta ação não pode ser desfeita.')) {
      return;
    }

    setClearing(true);
    setSuccess('');
    setError('');

    try {
      const res = await fetch('/api/whatsapp/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao limpar conversas.');
      }

      setSuccess('Todo o histórico do WhatsApp e estados do chatbot foram apagados com sucesso! 🗑️✨');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError(err.message);
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel loading-container" style={{ padding: '3rem', textAlign: 'center' }}>
        <p className="loading-text">Carregando painel de configurações...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in config-view-container">
      <form onSubmit={handleSaveConfigs} className="config-form">
        <div className="config-header-row">
          <div className="title-desc">
            <h3>Parâmetros Globais do Sistema</h3>
            <p className="section-desc">
              Gerencie a integração com o N8N, ative o bot de IA, gerencie a identidade visual e configure os lembretes automáticos.
            </p>
          </div>
          
          <button type="submit" className="btn btn-primary save-btn">
            <Save size={18} /> Salvar Alterações
          </button>
        </div>

        {success && (
          <div className="success-alert animate-fade-in">
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div className="error-alert animate-fade-in">
            <span>{error}</span>
          </div>
        )}

        <div className="config-grid">
          
          {/* Card 1: Integração N8N & WhatsApp API */}
          <div className="glass-panel config-card">
            <div className="card-header">
              <Link className="card-icon text-primary" size={20} />
              <h4>Integração N8N & Webhooks</h4>
            </div>
            
            <div className="form-group">
              <label className="form-label">URL N8N para Troca de Mensagens (Webhook de Saída)</label>
              <input
                type="url"
                className="form-control"
                placeholder="https://n8n.seuservidor.com/webhook/..."
                value={configs.url_n8n_mensagens}
                onChange={(e) => handleInputChange('url_n8n_mensagens', e.target.value)}
              />
              <span className="input-tip">Envia eventos de mensagens enviadas, lidas e recebidas em tempo real.</span>
            </div>

            <div className="form-group">
              <label className="form-label">Webhook de Entrada no Sistema (URL para N8N enviar mensagens)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                  value={`${window.location.origin}/api/whatsapp/sim-reply`}
                  readOnly
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp/sim-reply`);
                    alert('URL copiada para a área de transferência!');
                  }}
                  style={{ whiteSpace: 'nowrap', padding: '0 1rem' }}
                >
                  Copiar
                </button>
              </div>
              <span className="input-tip">URL onde o N8N deve fazer requisições POST com {"{ whatsapp, respostaText }"} para entregar mensagens de pacientes e receber as respostas automáticas.</span>
            </div>

            <div className="form-group">
              <label className="form-label">URL N8N para Alertas e Lembretes (Webhook)</label>
              <input
                type="url"
                className="form-control"
                placeholder="https://n8n.seuservidor.com/webhook-test/..."
                value={configs.url_n8n_alertas}
                onChange={(e) => handleInputChange('url_n8n_alertas', e.target.value)}
              />
              <span className="input-tip">Envia alertas de cron, alterações de status e agendamentos importantes.</span>
            </div>

            <div className="grid-2-cols">
              <div className="form-group">
                <label className="form-label">Instância WhatsApp</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Ex: clinica_whats"
                  value={configs.whatsapp_instancia}
                  onChange={(e) => handleInputChange('whatsapp_instancia', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Token WhatsApp (API Key)</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••••••••••"
                  value={configs.whatsapp_token}
                  onChange={(e) => handleInputChange('whatsapp_token', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Identidade & Branding */}
          <div className="glass-panel config-card">
            <div className="card-header">
              <Shield className="card-icon text-accent" size={20} />
              <h4>Identidade & Branding</h4>
            </div>

            <div className="form-group">
              <label className="form-label">Nome da Clínica / Organização</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: Clínica Vida e Saúde"
                value={configs.nome_clinica}
                onChange={(e) => handleInputChange('nome_clinica', e.target.value)}
                required
              />
              <span className="input-tip">Usado no cabeçalho, nas mensagens do chatbot e no cron do lembrete.</span>
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp/Telefone Oficial</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: +55 (11) 99999-9999"
                value={configs.telefone_clinica}
                onChange={(e) => handleInputChange('telefone_clinica', e.target.value)}
              />
              <span className="input-tip">Telefone de contato que é exibido nos emails e relatórios.</span>
            </div>
          </div>

          {/* Card 3: Assistente Virtual & Chatbot IA */}
          <div className="glass-panel config-card">
            <div className="card-header">
              <MessageSquare className="card-icon text-success" size={20} />
              <h4>Assistente Virtual & IA Chatbot</h4>
            </div>

            <div className="form-group">
              <label className="form-label">Status da Assistente Virtual</label>
              <select
                className="form-control"
                value={configs.bot_ativo}
                onChange={(e) => handleInputChange('bot_ativo', e.target.value)}
              >
                <option value="1">Ativa (Responde triagens e agendamentos automaticamente)</option>
                <option value="0">Desativada (Apenas loga mensagens no sistema)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Chave de API do Google Gemini (IA)</label>
              <input
                type="password"
                className="form-control"
                placeholder="Cole sua chave API do Google AI Studio..."
                value={configs.gemini_api_key || ''}
                onChange={(e) => handleInputChange('gemini_api_key', e.target.value)}
              />
              <span className="input-tip">Deixe em branco para usar o chatbot clássico por regras/máquina de estados.</span>
            </div>

            <div className="form-group">
              <label className="form-label">Modelo de IA (Gemini)</label>
              <select
                className="form-control"
                value={configs.gemini_model || 'gemini-2.0-flash'}
                onChange={(e) => handleInputChange('gemini_model', e.target.value)}
              >
                <option value="gemini-2.0-flash">Gemini 2.0 Flash (Recomendado - Rápido e inteligente)</option>
                <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Super rápido - Baixo consumo)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Mais recente - Performance aprimorada)</option>
                <option value="gemini-flash-latest">Gemini Flash Latest (Sempre a última versão estável)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro (Extremamente inteligente - Maior latência)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Instruções de IA / Persona (System Prompt)</label>
              <textarea
                className="form-control text-area-large"
                rows={10}
                placeholder="Defina as regras de comportamento da assistente virtual..."
                value={configs.bot_system_instruction || ''}
                onChange={(e) => handleInputChange('bot_system_instruction', e.target.value)}
              />
              <div className="placeholders-helper">
                <span>Tag dinâmica aceita: </span>
                <code title="Nome da Clínica (definido em Identidade)">{"{clinica}"}</code>
              </div>
              <span className="input-tip">Essas instruções orientam o tom e o comportamento do assistente virtual ao interagir com o paciente.</span>
            </div>

            <div className="form-group" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <label className="form-label">Mensagem de Boas-vindas (Chatbot Clássico)</label>
              <textarea
                className="form-control text-area-large"
                rows={4}
                placeholder="Ex: Olá! Seja bem-vindo à clínica..."
                value={configs.bot_mensagem_boas_vindas}
                onChange={(e) => handleInputChange('bot_mensagem_boas_vindas', e.target.value)}
              />
              <div className="placeholders-helper">
                <span>Tag dinâmica aceita: </span>
                <code title="Substituído pelo Nome da Clínica">{"{clinica}"}</code>
              </div>
              <span className="input-tip">Esta mensagem é utilizada somente quando a IA está desativada ou sem chave configurada.</span>
            </div>
          </div>

          {/* Card 4: Lembretes & Confirmação Automática (Cron) */}
          <div className="glass-panel config-card">
            <div className="card-header">
              <Bell className="card-icon text-warning" size={20} />
              <h4>Automação de Lembretes (Cron)</h4>
            </div>

            <div className="form-group">
              <label className="form-label">Horário de Disparo Automático</label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: 08:00"
                value={configs.lembrete_horario}
                onChange={(e) => handleInputChange('lembrete_horario', e.target.value)}
                required
              />
              <span className="input-tip">Formato HH:MM. Horário que o servidor agenda o envio de lembretes.</span>
            </div>

            <div className="form-group">
              <label className="form-label">Modelo de Mensagem de Lembrete</label>
              <textarea
                className="form-control text-area-large"
                rows={5}
                placeholder="Modelo de lembrete..."
                value={configs.lembrete_modelo}
                onChange={(e) => handleInputChange('lembrete_modelo', e.target.value)}
                required
              />
              <div className="placeholders-helper">
                <span>Tags dinâmicas aceitas: </span>
                <code title="Nome do Paciente">{"{paciente}"}</code>
                <code title="Tipo de Agendamento">{"{tipo}"}</code>
                <code title="Nome do Médico">{"{medico}"}</code>
                <code title="Data formatada (DD/MM)">{"{data}"}</code>
                <code title="Hora (HH:MM)">{"{hora}"}</code>
                <code title="Nome da Clínica">{"{clinica}"}</code>
              </div>
            </div>
          </div>

          {/* Card 5: Zona de Perigo / Manutenção */}
          <div className="glass-panel config-card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)' }}>
            <div className="card-header" style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.1)' }}>
              <AlertCircle className="card-icon" size={20} style={{ color: 'var(--error)' }} />
              <h4 style={{ color: 'var(--error)' }}>Zona de Perigo</h4>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label className="form-label">Limpar Histórico do WhatsApp</label>
              <p className="input-tip" style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Esta ação apagará permanentemente todas as mensagens enviadas e recebidas do WhatsApp, além de resetar o estado da assistente virtual (chatbot) para todos os números. Isso permite iniciar os testes do zero.
              </p>
              
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleClearConversations}
                disabled={clearing}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--error)',
                  color: 'var(--error)',
                  alignSelf: 'flex-start',
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'background 0.2s, transform 0.1s'
                }}
              >
                {clearing ? 'Limpando...' : 'Apagar Histórico e Reiniciar Chatbot'}
              </button>
            </div>
          </div>

        </div>
      </form>

      {/* Seção de Logs em Tempo Real da IA */}
      <div className="glass-panel config-logs-section" style={{ marginTop: '2rem', padding: '2rem' }}>
        <div className="card-header" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Cpu className="card-icon text-primary animate-pulse" size={22} style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
            <div>
              <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Logs de Execução da IA (Tempo Real)</h4>
              <p className="section-desc" style={{ margin: 0, marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Acompanhe o processamento de mensagens pelo Gemini, erros de cota, status HTTP e mismatches de slots.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fetchLogs(false)}
              disabled={logsLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              <RefreshCw size={16} className={logsLoading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={clearLogs}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--error)', color: 'var(--error)' }}
            >
              <Trash2 size={16} />
              Limpar Logs
            </button>
          </div>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Nenhum log registrado ainda. Envie mensagens para o chatbot para iniciar o monitoramento.
          </div>
        ) : (
          <div className="table-responsive" style={{ overflowX: 'auto' }}>
            <table className="logs-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Horário</th>
                  <th style={{ padding: '0.75rem 1rem' }}>WhatsApp</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Modelo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  let statusColor = 'var(--text-muted)';
                  let statusBg = 'rgba(255,255,255,0.05)';
                  let statusText = log.status;

                  if (log.status === 'success') {
                    statusColor = '#10B981';
                    statusBg = 'rgba(16, 185, 129, 0.1)';
                    statusText = 'Sucesso';
                  } else if (log.status === 'mismatch') {
                    statusColor = '#F59E0B';
                    statusBg = 'rgba(245, 158, 11, 0.1)';
                    statusText = 'Divergência';
                  } else if (log.status === 'failed') {
                    statusColor = '#EF4444';
                    statusBg = 'rgba(239, 68, 68, 0.1)';
                    statusText = 'Falha API';
                  } else if (log.status === 'error') {
                    statusColor = '#DC2626';
                    statusBg = 'rgba(220, 38, 38, 0.15)';
                    statusText = 'Erro Interno';
                  }

                  const dateFormatted = new Date(log.timestamp).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  });

                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }} onClick={() => setSelectedLog(log)}>
                      <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>{dateFormatted}</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{log.whatsapp}</td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{log.modelo}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ display: 'inline-block', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: statusColor, backgroundColor: statusBg }}>
                          {statusText}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                        >
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Log */}
      {selectedLog && (
        <div className="log-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="log-modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="log-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Cpu size={20} className="text-primary" />
                <h4 style={{ margin: 0 }}>Detalhes do Processamento da IA</h4>
              </div>
              <button type="button" className="close-modal-btn" onClick={() => setSelectedLog(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="log-modal-body">
              <div className="log-meta-grid">
                <div>
                  <span className="meta-label">ID do Log</span>
                  <span className="meta-value">#{selectedLog.id}</span>
                </div>
                <div>
                  <span className="meta-label">WhatsApp</span>
                  <span className="meta-value">{selectedLog.whatsapp}</span>
                </div>
                <div>
                  <span className="meta-label">Horário</span>
                  <span className="meta-value">
                    {new Date(selectedLog.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Modelo</span>
                  <span className="meta-value">{selectedLog.modelo}</span>
                </div>
              </div>

              <div className="log-meta-status-row" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="meta-label">Status:</span>
                <span style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: selectedLog.status === 'success' ? '#10B981' : selectedLog.status === 'mismatch' ? '#F59E0B' : '#EF4444',
                  backgroundColor: selectedLog.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : selectedLog.status === 'mismatch' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                }}>
                  {selectedLog.status.toUpperCase()}
                </span>
              </div>

              {selectedLog.detalhes && (
                <div className="log-data-section">
                  <h5>Contexto / Informações de Depuração</h5>
                  <div className="log-text-block debug-details">
                    {selectedLog.detalhes}
                  </div>
                </div>
              )}

              <div className="log-data-section">
                <h5>Mensagem Enviada pelo Paciente (Request)</h5>
                <div className="log-text-block user-request">
                  {selectedLog.request_text}
                </div>
              </div>

              <div className="log-data-section">
                <h5>Resposta do Gemini (JSON ou Retorno da API)</h5>
                <pre className="log-json-block">
                  <code>
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedLog.response_json);
                        return JSON.stringify(parsed, null, 2);
                      } catch (e) {
                        return selectedLog.response_json;
                      }
                    })()}
                  </code>
                </pre>
              </div>
            </div>

            <div className="log-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .config-view-container {
          padding-bottom: 2rem;
        }

        .config-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          gap: 1.5rem;
        }

        .config-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .config-card {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          height: fit-content;
        }

        .card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .card-header h4 {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .grid-2-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .input-tip {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.25rem;
          display: block;
        }

        .text-area-large {
          font-family: inherit;
          line-height: 1.5;
          resize: vertical;
        }

        .placeholders-helper {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-top: 0.4rem;
        }

        .placeholders-helper code {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid var(--border-color);
          padding: 0.1rem 0.35rem;
          border-radius: var(--radius-xs);
          color: var(--primary);
          cursor: help;
          font-family: monospace;
          font-weight: 600;
        }

        .success-alert {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: var(--whatsapp);
          padding: 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 500;
          margin-bottom: 1.5rem;
        }

        @media (max-width: 992px) {
          .config-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 576px) {
          .config-header-row {
            flex-direction: column;
            align-items: stretch;
          }
          .save-btn {
            width: 100%;
          }
          .grid-2-cols {
            grid-template-columns: 1fr;
          }
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .logs-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        
        /* Modal Styles */
        .log-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(5px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 1.5rem;
        }
        
        .log-modal-content {
          width: 100%;
          max-width: 800px;
          max-height: 85vh;
          overflow-y: auto;
          background: #111827;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }
        
        .log-modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .close-modal-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, color 0.2s;
        }
        
        .close-modal-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }
        
        .log-modal-body {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          overflow-y: auto;
        }
        
        .log-meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          background: rgba(255, 255, 255, 0.02);
          padding: 1rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
        }
        
        .meta-label {
          display: block;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .meta-value {
          display: block;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-primary);
        }
        
        .log-data-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .log-data-section h5 {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .log-text-block {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          padding: 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          line-height: 1.5;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-word;
        }
        
        .debug-details {
          border-left: 3px solid var(--primary);
          font-family: monospace;
          font-size: 0.85rem;
        }
        
        .user-request {
          border-left: 3px solid #6366F1;
        }
        
        .log-json-block {
          background: #0B0F19;
          border: 1px solid var(--border-color);
          padding: 1rem;
          border-radius: var(--radius-sm);
          font-family: monospace;
          font-size: 0.85rem;
          line-height: 1.4;
          color: #E2E8F0;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 300px;
          margin: 0;
        }
        
        .log-modal-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
}

export default ConfiguracoesView;
