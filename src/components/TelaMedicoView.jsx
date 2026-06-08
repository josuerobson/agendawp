import React, { useState, useEffect } from 'react';
import { Stethoscope, LogIn, Bell, Users, Clock, ShieldAlert, Volume2, RefreshCw, FileText, CalendarPlus, Save, X, History, FolderSearch } from 'lucide-react';

function TelaMedicoView() {
  const [medicos, setMedicos] = useState([]);
  const [salas, setSalas] = useState([]);
  const [selectedMedico, setSelectedMedico] = useState(null);
  const [selectedSalaId, setSelectedSalaId] = useState('');
  
  const [waitlist, setWaitlist] = useState([]);
  const [calledList, setCalledList] = useState([]);
  const [loadingWaitlist, setLoadingWaitlist] = useState(false);
  const [callingId, setCallingId] = useState(null);

  // Estados do Prontuário do Paciente e Retorno
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [observacoes, setObservacoes] = useState('');
  const [orientacoesReagendamento, setOrientacoesReagendamento] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnSlots, setReturnSlots] = useState([]);
  const [selectedReturnSlotId, setSelectedReturnSlotId] = useState('');
  const [schedulingReturn, setSchedulingReturn] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [availableDates, setAvailableDates] = useState([]);

  // Estados do Histórico Clínico do Paciente
  const [historyPatient, setHistoryPatient] = useState(null);
  const [patientHistoryList, setPatientHistoryList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchMedicos();
    fetchSalas();
  }, []);

  // Monitor waitlist and called list for the selected doctor
  useEffect(() => {
    let interval;
    if (selectedMedico) {
      fetchWaitlist();
      fetchCalledToday();
      interval = setInterval(() => {
        fetchWaitlist();
        fetchCalledToday();
      }, 3000); // Poll every 3 seconds
    } else {
      setWaitlist([]);
      setCalledList([]);
    }
    return () => clearInterval(interval);
  }, [selectedMedico]);

  const fetchMedicos = async () => {
    try {
      const res = await fetch('/api/medicos');
      const data = await res.json();
      setMedicos(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSalas = async () => {
    try {
      const res = await fetch('/api/salas');
      const data = await res.json();
      setSalas(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWaitlist = async () => {
    if (!selectedMedico) return;
    try {
      setLoadingWaitlist(true);
      const res = await fetch('/api/agendamentos/aguardando');
      const data = await res.json();
      // Filtrar apenas agendamentos destinados ao médico selecionado
      const filtered = data.filter(a => a.medico_id === selectedMedico.id);
      setWaitlist(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingWaitlist(false);
    }
  };

  const fetchCalledToday = async () => {
    if (!selectedMedico) return;
    try {
      const res = await fetch(`/api/chamadas/medico/${selectedMedico.id}/hoje`);
      const data = await res.json();
      setCalledList(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectMedico = (med) => {
    setSelectedMedico(med);
    setSelectedSalaId(med.sala_id || '');
  };

  const handleUpdateSala = async (salaId) => {
    if (!selectedMedico) return;
    setSelectedSalaId(salaId);
    try {
      const res = await fetch(`/api/medicos/${selectedMedico.id}/sala`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sala_id: salaId ? parseInt(salaId) : null })
      });
      if (!res.ok) throw new Error('Erro ao atualizar sala');
      
      // Atualizar objeto médico em memória
      setSelectedMedico(prev => ({ ...prev, sala_id: salaId ? parseInt(salaId) : null }));
      // Recarregar médicos para sincronizar sala_id
      fetchMedicos();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCallPatient = async (agendamentoId) => {
    if (!selectedSalaId) {
      alert('Selecione sua sala de atendimento antes de chamar o paciente.');
      return;
    }

    setCallingId(agendamentoId);
    try {
      const res = await fetch('/api/chamadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agendamento_id: agendamentoId })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro ao chamar paciente');

      // Recarregar fila e chamados
      fetchWaitlist();
      fetchCalledToday();
    } catch (err) {
      alert(err.message);
    } finally {
      setCallingId(null);
    }
  };

  const formatTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    const parts = dateTimeStr.split(' ');
    if (parts.length < 2) return '';
    return parts[1].substring(0, 5); // Retorna "HH:MM"
  };

  // Buscar slots livres para agendamento de retorno
  useEffect(() => {
    if (selectedMedico && selectedAppt && returnDate) {
      fetchReturnSlots();
    } else {
      setReturnSlots([]);
      setSelectedReturnSlotId('');
    }
  }, [returnDate, selectedAppt, selectedMedico]);

  const fetchReturnSlots = async () => {
    try {
      const res = await fetch(`/api/disponibilidade/filtrar?medico_id=${selectedMedico.id}&data=${returnDate}`);
      const data = await res.json();
      setReturnSlots(data);
    } catch (err) {
      console.error('Erro ao buscar slots de retorno:', err);
    }
  };

  const fetchAvailableDates = async () => {
    if (!selectedMedico) return;
    try {
      const res = await fetch(`/api/medicos/${selectedMedico.id}/datas-disponiveis`);
      const data = await res.json();
      setAvailableDates(data);
    } catch (err) {
      console.error('Erro ao buscar datas com disponibilidade:', err);
    }
  };

  const handleOpenProntuario = (appt) => {
    setSelectedAppt(appt);
    setObservacoes(appt.observacoes || '');
    setOrientacoesReagendamento(appt.orientacoes_reagendamento || '');
    setReturnDate('');
    setReturnSlots([]);
    setSelectedReturnSlotId('');
    fetchAvailableDates();
  };

  const handleSaveDetails = async () => {
    if (!selectedAppt) return;
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/agendamentos/${selectedAppt.agendamento_id}/detalhes-atendimento`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observacoes,
          orientacoes_reagendamento: orientacoesReagendamento
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar detalhes');

      alert('Detalhes do atendimento salvos com sucesso!');
      setSelectedAppt(null);
      fetchCalledToday(); // Recarregar chamados para atualizar dados em memória
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const handleScheduleReturn = async () => {
    if (!selectedAppt || !selectedReturnSlotId) {
      alert('Selecione um horário disponível para o retorno.');
      return;
    }
    const slot = returnSlots.find(s => s.id === parseInt(selectedReturnSlotId));
    if (!slot) return;

    setSchedulingReturn(true);
    try {
      const res = await fetch('/api/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paciente_id: selectedAppt.paciente_id,
          medico_id: selectedMedico.id,
          data_hora: `${slot.data} ${slot.hora_inicio}`,
          tipo_atendimento: 'consulta',
          tipo_pagamento: selectedAppt.tipo_pagamento || 'particular',
          valor_combinado: 0.0 // Visita de retorno
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao agendar retorno');

      alert('Visita de retorno agendada com sucesso!');
      setReturnDate('');
      setReturnSlots([]);
      setSelectedReturnSlotId('');
      fetchAvailableDates();
    } catch (err) {
      alert(err.message);
    } finally {
      setSchedulingReturn(false);
    }
  };

  const handleOpenHistory = async (patient) => {
    setHistoryPatient(patient);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/pacientes/${patient.paciente_id}/historico-atendimentos`);
      const data = await res.json();
      setPatientHistoryList(data);
    } catch (err) {
      console.error('Erro ao buscar histórico do paciente:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleLogout = () => {
    setSelectedMedico(null);
    setSelectedSalaId('');
    setWaitlist([]);
    setCalledList([]);
    setHistoryPatient(null);
    setPatientHistoryList([]);
  };

  return (
    <div className="animate-fade-in tela-medico-container">
      {!selectedMedico ? (
        /* Tela de Login/Seleção do Médico */
        <div className="glass-panel login-card">
          <div className="login-header">
            <div className="icon-badge">
              <Stethoscope size={30} />
            </div>
            <h2>Console Clínico do Médico</h2>
            <p>Selecione seu nome para gerenciar suas chamadas e sala de atendimento.</p>
          </div>

          <div className="medicos-selection-grid">
            {medicos.map((med) => (
              <button key={med.id} className="med-select-btn" onClick={() => handleSelectMedico(med)}>
                <div className="med-avatar">👨‍⚕️</div>
                <div className="med-info">
                  <h4>{med.nome}</h4>
                  <span>{med.especialidade}</span>
                </div>
                <LogIn size={18} className="arrow-login" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Painel de Controle Ativo do Médico */
        <div className="doctor-active-console">
          {/* Header Panel */}
          <div className="glass-panel console-header-card">
            <div className="doc-identity">
              <span className="doc-avatar-large">👨‍⚕️</span>
              <div>
                <h2>{selectedMedico.nome}</h2>
                <span className="doc-specialty">{selectedMedico.especialidade}</span>
              </div>
            </div>

            <div className="room-control-wrapper">
              <label className="form-label">Minha Sala / Consultório *</label>
              <select 
                className="form-control room-select"
                value={selectedSalaId}
                onChange={(e) => handleUpdateSala(e.target.value)}
              >
                <option value="">Selecione sua sala...</option>
                {salas.map(s => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
              {!selectedSalaId && (
                <span className="warning-text">⚠️ Defina sua sala para poder chamar.</span>
              )}
            </div>

            <button className="btn btn-secondary logout-btn" onClick={handleLogout}>
              Sair
            </button>
          </div>

          {!selectedSalaId ? (
            <div className="glass-panel warning-empty-state">
              <ShieldAlert size={40} className="text-warning" />
              <h4>Selecione um Consultório</h4>
              <p>Para visualizar e chamar os pacientes, selecione o consultório em que você está atendendo no seletor acima.</p>
            </div>
          ) : (
            <div className="doctor-panels-grid">
              {/* Fila de Espera */}
              <div className="glass-panel queue-card">
                <div className="queue-header">
                  <div className="title-area">
                    <Users size={20} className="text-primary" />
                    <h3>Fila de Espera (Pacientes Aguardando)</h3>
                  </div>
                  <span className="queue-count">{waitlist.length} pacientes</span>
                </div>

                {waitlist.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={40} className="text-muted" />
                    <h4>Fila Vazia</h4>
                    <p>Nenhum paciente aguardando atendimento para você neste momento.</p>
                  </div>
                ) : (
                  <div className="waitlist-grid">
                    {waitlist.map((patient) => {
                      const time = patient.data_hora.split(' ')[1];
                      return (
                        <div key={patient.id} className="patient-queue-card">
                          <div className="patient-details">
                            <div className="time-badge">{time}h</div>
                            <div className="pat-meta">
                              <h4>{patient.paciente_nome}</h4>
                              <span className="type-badge">{patient.tipo_atendimento === 'consulta' ? 'Consulta' : 'Exame'}</span>
                            </div>
                          </div>
                          <div className="waitlist-actions-group">
                            <button 
                              type="button"
                              className="btn btn-secondary history-btn"
                              onClick={() => handleOpenHistory(patient)}
                            >
                              <History size={14} /> Histórico
                            </button>
                            
                            <button 
                              className="btn btn-primary call-btn" 
                              onClick={() => handleCallPatient(patient.id)}
                              disabled={callingId === patient.id}
                            >
                              <Bell size={16} /> 
                              {callingId === patient.id ? 'Chamando...' : 'Chamar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Chamados do Dia */}
              <div className="glass-panel queue-card called-card">
                <div className="queue-header">
                  <div className="title-area">
                    <Volume2 size={20} className="text-pink" />
                    <h3>Chamados de Hoje</h3>
                  </div>
                  <span className="queue-count called-count">{calledList.length} chamados</span>
                </div>

                {calledList.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={40} className="text-muted" />
                    <h4>Nenhum Paciente Chamado</h4>
                    <p>Os pacientes chamados hoje por você serão listados aqui.</p>
                  </div>
                ) : (
                  <div className="waitlist-grid">
                    {calledList.map((call) => {
                      const time = formatTime(call.data_hora);
                      return (
                        <div key={call.id} className="patient-queue-card called-item">
                          <div className="patient-details">
                            <div className="time-badge called-time-badge">{time}h</div>
                            <div className="pat-meta">
                              <h4>{call.paciente_nome}</h4>
                              <span className="type-badge">{call.tipo_atendimento === 'consulta' ? 'Consulta' : 'Exame'}</span>
                            </div>
                          </div>
                          
                          <div className="called-actions-group">
                            <button 
                              className="btn btn-secondary prontuario-btn"
                              onClick={() => handleOpenProntuario(call)}
                            >
                              <FileText size={14} /> Ficha/Prontuário
                            </button>
                            
                            <button 
                              className="btn btn-secondary call-again-btn" 
                              onClick={() => handleCallPatient(call.agendamento_id)}
                              disabled={callingId === call.agendamento_id}
                            >
                              <RefreshCw size={14} className={callingId === call.agendamento_id ? 'animate-spin' : ''} /> 
                              {callingId === call.agendamento_id ? 'Chamando...' : 'Rechamar'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedAppt && (
            <div className="modal-overlay">
              <div className="glass-panel modal-content animate-fade-in">
                <div className="modal-header">
                  <div className="modal-title">
                    <FileText className="text-primary" size={24} />
                    <div>
                      <h3>Ficha de Atendimento</h3>
                      <p>Paciente: <strong>{selectedAppt.paciente_nome}</strong></p>
                    </div>
                  </div>
                  <button className="close-btn" onClick={() => setSelectedAppt(null)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="modal-body">
                  {/* Observações e Orientações */}
                  <div className="form-section">
                    <h4>Anotações Clínicas</h4>
                    <div className="form-group">
                      <label className="form-label">Observações sobre o Atendimento</label>
                      <textarea
                        className="form-control text-area-large"
                        rows={4}
                        placeholder="Insira detalhes sobre o diagnóstico, sintomas descritos pelo paciente ou conduta..."
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Orientações para Reagendamento (WhatsApp)</label>
                      <textarea
                        className="form-control text-area-medium"
                        rows={3}
                        placeholder="Recomendações e orientações caso o paciente necessite reagendar futuramente (ex: jejum, exames necessários)..."
                        value={orientacoesReagendamento}
                        onChange={(e) => setOrientacoesReagendamento(e.target.value)}
                      />
                    </div>
                  </div>

                  <hr className="divider" />

                  {/* Agendamento de Retorno */}
                  <div className="form-section return-scheduling-section">
                    <div className="section-title-wrapper">
                      <CalendarPlus className="text-pink" size={20} />
                      <h4>Agendar Visita de Retorno</h4>
                    </div>
                    <p className="section-desc">Selecione uma data para buscar os horários livres na sua agenda e marcar o retorno.</p>

                    <div className="return-fields-grid">
                      <div className="form-group">
                        <label className="form-label">Data de Retorno</label>
                        <select
                          className="form-control"
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                        >
                          <option value="">Selecione uma data...</option>
                          {availableDates.map(date => {
                            const formatted = date.split('-').reverse().join('/');
                            return (
                              <option key={date} value={date}>{formatted}</option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Horários Disponíveis</label>
                        <select
                          className="form-control"
                          value={selectedReturnSlotId}
                          onChange={(e) => setSelectedReturnSlotId(e.target.value)}
                          disabled={!returnDate || returnSlots.length === 0}
                        >
                          <option value="">
                            {!returnDate 
                              ? 'Selecione uma data primeiro' 
                              : returnSlots.length === 0 
                                ? 'Nenhum horário livre nesta data' 
                                : 'Escolha um horário...'}
                          </option>
                          {returnSlots.map(slot => (
                            <option key={slot.id} value={slot.id}>{slot.hora_inicio}h</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-secondary return-schedule-btn"
                      onClick={handleScheduleReturn}
                      disabled={!selectedReturnSlotId || schedulingReturn}
                    >
                      <CalendarPlus size={16} />
                      {schedulingReturn ? 'Agendando...' : 'Confirmar Retorno'}
                    </button>
                  </div>
                </div>

                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setSelectedAppt(null)}>
                    Cancelar
                  </button>
                  <button className="btn btn-primary" onClick={handleSaveDetails} disabled={savingDetails}>
                    <Save size={16} />
                    {savingDetails ? 'Salvando...' : 'Salvar Atendimento'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {historyPatient && (
            <div className="modal-overlay">
              <div className="glass-panel modal-content history-modal animate-fade-in">
                <div className="modal-header">
                  <div className="modal-title">
                    <History className="text-primary" size={24} />
                    <div>
                      <h3>Histórico Clínico</h3>
                      <p>Paciente: <strong>{historyPatient.paciente_nome}</strong></p>
                    </div>
                  </div>
                  <button className="close-btn" onClick={() => setHistoryPatient(null)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="modal-body">
                  {loadingHistory ? (
                    <div className="history-loading-wrapper">
                      <RefreshCw className="animate-spin text-primary" size={32} />
                      <p>Carregando histórico do paciente...</p>
                    </div>
                  ) : patientHistoryList.length === 0 ? (
                    <div className="empty-state">
                      <FolderSearch size={40} className="text-muted" />
                      <h4>Nenhum Histórico Encontrado</h4>
                      <p>Este paciente não possui atendimentos anteriores registrados no sistema.</p>
                    </div>
                  ) : (
                    <div className="history-timeline">
                      {patientHistoryList.map((appt) => {
                        const [datePart, timePart] = appt.data_hora.split(' ');
                        const formattedDate = datePart.split('-').reverse().join('/');
                        const formattedTime = timePart ? timePart.substring(0, 5) : '';

                        return (
                          <div key={appt.id} className="history-timeline-item">
                            <div className="timeline-badge-connector">
                              <div className="timeline-dot"></div>
                              <div className="timeline-line"></div>
                            </div>
                            
                            <div className="history-card glass-panel">
                              <div className="history-card-header">
                                <div className="history-date-info">
                                  <span className="history-date">{formattedDate}</span>
                                  {formattedTime && <span className="history-time">{formattedTime}h</span>}
                                </div>
                                <span className={`status-badge-mini status-${appt.status.toLowerCase().replace(' ', '-')}`}>
                                  {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                                </span>
                              </div>

                              <div className="history-doc-details">
                                <span className="doc-icon">👨‍⚕️</span>
                                <div>
                                  <h5>{appt.medico_nome}</h5>
                                  <span className="doc-specialty">{appt.especialidade}</span>
                                </div>
                                <span className="type-badge-mini">{appt.tipo_atendimento === 'consulta' ? 'Consulta' : 'Exame'}</span>
                              </div>

                              {(appt.observacoes || appt.orientacoes_reagendamento) ? (
                                <div className="history-notes-container">
                                  {appt.observacoes && (
                                    <div className="clinical-notes-box">
                                      <div className="notes-box-header">
                                        <FileText size={14} className="text-primary" />
                                        <span>Observações Clínicas</span>
                                      </div>
                                      <p className="notes-text">{appt.observacoes}</p>
                                    </div>
                                  )}

                                  {appt.orientacoes_reagendamento && (
                                    <div className="reschedule-notes-box">
                                      <div className="notes-box-header">
                                        <CalendarPlus size={14} className="text-pink" />
                                        <span>Orientações de Reagendamento</span>
                                      </div>
                                      <p className="notes-text">{appt.orientacoes_reagendamento}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p className="no-notes-text">Sem anotações clínicas registradas neste atendimento.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setHistoryPatient(null)}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        .tela-medico-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .login-card {
          padding: 3rem 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2rem;
          text-align: center;
        }

        .icon-badge {
          width: 65px;
          height: 65px;
          border-radius: 50%;
          background: rgba(14, 165, 233, 0.15);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.25rem auto;
          box-shadow: var(--shadow-glow);
        }

        .login-header h2 {
          font-size: 1.75rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
        }

        .login-header p {
          font-size: 0.95rem;
          color: var(--text-secondary);
        }

        .medicos-selection-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.25rem;
          width: 100%;
        }

        .med-select-btn {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          color: var(--text-primary);
          text-align: left;
        }

        .med-select-btn:hover {
          border-color: var(--primary);
          background: rgba(14, 165, 233, 0.05);
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
        }

        .med-avatar {
          font-size: 2rem;
        }

        .med-info h4 {
          font-size: 1.05rem;
          font-weight: 700;
        }

        .med-info span {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .arrow-login {
          margin-left: auto;
          color: var(--text-muted);
          transition: color 0.2s;
        }

        .med-select-btn:hover .arrow-login {
          color: var(--primary);
        }

        /* Console Ativo */
        .doctor-active-console {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .console-header-card {
          padding: 1.75rem 2.25rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
          flex-wrap: wrap;
        }

        .doc-identity {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .doc-avatar-large {
          font-size: 2.75rem;
        }

        .doc-specialty {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .room-control-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-width: 250px;
        }

        .room-select {
          height: 38px;
          padding-top: 0.25rem;
          padding-bottom: 0.25rem;
        }

        .warning-text {
          font-size: 0.75rem;
          color: var(--warning);
        }

        .logout-btn {
          height: 38px;
          align-self: flex-end;
        }

        .queue-card {
          padding: 2.25rem;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .queue-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 1rem;
        }

        .title-area {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .queue-header h3 {
          font-size: 1.15rem;
          font-weight: 700;
        }

        .queue-count {
          font-size: 0.85rem;
          color: var(--text-secondary);
          background: rgba(255, 255, 255, 0.05);
          padding: 0.25rem 0.6rem;
          border-radius: var(--radius-full);
          font-weight: 600;
        }

        .warning-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 0.75rem;
          padding: 3rem 1.5rem;
          color: var(--text-secondary);
        }

        .warning-empty-state h4 {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .warning-empty-state p {
          font-size: 0.85rem;
          max-width: 400px;
        }

        .waitlist-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .patient-queue-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
        }

        .patient-details {
          display: flex;
          align-items: center;
          gap: 1.25rem;
        }

        .time-badge {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--primary);
          background: rgba(14, 165, 233, 0.08);
          border: 1px solid rgba(14, 165, 233, 0.15);
          padding: 0.4rem 0.75rem;
          border-radius: var(--radius-sm);
        }

        .pat-meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .pat-meta h4 {
          font-size: 1.15rem;
          font-weight: 700;
        }

        .type-badge {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }

        .call-btn {
          padding: 0.5rem 1.25rem;
          font-size: 0.9rem;
          height: 38px;
        }

        /* Novas Estilizações da Grid e Recall */
        .doctor-panels-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          width: 100%;
        }

        .called-card {
          border-color: rgba(236, 72, 153, 0.2);
        }

        .text-pink {
          color: #ec4899;
        }

        .called-count {
          background: rgba(236, 72, 153, 0.05);
          color: #ec4899;
          border: 1px solid rgba(236, 72, 153, 0.15);
        }

        .called-time-badge {
          color: #ec4899;
          background: rgba(236, 72, 153, 0.08);
          border: 1px solid rgba(236, 72, 153, 0.15);
        }

        .called-item {
          border-color: rgba(236, 72, 153, 0.15);
          background: rgba(236, 72, 153, 0.02);
        }

        .call-again-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.25rem;
          font-size: 0.9rem;
          height: 38px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .call-again-btn:hover {
          background: rgba(236, 72, 153, 0.1);
          border-color: #ec4899;
          color: #ec4899;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        .called-actions-group {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .prontuario-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          height: 38px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .prontuario-btn:hover {
          background: rgba(14, 165, 233, 0.1);
          border-color: var(--primary);
          color: var(--primary);
        }

        /* Estilos do Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1.5rem;
        }

        .modal-content {
          width: 100%;
          max-width: 650px;
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background: rgba(10, 15, 30, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
          padding: 2rem;
          border-radius: var(--radius-lg);
          gap: 1.5rem;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 1rem;
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .modal-title h3 {
          font-size: 1.35rem;
          font-weight: 800;
          color: #ffffff;
        }

        .modal-title p {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .close-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: var(--radius-sm);
          transition: all 0.2s;
        }

        .close-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }

        .modal-body {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .form-section h4 {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .divider {
          border: 0;
          height: 1px;
          background: var(--border-color);
          margin: 0.5rem 0;
        }

        .text-area-large {
          resize: vertical;
          min-height: 90px;
        }

        .text-area-medium {
          resize: vertical;
          min-height: 70px;
        }

        .return-scheduling-section {
          background: rgba(236, 72, 153, 0.03);
          border: 1px dashed rgba(236, 72, 153, 0.2);
          border-radius: var(--radius-md);
          padding: 1.25rem;
        }

        .section-title-wrapper {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.25rem;
        }

        .section-title-wrapper h4 {
          color: #ec4899 !important;
        }

        .section-desc {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 0.75rem;
        }

        .return-fields-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .return-schedule-btn {
          align-self: flex-start;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          height: 38px;
          border-color: rgba(236, 72, 153, 0.3);
          color: var(--text-primary);
        }

        .return-schedule-btn:hover:not(:disabled) {
          border-color: #ec4899;
          background: rgba(236, 72, 153, 0.1);
          color: #ec4899;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          border-top: 1px solid var(--border-color);
          padding-top: 1rem;
          margin-top: 0.5rem;
        }

        /* Estilos do Histórico Clínico */
        .waitlist-actions-group {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .history-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          height: 38px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--border-color);
          color: var(--text-primary);
          transition: all 0.2s;
        }

        .history-btn:hover {
          background: rgba(14, 165, 233, 0.1);
          border-color: var(--primary);
          color: var(--primary);
        }

        .history-modal {
          max-width: 750px !important;
        }

        .history-loading-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 3rem 1.5rem;
          color: var(--text-secondary);
        }

        .history-timeline {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          position: relative;
          padding-left: 1rem;
          max-height: 60vh;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .history-timeline::-webkit-scrollbar {
          width: 6px;
        }
        .history-timeline::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 3px;
        }
        .history-timeline::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .history-timeline::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .history-timeline-item {
          display: flex;
          gap: 1.5rem;
          position: relative;
        }

        .timeline-badge-connector {
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
        }

        .timeline-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--primary);
          border: 3px solid rgba(14, 165, 233, 0.3);
          z-index: 2;
          margin-top: 1.5rem;
          box-shadow: 0 0 8px var(--primary);
        }

        .timeline-line {
          position: absolute;
          top: 1.5rem;
          bottom: -2.5rem;
          width: 2px;
          background: rgba(255, 255, 255, 0.08);
          z-index: 1;
        }

        .history-timeline-item:last-child .timeline-line {
          display: none;
        }

        .history-card {
          flex: 1;
          padding: 1.25rem;
          background: rgba(255, 255, 255, 0.02) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          border-radius: var(--radius-md);
        }

        .history-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 0.75rem;
        }

        .history-date-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .history-date {
          font-weight: 700;
          color: #ffffff;
          font-size: 0.95rem;
        }

        .history-time {
          font-size: 0.85rem;
          color: var(--text-secondary);
          background: rgba(255, 255, 255, 0.05);
          padding: 0.15rem 0.4rem;
          border-radius: var(--radius-sm);
        }

        .status-badge-mini {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-full);
          text-transform: capitalize;
        }

        .status-confirmado {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .status-aguardando {
          background: rgba(14, 165, 233, 0.1);
          color: var(--primary);
          border: 1px solid rgba(14, 165, 233, 0.2);
        }

        .status-chamado {
          background: rgba(236, 72, 153, 0.1);
          color: #ec4899;
          border: 1px solid rgba(236, 72, 153, 0.2);
        }

        .status-reagendado {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .status-não-compareceu, .status-nao-compareceu {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .history-doc-details {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .doc-icon {
          font-size: 1.5rem;
        }

        .history-doc-details h5 {
          font-size: 0.95rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }

        .type-badge-mini {
          margin-left: auto;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-secondary);
          background: rgba(255, 255, 255, 0.05);
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-sm);
        }

        .history-notes-container {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .clinical-notes-box {
          background: rgba(14, 165, 233, 0.03);
          border: 1px solid rgba(14, 165, 233, 0.1);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
        }

        .reschedule-notes-box {
          background: rgba(236, 72, 153, 0.03);
          border: 1px solid rgba(236, 72, 153, 0.1);
          border-radius: var(--radius-sm);
          padding: 0.75rem 1rem;
        }

        .notes-box-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          font-weight: 700;
          margin-bottom: 0.35rem;
          color: #ffffff;
        }

        .notes-text {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.4;
          white-space: pre-wrap;
        }

        .no-notes-text {
          font-size: 0.85rem;
          color: var(--text-muted);
          font-style: italic;
        }

        @media (max-width: 992px) {
          .doctor-panels-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .console-header-card {
            flex-direction: column;
            align-items: stretch;
            gap: 1.25rem;
          }
          .room-control-wrapper {
            min-width: 100%;
          }
          .logout-btn {
            width: 100%;
          }
          .patient-queue-card {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }
          .called-actions-group, .waitlist-actions-group {
            flex-direction: column;
            width: 100%;
            gap: 0.5rem;
          }
          .call-btn, .prontuario-btn, .call-again-btn, .history-btn {
            width: 100%;
            justify-content: center;
          }
          .return-fields-grid {
            grid-template-columns: 1fr;
          }
          .return-schedule-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default TelaMedicoView;
