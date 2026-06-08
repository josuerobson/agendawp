import React, { useState, useEffect } from 'react';
import { Calendar, Clock, User, Stethoscope, CreditCard, Plus, Filter, MessageSquare, AlertCircle, X, CheckCircle2 } from 'lucide-react';

function AgendamentosView({ initialPatient, onClearInitialPatient }) {
  const [agendamentos, setAgendamentos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  
  // Filter States
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('todos'); // 'todos' or 'hoje'
  const [sortField, setSortField] = useState('data_hora'); // Default sort field: data_hora
  const [sortDirection, setSortDirection] = useState('asc'); // Default sort direction: asc

  // Form States
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [pacienteId, setPacienteId] = useState('');
  const [medicoId, setMedicoId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [tipoAtendimento, setTipoAtendimento] = useState('consulta');
  const [tipoPagamento, setTipoPagamento] = useState('convenio');
  const [valorCombinado, setValorCombinado] = useState('');

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgendamentos();
    fetchPacientes();
    fetchMedicos();
  }, []);

  // Monitorar mudança de médico ou data para buscar horários livres
  useEffect(() => {
    if (medicoId && selectedDate) {
      fetchAvailableSlots(medicoId, selectedDate);
    } else {
      setAvailableSlots([]);
      setSelectedTime('');
    }
  }, [medicoId, selectedDate]);

  // Open modal if patient is passed from other screen
  useEffect(() => {
    if (initialPatient && pacientes.length > 0 && medicos.length > 0) {
      const defaultMedId = medicos[0]?.id || '';
      setPacienteId(initialPatient.id.toString());
      setMedicoId(defaultMedId.toString());
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setTipoAtendimento('consulta');
      setTipoPagamento('convenio');
      
      const firstDoc = medicos.find(m => m.id.toString() === defaultMedId.toString());
      const val = firstDoc && firstDoc.valor_consulta !== null && firstDoc.valor_consulta !== undefined 
        ? firstDoc.valor_consulta.toString() 
        : '150';
      setValorCombinado(val);
      
      setError('');
      setSuccess('');
      setShowModal(true);
      onClearInitialPatient();
    }
  }, [initialPatient, pacientes, medicos]);

  // Update valorCombinado when selected doctor changes
  useEffect(() => {
    if (medicoId && medicos.length > 0) {
      const selectedDoc = medicos.find(m => m.id.toString() === medicoId.toString());
      if (selectedDoc) {
        const val = selectedDoc.valor_consulta !== null && selectedDoc.valor_consulta !== undefined 
          ? selectedDoc.valor_consulta.toString() 
          : '150';
        setValorCombinado(val);
      }
    }
  }, [medicoId, medicos]);

  const fetchAgendamentos = async () => {
    try {
      const res = await fetch('/api/agendamentos');
      const data = await res.json();
      setAgendamentos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPacientes = async () => {
    try {
      const res = await fetch('/api/pacientes');
      const data = await res.json();
      setPacientes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMedicos = async () => {
    try {
      const res = await fetch('/api/medicos');
      const data = await res.json();
      setMedicos(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAvailableSlots = async (medId, dateStr) => {
    try {
      const res = await fetch(`/api/disponibilidade/filtrar?medico_id=${medId}&data=${dateStr}`);
      const data = await res.json();
      setAvailableSlots(data);
      if (data.length > 0) {
        setSelectedTime(data[0].hora_inicio);
      } else {
        setSelectedTime('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openModal = () => {
    const defaultMedId = medicos[0]?.id || '';
    setPacienteId(pacientes[0]?.id || '');
    setMedicoId(defaultMedId.toString());
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setTipoAtendimento('consulta');
    setTipoPagamento('convenio');
    
    const firstDoc = medicos.find(m => m.id.toString() === defaultMedId.toString());
    const val = firstDoc && firstDoc.valor_consulta !== null && firstDoc.valor_consulta !== undefined 
      ? firstDoc.valor_consulta.toString() 
      : '150';
    setValorCombinado(val);
    
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!pacienteId || !medicoId || !selectedDate || !selectedTime) {
      setError('Preencha todos os campos obrigatórios. Certifique-se de que há um horário selecionado.');
      return;
    }

    const payload = {
      paciente_id: parseInt(pacienteId),
      medico_id: parseInt(medicoId),
      data_hora: `${selectedDate} ${selectedTime}`,
      tipo_atendimento: tipoAtendimento,
      tipo_pagamento: tipoPagamento,
      valor_combinado: parseFloat(valorCombinado || 0)
    };

    try {
      const res = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Erro ao criar agendamento');

      setSuccess('Agendamento criado com sucesso! Notificação do WhatsApp enviada.');
      setTimeout(() => {
        setShowModal(false);
        fetchAgendamentos();
      }, 1500);

    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/agendamentos/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error('Erro ao atualizar status');
      fetchAgendamentos();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja deletar este agendamento? O horário de disponibilidade do médico será reaberto.')) {
      try {
        const res = await fetch(`/api/agendamentos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao deletar agendamento');
        fetchAgendamentos();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // Filtrar
  const filteredAgendamentos = agendamentos.filter((a) => {
    const matchSearch = a.paciente_nome.toLowerCase().includes(search.toLowerCase()) || 
                        a.medico_nome.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'todos' ? true : a.status_agendamento === statusFilter;
    
    let matchDate = true;
    if (dateFilter === 'hoje') {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const todayStr = `${yyyy}-${mm}-${dd}`;
      matchDate = a.data_hora.startsWith(todayStr);
    }
    
    return matchSearch && matchStatus && matchDate;
  });

  // Ordenar
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedAgendamentos = [...filteredAgendamentos].sort((a, b) => {
    let valA, valB;
    
    switch (sortField) {
      case 'paciente_nome':
        valA = a.paciente_nome.toLowerCase();
        valB = b.paciente_nome.toLowerCase();
        break;
      case 'medico_nome':
        valA = a.medico_nome.toLowerCase();
        valB = b.medico_nome.toLowerCase();
        break;
      case 'data_hora':
        valA = a.data_hora;
        valB = b.data_hora;
        break;
      case 'tipo_atendimento':
        valA = a.tipo_atendimento.toLowerCase();
        valB = b.tipo_atendimento.toLowerCase();
        // If equal, sub-sort by valor_combinado
        if (valA === valB) {
          valA = a.valor_combinado;
          valB = b.valor_combinado;
        }
        break;
      case 'status_agendamento':
        valA = a.status_agendamento.toLowerCase();
        valB = b.status_agendamento.toLowerCase();
        break;
      default:
        valA = a.data_hora;
        valB = b.data_hora;
    }
    
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getSortIndicator = (field) => {
    if (sortField !== field) {
      return <span className="sort-indicator neutral">↕</span>;
    }
    return sortDirection === 'asc' ? 
      <span className="sort-indicator active">▲</span> : 
      <span className="sort-indicator active">▼</span>;
  };

  const formatDate = (dateTimeStr) => {
    // dateTimeStr: YYYY-MM-DD HH:MM
    const parts = dateTimeStr.split(' ');
    const dateParts = parts[0].split('-');
    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
  };

  const formatTime = (dateTimeStr) => {
    return dateTimeStr.split(' ')[1];
  };

  const formatWhatsApp = (num) => {
    if (!num) return '';
    return num.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  };

  return (
    <div className="animate-fade-in agendamentos-view-container">
      {/* Filtering Header panel */}
      <div className="view-actions glass-panel">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Pesquisar por paciente ou médico..." 
            className="form-control search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filters-group">
          <div className="filter-select-wrapper">
            <Calendar size={14} className="filter-icon" />
            <select 
              className="form-control filter-select"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="todos">Todas as Datas</option>
              <option value="hoje">Hoje</option>
            </select>
          </div>

          <div className="filter-select-wrapper">
            <Filter size={14} className="filter-icon" />
            <select 
              className="form-control filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="todos">Todos os Status</option>
              <option value="pendente">Pendentes</option>
              <option value="solicitado">Solicitados</option>
              <option value="confirmado">Confirmados</option>
              <option value="aguardando">Aguardando</option>
              <option value="chamado">Chamados</option>
              <option value="realizado">Realizados</option>
              <option value="cancelado">Cancelados</option>
              <option value="reagendado">Reagendados</option>
              <option value="nao_compareceu">Não Compareceram</option>
            </select>
          </div>

          <button className="btn btn-primary" onClick={openModal} disabled={pacientes.length === 0 || medicos.length === 0}>
            <Plus size={18} /> Novo Agendamento
          </button>
        </div>
      </div>

      {/* Main Table view */}
      <div className="glass-panel table-section">
        {loading ? (
          <p className="loading-text">Carregando agendamentos...</p>
        ) : sortedAgendamentos.length === 0 ? (
          <div className="empty-state">
            <Calendar size={40} className="text-muted" />
            <p>Nenhum agendamento encontrado.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('paciente_nome')} className="sortable-th">
                    <div className="th-content">
                      Paciente / WhatsApp {getSortIndicator('paciente_nome')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('medico_nome')} className="sortable-th">
                    <div className="th-content">
                      Médico / Especialidade {getSortIndicator('medico_nome')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('data_hora')} className="sortable-th">
                    <div className="th-content">
                      Data & Horário {getSortIndicator('data_hora')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('tipo_atendimento')} className="sortable-th">
                    <div className="th-content">
                      Tipo / Valor {getSortIndicator('tipo_atendimento')}
                    </div>
                  </th>
                  <th onClick={() => handleSort('status_agendamento')} className="sortable-th">
                    <div className="th-content">
                      Status Agendamento {getSortIndicator('status_agendamento')}
                    </div>
                  </th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgendamentos.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="paciente-td">
                        <span className="p-name">{a.paciente_nome}</span>
                        <span className="p-whats">
                          <MessageSquare size={12} className="text-whatsapp" />
                          {formatWhatsApp(a.paciente_whatsapp)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="medico-td">
                        <span className="m-name">{a.medico_nome}</span>
                        <span className="m-spec">{a.especialidade}</span>
                      </div>
                    </td>
                    <td>
                      <div className="datetime-td">
                        <span className="dt-date">
                          <Calendar size={12} /> {formatDate(a.data_hora)}
                        </span>
                        <span className="dt-time">
                          <Clock size={12} /> {formatTime(a.data_hora)}h
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="pricing-td">
                        <span className="at-type">{a.tipo_atendimento === 'consulta' ? 'Consulta' : 'Exame'}</span>
                        <span className="pay-value">
                          {a.tipo_pagamento === 'convenio' ? 'Convênio' : `R$ ${a.valor_combinado.toFixed(2)}`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <select
                        className={`status-select status-${a.status_agendamento}`}
                        value={a.status_agendamento}
                        onChange={(e) => handleUpdateStatus(a.id, e.target.value)}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="solicitado">Solicitado</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="aguardando">Aguardando</option>
                        <option value="chamado">Chamado</option>
                        <option value="realizado">Realizado</option>
                        <option value="cancelado">Cancelado</option>
                        <option value="reagendado">Reagendado</option>
                        <option value="nao_compareceu">Não Compareceu</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-action delete" onClick={() => handleDelete(a.id)}>
                        Deletar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scheduling Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale-up" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3>Novo Agendamento</h3>
              <button className="btn-close" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            {error && (
              <div className="error-alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="success-alert">
                <CheckCircle2 size={16} />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleCreateAppointment} className="modal-form">
              {/* Paciente */}
              <div className="form-group">
                <label className="form-label">Selecionar Paciente *</label>
                <div className="select-input-icon">
                  <User size={16} className="input-icon" />
                  <select 
                    className="form-control icon-padding"
                    value={pacienteId}
                    onChange={(e) => setPacienteId(e.target.value)}
                    required
                  >
                    {pacientes.map(p => (
                      <option key={p.id} value={p.id}>{p.nome} ({p.cpf})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Médico */}
              <div className="form-group">
                <label className="form-label">Selecionar Médico *</label>
                <div className="select-input-icon">
                  <Stethoscope size={16} className="input-icon" />
                  <select 
                    className="form-control icon-padding"
                    value={medicoId}
                    onChange={(e) => setMedicoId(e.target.value)}
                    required
                  >
                    {medicos.map(m => (
                      <option key={m.id} value={m.id}>{m.nome} ({m.especialidade})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data e Horário Disponível */}
              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-label">Data de Atendimento *</label>
                  <input 
                    type="date" 
                    className="form-control"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Horários Livres *</label>
                  <select 
                    className="form-control"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    required
                  >
                    {availableSlots.length === 0 ? (
                      <option value="">Nenhum horário livre</option>
                    ) : (
                      availableSlots.map(s => (
                        <option key={s.id} value={s.hora_inicio}>{s.hora_inicio}h</option>
                      ))
                    )}
                  </select>
                  {availableSlots.length === 0 && selectedDate && medicoId && (
                    <span className="warning-text">Configure horários em 'Médicos' primeiro.</span>
                  )}
                </div>
              </div>

              {/* Tipo de atendimento e pagamento */}
              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-label">Tipo de Atendimento *</label>
                  <select 
                    className="form-control"
                    value={tipoAtendimento}
                    onChange={(e) => setTipoAtendimento(e.target.value)}
                    required
                  >
                    <option value="consulta">Consulta</option>
                    <option value="exame">Exame</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Forma de Pagamento *</label>
                  <select 
                    className="form-control"
                    value={tipoPagamento}
                    onChange={(e) => setTipoPagamento(e.target.value)}
                    required
                  >
                    <option value="convenio">Convênio Médico</option>
                    <option value="particular">Dinheiro / Particular</option>
                    <option value="pix">PIX</option>
                    <option value="cartao">Cartão de Crédito/Débito</option>
                  </select>
                </div>
              </div>

              {/* Valor cobrado */}
              {tipoPagamento !== 'convenio' && (
                <div className="form-group">
                  <label className="form-label">Valor Combinado (R$) *</label>
                  <div className="select-input-icon">
                    <CreditCard size={16} className="input-icon" />
                    <input 
                      type="number" 
                      className="form-control icon-padding"
                      value={valorCombinado}
                      onChange={(e) => setValorCombinado(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={availableSlots.length === 0}>
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .agendamentos-view-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .filters-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .filter-select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .filter-icon {
          position: absolute;
          left: 0.75rem;
          color: var(--text-muted);
          pointer-events: none;
        }

        .filter-select {
          padding-left: 2rem !important;
          width: 170px;
          height: 38px;
          padding-top: 0.25rem;
          padding-bottom: 0.25rem;
        }

        .th-content {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .sort-indicator {
          font-size: 0.75rem;
          opacity: 0.4;
          transition: all 0.2s ease;
        }

        .sort-indicator.active {
          opacity: 1;
          color: var(--primary);
          font-weight: bold;
        }

        .sortable-th {
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s ease;
        }

        .sortable-th:hover {
          background: rgba(255, 255, 255, 0.05) !important;
        }

        .paciente-td, .medico-td, .datetime-td, .pricing-td {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .p-name, .m-name {
          font-weight: 600;
          color: var(--text-primary);
        }

        .p-whats, .m-spec, .dt-date, .dt-time, .at-type, .pay-value {
          font-size: 0.8rem;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--text-secondary);
        }

        .p-whats svg, .dt-date svg, .dt-time svg {
          flex-shrink: 0;
        }

        .dt-date, .dt-time {
          color: var(--text-primary);
        }
        
        .dt-time {
          font-weight: 700;
          color: var(--primary);
        }

        .at-type {
          text-transform: capitalize;
          font-weight: 600;
          color: var(--text-primary);
        }

        .pay-value {
          color: var(--text-muted);
        }

        /* Interactive Status Dropdown */
        .status-select {
          border: 1px solid var(--border-color);
          border-radius: var(--radius-full);
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          cursor: pointer;
          outline: none;
          background-position: right 0.5rem center;
          transition: all 0.2s ease;
        }

        .status-select.status-pendente {
          background-color: rgba(245, 158, 11, 0.12);
          color: var(--warning);
          border-color: rgba(245, 158, 11, 0.2);
        }

        .status-select.status-solicitado {
          background-color: rgba(245, 158, 11, 0.12);
          color: var(--warning);
          border-color: rgba(245, 158, 11, 0.2);
        }

        .status-select.status-confirmado {
          background-color: rgba(16, 185, 129, 0.12);
          color: var(--success);
          border-color: rgba(16, 185, 129, 0.2);
        }

        .status-select.status-aguardando {
          background-color: rgba(20, 184, 166, 0.12);
          color: #14b8a6;
          border-color: rgba(20, 184, 166, 0.2);
        }

        .status-select.status-chamado {
          background-color: rgba(236, 72, 153, 0.12);
          color: #ec4899;
          border-color: rgba(236, 72, 153, 0.2);
        }

        .status-select.status-realizado {
          background-color: rgba(59, 130, 246, 0.12);
          color: var(--info);
          border-color: rgba(59, 130, 246, 0.2);
        }

        .status-select.status-cancelado {
          background-color: rgba(239, 68, 68, 0.12);
          color: var(--danger);
          border-color: rgba(239, 68, 68, 0.2);
        }

        .status-select.status-reagendado {
          background-color: rgba(139, 92, 246, 0.12);
          color: #a78bfa;
          border-color: rgba(139, 92, 246, 0.2);
        }

        .status-select.status-nao_compareceu {
          background-color: rgba(100, 116, 139, 0.12);
          color: #94a3b8;
          border-color: rgba(100, 116, 139, 0.2);
        }

        .status-select option {
          background-color: var(--bg-popover);
          color: var(--text-primary);
        }

        /* Modal Select with icon */
        .select-input-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          color: var(--text-muted);
          pointer-events: none;
        }

        .icon-padding {
          padding-left: 2.5rem !important;
        }

        .warning-text {
          font-size: 0.75rem;
          color: var(--warning);
          margin-top: 0.25rem;
        }

        .success-alert {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: var(--success);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }

        @media (max-width: 768px) {
          .filters-group {
            flex-direction: column;
            align-items: stretch;
            width: 100%;
          }
          .filter-select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default AgendamentosView;
