import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Send,
  ArrowRight,
  TrendingUp,
  MessageSquare,
  DollarSign,
  Activity
} from 'lucide-react';

function Dashboard({ setActiveTab }) {
  const [stats, setStats] = useState({
    agendamentosHoje: 0,
    pendentesHoje: 0,
    medicosAtivos: 0,
    whatsappDelivery: 100,
    whatsappRead: 100,
    faturamentoHoje: 0,
    consultasConvenio: 0,
    consultasParticular: 0,
    financeiroBreakdown: []
  });
  const [proximos, setProximos] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/dashboard/stats');
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.proximosAgendamentos) setProximos(data.proximosAgendamentos);
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // Atualizar a cada 6 segundos para pegar mudanças automáticas da simulação do WhatsApp
    const interval = setInterval(fetchDashboardData, 6000);
    return () => clearInterval(interval);
  }, []);

  const formatWhatsApp = (num) => {
    if (!num) return '';
    return num.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  };

  return (
    <div className="animate-fade-in">
      {/* Welcome Hero Banner */}
      <div className="hero-banner glass-panel">
        <div className="hero-content">
          <h2>Bem-vindo ao Painel Agenda WP!</h2>
          <p>
            Gerencie consultas e exames de forma inteligente. Nosso sistema envia
            mensagens automáticas de confirmação pelo WhatsApp e processa as respostas
            dos pacientes de forma autônoma.
          </p>
          <div className="hero-buttons">
            <button className="btn btn-primary" onClick={() => setActiveTab('agendamentos')}>
              Agendar Paciente <ArrowRight size={16} />
            </button>
            <button className="btn btn-whatsapp" onClick={() => setActiveTab('whatsapp')}>
              Abrir Simulador WhatsApp <MessageSquare size={16} />
            </button>
          </div>
        </div>
        <div className="hero-image-wrapper">
          <img src="/clinic_hero.png" alt="Clinical Illustration" className="hero-img" />
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid-stats">
        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper blue">
            <Calendar size={22} />
          </div>
          <div className="stat-data">
            <h3>{loading ? '...' : stats.agendamentosHoje}</h3>
            <span>Consultas Hoje</span>
          </div>
          <span className="stat-badge positive"><TrendingUp size={12} /> Diário</span>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper orange">
            <Clock size={22} />
          </div>
          <div className="stat-data">
            <h3>{loading ? '...' : stats.pendentesHoje}</h3>
            <span>Pendentes</span>
          </div>
          <span className="stat-badge warning">Respostas</span>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper green">
            <DollarSign size={22} />
          </div>
          <div className="stat-data">
            <h3>{loading ? '...' : `R$ ${stats.faturamentoHoje.toFixed(2)}`}</h3>
            <span>Faturamento Hoje</span>
          </div>
          <span className="stat-badge positive">Particular</span>
        </div>

        <div className="stat-card glass-panel">
          <div className="stat-icon-wrapper teal">
            <Send size={22} />
          </div>
          <div className="stat-data">
            <h3>{loading ? '...' : `${stats.whatsappDelivery}%`}</h3>
            <span>Entrega WhatsApp</span>
          </div>
          <span className="stat-badge positive">Leitura: {stats.whatsappRead}%</span>
        </div>
      </div>

      {/* Table & Timeline Group */}
      <div className="grid-cols-2">
        {/* Next Appointments List */}
        <div className="card-section glass-panel">
          <div className="card-header">
            <h3>Próximos Agendamentos</h3>
            <button className="btn-text" onClick={() => setActiveTab('agendamentos')}>Ver todos</button>
          </div>
          
          {loading ? (
            <p className="loading-text">Carregando agendamentos...</p>
          ) : proximos.length === 0 ? (
            <div className="empty-state">
              <Calendar size={40} className="text-muted" />
              <p>Nenhum agendamento futuro encontrado.</p>
            </div>
          ) : (
            <div className="timeline-list">
              {proximos.map((agend) => (
                <div key={agend.id} className="timeline-item">
                  <div className="timeline-badge-wrapper">
                    <div className={`timeline-indicator status-${agend.status_agendamento}`}></div>
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-meta">
                      <span className="time-tag">
                        {agend.data_hora.split(' ')[1]}h - {agend.data_hora.split(' ')[0].split('-').reverse().join('/')}
                      </span>
                      <span className={`badge badge-${agend.status_agendamento}`}>
                        {agend.status_agendamento}
                      </span>
                    </div>
                    <h4>{agend.paciente_nome}</h4>
                    <p className="subtitle">
                      {agend.tipo_atendimento === 'consulta' ? 'Consulta' : 'Exame'} com <strong>{agend.medico_nome}</strong> ({agend.especialidade})
                    </p>
                    <div className="whatsapp-info">
                      <MessageSquare size={12} className="text-whatsapp" />
                      <span>{formatWhatsApp(agend.paciente_whatsapp)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Financial details & Shortcuts */}
        <div className="card-section glass-panel">
          <div className="card-header">
            <h3>Faturamento & Convênios</h3>
          </div>
          
          <div className="financial-panel">
            <div className="financial-row">
              <div className="fin-type">
                <span className="bullet particular"></span>
                <span>Consultas Particulares/PIX</span>
              </div>
              <div className="fin-values">
                <span>{stats.consultasParticular} agendamentos</span>
                <strong>R$ {stats.faturamentoHoje.toFixed(2)}</strong>
              </div>
            </div>

            <div className="financial-row">
              <div className="fin-type">
                <span className="bullet convenio"></span>
                <span>Consultas via Convênios</span>
              </div>
              <div className="fin-values">
                <span>{stats.consultasConvenio} agendamentos</span>
                <strong className="text-primary">Faturamento Faturado</strong>
              </div>
            </div>

            <div className="financial-total">
              <span>Total Gerado (Direto)</span>
              <h2>R$ {stats.faturamentoHoje.toFixed(2)}</h2>
            </div>
          </div>

          <div className="card-header" style={{ marginTop: '0.5rem' }}>
            <h3>Atalhos Rápidos</h3>
          </div>
          <div className="shortcuts-grid">
            <button className="shortcut-btn" onClick={() => setActiveTab('pacientes')}>
              <Users size={20} />
              <h4>Novo Paciente</h4>
            </button>
            <button className="shortcut-btn" onClick={() => setActiveTab('medicos')}>
              <Calendar size={20} />
              <h4>Configurar Agenda</h4>
            </button>
            <button className="shortcut-btn" onClick={() => setActiveTab('convenios')}>
              <Activity size={20} />
              <h4>Planos Convênios</h4>
            </button>
            <button className="shortcut-btn" onClick={() => setActiveTab('whatsapp')}>
              <MessageSquare size={20} />
              <h4>WhatsApp</h4>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .hero-banner {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2.5rem;
          margin-bottom: 2.5rem;
          background: linear-gradient(135deg, rgba(17, 28, 54, 0.6) 0%, rgba(10, 18, 36, 0.4) 100%);
          overflow: hidden;
          border-radius: var(--radius-lg);
        }

        .hero-content {
          max-width: 60%;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .hero-content h2 {
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.04em;
          background: linear-gradient(90deg, #38bdf8, #34d399);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .hero-content p {
          font-size: 1rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        .hero-buttons {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .hero-image-wrapper {
          max-width: 300px;
          margin-right: 2rem;
        }

        .hero-img {
          width: 100%;
          height: auto;
          object-fit: contain;
          filter: drop-shadow(0 10px 20px rgba(0,0,0,0.3));
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 1.5rem;
          position: relative;
          overflow: hidden;
        }

        .stat-icon-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 50px;
          height: 50px;
          border-radius: var(--radius-md);
          color: white;
        }

        .stat-icon-wrapper.blue { background: rgba(14, 165, 233, 0.15); color: var(--primary); border: 1px solid rgba(14, 165, 233, 0.3); }
        .stat-icon-wrapper.orange { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }
        .stat-icon-wrapper.green { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
        .stat-icon-wrapper.teal { background: rgba(20, 184, 166, 0.15); color: #14b8a6; border: 1px solid rgba(20, 184, 166, 0.3); }

        .stat-data h3 {
          font-size: 1.75rem;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }

        .stat-data span {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .stat-badge {
          position: absolute;
          top: 1rem;
          right: 1rem;
          font-size: 0.65rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.15rem 0.4rem;
          border-radius: var(--radius-full);
          text-transform: uppercase;
        }

        .stat-badge.positive { background: rgba(16, 185, 129, 0.08); color: var(--success); }
        .stat-badge.warning { background: rgba(245, 158, 11, 0.08); color: var(--warning); }

        .card-section {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-height: 440px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-header h3 {
          font-size: 1.1rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .btn-text {
          background: transparent;
          border: none;
          color: var(--primary);
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: color 0.2s;
        }

        .btn-text:hover {
          color: var(--primary-hover);
          text-decoration: underline;
        }

        .loading-text {
          color: var(--text-secondary);
          text-align: center;
          padding: 2rem;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          flex: 1;
          color: var(--text-muted);
          font-size: 0.9rem;
        }

        .timeline-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .timeline-item {
          display: flex;
          gap: 1rem;
          position: relative;
        }

        .timeline-item:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 7px;
          top: 20px;
          bottom: -20px;
          width: 2px;
          background: var(--border-color);
        }

        .timeline-badge-wrapper {
          display: flex;
          align-items: flex-start;
          padding-top: 0.25rem;
        }

        .timeline-indicator {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 3px solid #0d1526;
          box-shadow: 0 0 0 1px var(--text-muted);
          background: var(--text-muted);
        }

        .timeline-indicator.status-confirmado { background: var(--success); box-shadow: 0 0 0 1px var(--success); }
        .timeline-indicator.status-solicitado { background: var(--warning); box-shadow: 0 0 0 1px var(--warning); }
        .timeline-indicator.status-pendente { background: var(--warning); box-shadow: 0 0 0 1px var(--warning); }
        .timeline-indicator.status-cancelado { background: var(--danger); box-shadow: 0 0 0 1px var(--danger); }
        .timeline-indicator.status-realizado { background: var(--info); box-shadow: 0 0 0 1px var(--info); }
        .timeline-indicator.status-reagendado { background: #8b5cf6; box-shadow: 0 0 0 1px #8b5cf6; }
        .timeline-indicator.status-nao_compareceu { background: #64748b; box-shadow: 0 0 0 1px #64748b; }
        .timeline-indicator.status-aguardando { background: #14b8a6; box-shadow: 0 0 0 1px #14b8a6; }
        .timeline-indicator.status-chamado { background: #ec4899; box-shadow: 0 0 0 1px #ec4899; }

        .timeline-content {
          flex: 1;
          background: rgba(0, 0, 0, 0.15);
          padding: 1rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
        }

        .timeline-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .time-tag {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--primary);
          background: rgba(14, 165, 233, 0.08);
          padding: 0.15rem 0.4rem;
          border-radius: var(--radius-sm);
        }

        .timeline-content h4 {
          font-size: 0.95rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .timeline-content .subtitle {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .whatsapp-info {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        /* Financial Panel styling */
        .financial-panel {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .financial-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
        }

        .fin-type {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .bullet {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .bullet.particular { background-color: var(--success); }
        .bullet.convenio { background-color: var(--primary); }

        .fin-values {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .fin-values span {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .financial-total {
          border-top: 1px dashed var(--border-color);
          padding-top: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .financial-total h2 {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--success);
          letter-spacing: -0.02em;
        }

        .shortcuts-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }

        .shortcut-btn {
          background: rgba(255, 255, 255, 0.015);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 1rem 0.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.4rem;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-primary);
        }

        .shortcut-btn svg {
          color: var(--primary);
          transition: transform 0.2s ease;
        }

        .shortcut-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: var(--text-muted);
          transform: translateY(-2px);
        }

        .shortcut-btn h4 {
          font-size: 0.75rem;
          font-weight: 600;
        }

        @media (max-width: 1200px) {
          .hero-banner {
            flex-direction: column-reverse;
            align-items: flex-start;
            gap: 1.5rem;
          }
          .hero-content {
            max-width: 100%;
          }
          .hero-image-wrapper {
            margin-right: 0;
            max-width: 200px;
          }
        }

        @media (max-width: 768px) {
          .shortcuts-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

export default Dashboard;
