import React, { useState, useEffect, useRef } from 'react';
import { Send, Check, CheckCheck, MessageSquare, Shield, User, CornerDownLeft, ToggleLeft, ToggleRight } from 'lucide-react';

function WhatsappSimPanel() {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [customReply, setCustomReply] = useState('');
  const [simulationMode, setSimulationMode] = useState(false); // Default to false (production live chat mode)
  
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const messagesEndRef = useRef(null);
  const prevCountRef = useRef(0);
  const activeChatRef = useRef(activeChat);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    fetchChats();
    // Poll chats list every 6 seconds to capture new appointments
    const interval = setInterval(fetchChats, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeChat) {
      prevCountRef.current = 0; // Reset scroll сравнение ao trocar de chat
      fetchMessages(activeChat.numero);
    }
  }, [activeChat]);

  // Rolar para a última mensagem automaticamente apenas se o número de mensagens aumentou
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  // Recarregar mensagens do chat ativo a cada 2.5 segundos para ver a entrega progressiva dos ticks
  useEffect(() => {
    let interval;
    if (activeChat) {
      interval = setInterval(() => {
        fetchMessages(activeChat.numero, true); // silent reload
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [activeChat]);

  const fetchChats = async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      const data = await res.json();
      setChats(data);
      if (data.length > 0 && !activeChatRef.current) {
        setActiveChat(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchMessages = async (numero, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/whatsapp/chat/${numero}`);
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  const simulatePatientReply = async (text) => {
    if (!activeChat) return;
    
    try {
      const res = await fetch('/api/whatsapp/sim-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: activeChat.numero,
          respostaText: text
        })
      });
      
      if (!res.ok) throw new Error('Erro ao simular resposta');
      
      setCustomReply('');
      // Recarregar mensagens imediatamente
      fetchMessages(activeChat.numero);
      // Recarregar chats para atualizar o snippet da lista lateral
      fetchChats();
    } catch (err) {
      alert(err.message);
    }
  };

  const sendClinicMessage = async (text) => {
    if (!activeChat) return;
    
    try {
      const res = await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp: activeChat.numero,
          mensagem: text
        })
      });
      
      if (!res.ok) throw new Error('Erro ao enviar mensagem');
      
      setCustomReply('');
      // Recarregar mensagens imediatamente
      fetchMessages(activeChat.numero);
      // Recarregar chats para atualizar o snippet da lista lateral
      fetchChats();
    } catch (err) {
      alert(err.message);
    }
  };

  const triggerCronReminders = async () => {
    if (window.confirm('Deseja simular o disparo de lembretes automáticos (Cron 08h00) para os agendamentos de amanhã?')) {
      try {
        const res = await fetch('/api/automacoes/disparar-lembretes', { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao rodar automação');
        
        alert(`Sucesso! ${data.count} lembretes automáticos foram disparados.`);
        fetchChats();
        if (activeChat) fetchMessages(activeChat.numero);
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const handleCustomSubmit = (e) => {
    e.preventDefault();
    if (!customReply.trim()) return;
    
    if (simulationMode) {
      simulatePatientReply(customReply);
    } else {
      sendClinicMessage(customReply);
    }
  };

  const getTickIcon = (status) => {
    if (status === 'enviado') {
      return <Check size={14} className="tick-gray" />;
    }
    if (status === 'entregue') {
      return <CheckCheck size={14} className="tick-gray" />;
    }
    if (status === 'lido') {
      return <CheckCheck size={14} className="tick-blue" />;
    }
    return null;
  };

  const formatWhatsApp = (num) => {
    if (!num) return '';
    return num.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split(' ');
    if (parts.length < 2) return '';
    const timeParts = parts[1].split(':');
    return `${timeParts[0]}:${timeParts[1]}`;
  };

  return (
    <div className="animate-fade-in whatsapp-dashboard-layout glass-panel">
      {/* Sidebar Chats */}
      <div className="whatsapp-sidebar">
        <div className="ws-header">
          <div>
            <h3>Conversas</h3>
            <button 
              type="button"
              onClick={() => setSimulationMode(!simulationMode)}
              style={{
                background: simulationMode ? 'rgba(16, 185, 129, 0.12)' : 'rgba(14, 165, 233, 0.12)',
                color: simulationMode ? 'var(--whatsapp)' : 'var(--primary)',
                border: '1px solid',
                borderColor: simulationMode ? 'rgba(16, 185, 129, 0.3)' : 'rgba(14, 165, 233, 0.3)',
                fontSize: '0.65rem',
                fontWeight: '700',
                padding: '0.2rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
                marginTop: '0.25rem',
                transition: 'all 0.2s ease'
              }}
              title="Clique para alternar entre Modo de Produção (Real) e Modo de Simulação (Testes)"
            >
              {simulationMode ? 'Simulador (Teste)' : 'Produção (Real)'}
            </button>
          </div>
          <button 
            className="btn btn-secondary btn-sm btn-cron-trigger"
            onClick={triggerCronReminders}
            title="Simular execução do Cron de lembretes (08:00 AM) para os agendamentos de amanhã"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
          >
            Simular Cron
          </button>
        </div>

        <div className="ws-chats-list">
          {loadingChats ? (
            <p className="ws-loading">Carregando contatos...</p>
          ) : chats.length === 0 ? (
            <div className="ws-empty">
              <MessageSquare size={32} className="text-muted" />
              <p>Nenhum agendamento com WhatsApp iniciado.</p>
            </div>
          ) : (
            chats.map((c) => (
              <button
                key={c.numero}
                className={`ws-chat-item ${activeChat?.numero === c.numero ? 'active' : ''}`}
                onClick={() => setActiveChat(c)}
              >
                <div className="ws-chat-avatar">
                  <User size={20} />
                </div>
                <div className="ws-chat-info">
                  <div className="ws-info-top">
                    <h4>{c.paciente_nome}</h4>
                    <span className="ws-time">{formatTime(c.ultima_data)}</span>
                  </div>
                  <p className="ws-snippet">{c.ultima_mensagem}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation timeline */}
      <div className="whatsapp-timeline">
        {activeChat ? (
          <>
            {/* Timeline Header */}
            <div className="wt-header">
              <div className="wt-avatar">
                <User size={20} />
              </div>
              <div className="wt-info">
                <h4>{activeChat.paciente_nome}</h4>
                <div className="wt-status">
                  <span className="wt-dot"></span>
                  <span>Paciente: {formatWhatsApp(activeChat.numero)}</span>
                </div>
              </div>
            </div>

            {/* Timeline Messages */}
            <div className="wt-messages-container">
              <div className="wt-encryption-notice" style={{
                background: simulationMode ? 'rgba(245, 158, 11, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                border: simulationMode ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(16, 185, 129, 0.15)',
                color: simulationMode ? 'var(--warning)' : 'var(--whatsapp)'
              }}>
                <Shield size={12} />
                <span>
                  {simulationMode 
                    ? "Modo Simulação: Mensagens enviadas simulam a resposta do Paciente para testar a IA." 
                    : "Canal em Produção: Mensagens enviadas serão entregues ao Paciente real via Webhook N8N."}
                </span>
              </div>

              {loadingMessages && messages.length === 0 ? (
                <p className="wt-loading">Carregando mensagens...</p>
              ) : (
                messages.map((m) => {
                  const isIncoming = m.status_envio === 'recebida';
                  return (
                    <div key={m.id} className={`message-row ${isIncoming ? 'incoming' : 'outgoing'}`}>
                      <div className="message-bubble">
                        <p className="msg-text">{m.mensagem}</p>
                        <div className="msg-meta">
                          <span className="msg-time">{formatTime(m.data_envio)}</span>
                          {!isIncoming && getTickIcon(m.status_envio)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Simulation controls panel */}
            <div className="wt-simulation-controls">
              {simulationMode && (
                <>
                  <div className="quick-replies-label">
                    <span>Simular ação do Paciente:</span>
                  </div>
                  <div className="quick-replies" style={{ marginBottom: '0.25rem' }}>
                    <button 
                      className="btn btn-secondary btn-sm q-btn text-success"
                      onClick={() => simulatePatientReply('Confirmar')}
                    >
                      Responder "CONFIRMAR"
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm q-btn text-danger"
                      onClick={() => simulatePatientReply('Cancelar')}
                    >
                      Responder "CANCELAR"
                    </button>
                    <button 
                      className="btn btn-secondary btn-sm q-btn text-warning"
                      onClick={() => simulatePatientReply('Reagendar')}
                    >
                      Responder "REAGENDAR"
                    </button>
                  </div>
                </>
              )}

              {/* Free Text Input Simulation */}
              <form onSubmit={handleCustomSubmit} className="wt-input-area">
                <input
                  type="text"
                  placeholder={simulationMode ? "Simular resposta do paciente..." : "Escreva uma mensagem para o paciente..."}
                  className="form-control wt-input"
                  value={customReply}
                  onChange={(e) => setCustomReply(e.target.value)}
                />
                <button type="submit" className="btn btn-whatsapp wt-send-btn" disabled={!customReply.trim()}>
                  <Send size={16} /> Enviar
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="wt-no-chat">
            <MessageSquare size={64} className="text-muted" />
            <h3>Nenhuma Conversa Ativa</h3>
            <p>Selecione um paciente na barra lateral ou realize um agendamento para iniciar o chat.</p>
          </div>
        )}
      </div>

      <style>{`
        .whatsapp-dashboard-layout {
          display: flex;
          height: 600px;
          border-radius: var(--radius-lg);
          overflow: hidden;
          margin-bottom: 2.5rem;
          background: rgba(10, 18, 36, 0.9);
          border: 1px solid var(--border-color);
        }

        .whatsapp-sidebar {
          width: 320px;
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.1);
        }

        .ws-header {
          padding: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .ws-header h3 {
          font-size: 1.1rem;
          font-weight: 700;
        }

        .sim-badge {
          background: rgba(16, 185, 129, 0.1);
          color: var(--whatsapp);
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-sm);
          text-transform: uppercase;
          display: inline-block;
          margin-top: 0.25rem;
        }

        .ws-chats-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .ws-loading, .ws-empty {
          padding: 2rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .ws-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          height: 100%;
        }

        .ws-chat-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.5rem;
          background: transparent;
          border: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: background 0.2s;
        }

        .ws-chat-item:hover {
          background: rgba(255, 255, 255, 0.02);
        }

        .ws-chat-item.active {
          background: rgba(255, 255, 255, 0.05);
        }

        .ws-chat-avatar {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .ws-chat-info {
          flex: 1;
          min-width: 0;
        }

        .ws-info-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }

        .ws-info-top h4 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ws-time {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .ws-snippet {
          font-size: 0.8rem;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .whatsapp-timeline {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #0b141a;
          background-image: radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 20px 20px;
          position: relative;
        }

        .wt-header {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          background: rgba(10, 18, 36, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .wt-avatar {
          width: 40px;
          height: 40px;
          background: var(--primary-glow);
          border: 1px solid var(--primary);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
        }

        .wt-info h4 {
          font-size: 0.95rem;
          font-weight: 700;
        }

        .wt-status {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .wt-dot {
          width: 6px;
          height: 6px;
          background-color: var(--whatsapp);
          border-radius: 50%;
        }

        .wt-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .wt-encryption-notice {
          align-self: center;
          background: rgba(245, 158, 11, 0.05);
          border: 1px solid rgba(245, 158, 11, 0.15);
          color: var(--warning);
          padding: 0.4rem 0.8rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          max-width: 90%;
          text-align: center;
        }

        .wt-loading {
          text-align: center;
          color: var(--text-muted);
          padding: 2rem;
        }

        .message-row {
          display: flex;
          width: 100%;
        }

        .message-row.incoming {
          justify-content: flex-start;
        }

        .message-row.outgoing {
          justify-content: flex-end;
        }

        .message-bubble {
          max-width: 65%;
          padding: 0.65rem 0.85rem;
          border-radius: var(--radius-md);
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          box-shadow: var(--shadow-sm);
          line-height: 1.5;
        }

        .incoming .message-bubble {
          background: #202c33;
          color: var(--text-primary);
          border-top-left-radius: 2px;
        }

        .outgoing .message-bubble {
          background: #005c4b;
          color: #e9edef;
          border-top-right-radius: 2px;
        }

        .msg-text {
          font-size: 0.9rem;
          white-space: pre-wrap;
        }

        .msg-meta {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.25rem;
          align-self: flex-end;
        }

        .msg-time {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .tick-gray {
          color: rgba(255, 255, 255, 0.4);
        }

        .tick-blue {
          color: #53bdeb;
        }

        .wt-simulation-controls {
          padding: 1.25rem;
          background: rgba(10, 18, 36, 0.85);
          backdrop-filter: blur(8px);
          border-top: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .quick-replies-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .quick-replies {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .q-btn {
          font-size: 0.75rem;
          padding: 0.4rem 0.8rem;
          border-radius: var(--radius-full);
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(0,0,0,0.2);
        }

        .q-btn:hover {
          background: rgba(255, 255, 255, 0.03);
          transform: none;
        }

        .wt-input-area {
          display: flex;
          gap: 0.75rem;
          margin-top: 0.25rem;
        }

        .wt-input {
          flex: 1;
          height: 38px;
          font-size: 0.85rem;
          background: rgba(0, 0, 0, 0.4);
        }

        .wt-send-btn {
          height: 38px;
          padding: 0 1rem;
          font-size: 0.85rem;
        }

        .wt-no-chat {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          flex: 1;
          color: var(--text-muted);
          text-align: center;
          padding: 2rem;
        }

        .wt-no-chat h3 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        @media (max-width: 768px) {
          .whatsapp-dashboard-layout {
            flex-direction: column;
            height: auto;
          }
          .whatsapp-sidebar {
            width: 100%;
            height: 250px;
          }
          .whatsapp-timeline {
            height: 450px;
          }
        }
      `}</style>
    </div>
  );
}

export default WhatsappSimPanel;
