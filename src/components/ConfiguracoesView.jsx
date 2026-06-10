import React, { useState, useEffect } from 'react';
import { Save, Settings, AlertCircle, Info, Sparkles, Link, Bell, Shield, MessageSquare } from 'lucide-react';

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

  useEffect(() => {
    fetchConfigs();
  }, []);

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
      `}</style>
    </div>
  );
}

export default ConfiguracoesView;
