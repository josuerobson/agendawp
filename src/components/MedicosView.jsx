import React, { useState, useEffect } from 'react';
import { Stethoscope, Plus, Trash2, Calendar, Clock, X, AlertCircle } from 'lucide-react';

function MedicosView() {
  const [medicos, setMedicos] = useState([]);
  const [disponibilidades, setDisponibilidades] = useState([]);
  const [loadingMedicos, setLoadingMedicos] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(true);

  // Doctor Form State
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nome, setNome] = useState('');
  const [crm, setCrm] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [patologias, setPatologias] = useState('');
  const [doctorError, setDoctorError] = useState('');

  // Availability Batch Form State
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selMedicoId, setSelMedicoId] = useState('');
  const [daysCount, setDaysCount] = useState(1);
  const [datas, setDatas] = useState([]);
  const [hoursCount, setHoursCount] = useState(1);
  const [horas, setHoras] = useState([]);
  const [slotError, setSlotError] = useState('');

  useEffect(() => {
    fetchMedicos();
    fetchDisponibilidades();
  }, []);

  const fetchMedicos = async () => {
    try {
      const res = await fetch('/api/medicos');
      const data = await res.json();
      setMedicos(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMedicos(false);
    }
  };

  const fetchDisponibilidades = async () => {
    try {
      const res = await fetch('/api/disponibilidade');
      const data = await res.json();
      setDisponibilidades(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSlots(false);
    }
  };

  const openAddDoctor = () => {
    setEditingId(null);
    setNome('');
    setCrm('');
    setEspecialidade('');
    setPatologias('');
    setDoctorError('');
    setShowDoctorModal(true);
  };

  const openEditDoctor = (m) => {
    setEditingId(m.id);
    setNome(m.nome);
    setCrm(m.crm);
    setEspecialidade(m.especialidade);
    setPatologias(m.patologias_atendidas || '');
    setDoctorError('');
    setShowDoctorModal(true);
  };

  const handleDoctorSubmit = async (e) => {
    e.preventDefault();
    setDoctorError('');

    if (!nome || !crm || !especialidade) {
      setDoctorError('Nome, CRM e Especialidade são obrigatórios.');
      return;
    }

    const payload = {
      nome,
      crm,
      especialidade,
      patologias_atendidas: patologias
    };

    try {
      const url = editingId ? `/api/medicos/${editingId}` : '/api/medicos';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar médico');
      
      setShowDoctorModal(false);
      fetchMedicos();
    } catch (err) {
      setDoctorError(err.message);
    }
  };

  const handleDoctorDelete = async (id) => {
    if (window.confirm('Excluir este médico irá remover sua disponibilidade. Deseja continuar?')) {
      try {
        const res = await fetch(`/api/medicos/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao deletar médico');
        
        fetchMedicos();
        fetchDisponibilidades(); // Atualizar disponibilidades cascade deletadas
      } catch (err) {
        alert(err.message);
      }
    }
  };

  // Abrir modal configurado em lote com valores padrão
  const openAddSlot = () => {
    setSelMedicoId(medicos[0]?.id || '');
    setDaysCount(1);
    setDatas([new Date().toISOString().split('T')[0]]);
    setHoursCount(1);
    setHoras(['09:00']);
    setSlotError('');
    setShowSlotModal(true);
  };

  // Alterar dinamicamente a quantidade de datas liberando inputs
  const handleDaysCountChange = (count) => {
    const newCount = Math.max(1, Math.min(10, parseInt(count) || 1));
    setDaysCount(newCount);
    
    const newDatas = [...datas];
    if (newDatas.length < newCount) {
      // Adicionar novas datas sequenciais a partir da última inserida
      let lastDate = newDatas[newDatas.length - 1] ? new Date(newDatas[newDatas.length - 1] + 'T00:00:00') : new Date();
      while (newDatas.length < newCount) {
        lastDate.setDate(lastDate.getDate() + 1);
        newDatas.push(lastDate.toISOString().split('T')[0]);
      }
    } else if (newDatas.length > newCount) {
      newDatas.splice(newCount);
    }
    setDatas(newDatas);
  };

  // Alterar dinamicamente a quantidade de horários liberando inputs
  const handleHoursCountChange = (count) => {
    const newCount = Math.max(1, Math.min(10, parseInt(count) || 1));
    setHoursCount(newCount);
    
    const newHoras = [...horas];
    if (newHoras.length < newCount) {
      // Adicionar novas horas em sequência de 1h
      let lastHourStr = newHoras[newHoras.length - 1] || '09:00';
      let [h, m] = lastHourStr.split(':').map(Number);
      while (newHoras.length < newCount) {
        h = (h + 1) % 24;
        const nextHourStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        newHoras.push(nextHourStr);
      }
    } else if (newHoras.length > newCount) {
      newHoras.splice(newCount);
    }
    setHoras(newHoras);
  };

  const handleSlotSubmit = async (e) => {
    e.preventDefault();
    setSlotError('');

    if (!selMedicoId || datas.length === 0 || horas.length === 0) {
      setSlotError('Preencha todos os campos obrigatórios.');
      return;
    }

    const payload = {
      medico_id: parseInt(selMedicoId),
      datas: datas,
      horas: horas
    };

    try {
      const res = await fetch('/api/disponibilidade/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar horários');

      let feedbackMsg = `Cadastro em lote concluído!\n${data.count} novos horários criados.`;
      if (data.duplicated && data.duplicated.length > 0) {
        feedbackMsg += `\n${data.duplicated.length} horários foram ignorados por já existirem.`;
      }
      alert(feedbackMsg);

      setShowSlotModal(false);
      fetchDisponibilidades();
    } catch (err) {
      setSlotError(err.message);
    }
  };

  const handleSlotDelete = async (id) => {
    if (window.confirm('Remover este horário de disponibilidade?')) {
      try {
        const res = await fetch(`/api/disponibilidade/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao remover horário');
        fetchDisponibilidades();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="animate-fade-in medicos-view-layout">
      {/* Grid of Doctors */}
      <div className="section-container">
        <div className="section-header glass-panel">
          <div className="title-desc">
            <h3>Corpo Clínico</h3>
            <p>Lista de médicos e suas respectivas patologias atendidas.</p>
          </div>
          <button className="btn btn-primary" onClick={openAddDoctor}>
            <Plus size={18} /> Cadastrar Médico
          </button>
        </div>

        <div className="doctors-grid">
          {loadingMedicos ? (
            <p className="loading-text">Carregando corpo clínico...</p>
          ) : medicos.length === 0 ? (
            <div className="glass-panel empty-state" style={{ gridColumn: 'span 2' }}>
              <Stethoscope size={40} className="text-muted" />
              <p>Nenhum médico cadastrado no momento.</p>
            </div>
          ) : (
            medicos.map((m) => (
              <div key={m.id} className="doctor-card glass-panel">
                <div className="doctor-avatar-section">
                  <div className="doc-avatar-bg">
                    <Stethoscope size={28} className="text-primary" />
                  </div>
                  <div>
                    <h4>{m.nome}</h4>
                    <span className="doc-crm">{m.crm}</span>
                  </div>
                </div>

                <div className="doctor-info-section">
                  <div className="info-row">
                    <span className="label">Especialidade:</span>
                    <span className="value spec-badge">{m.especialidade}</span>
                  </div>
                  <div className="info-row pathologies">
                    <span className="label">Trata:</span>
                    <span className="value path-text">
                      {m.patologias_atendidas || 'Clínica Geral Básica'}
                    </span>
                  </div>
                </div>

                <div className="doctor-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEditDoctor(m)}>
                    Editar
                  </button>
                  <button className="btn btn-secondary btn-sm text-danger" onClick={() => handleDoctorDelete(m.id)}>
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Configuration of Disponibilidade slots */}
      <div className="section-container">
        <div className="section-header glass-panel">
          <div className="title-desc">
            <h3>Disponibilidade de Horários</h3>
            <p>Configure quando cada médico está livre para agendamentos.</p>
          </div>
          <button className="btn btn-primary" onClick={openAddSlot} disabled={medicos.length === 0}>
            <Calendar size={18} /> Configurar Horário
          </button>
        </div>

        <div className="glass-panel table-section">
          {loadingSlots ? (
            <p className="loading-text">Carregando horários...</p>
          ) : disponibilidades.length === 0 ? (
            <div className="empty-state">
              <Clock size={40} className="text-muted" />
              <p>Nenhum horário de disponibilidade cadastrado.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Médico</th>
                    <th>Especialidade</th>
                    <th>Data</th>
                    <th>Horário</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Remover</th>
                  </tr>
                </thead>
                <tbody>
                  {disponibilidades.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: '600' }}>{d.medico_nome}</td>
                      <td>{d.especialidade}</td>
                      <td>{d.data.split('-').reverse().join('/')}</td>
                      <td>
                        <span className="time-tag-disp">
                          <Clock size={12} /> {d.hora_inicio}
                        </span>
                      </td>
                      <td>
                        {d.status_disponivel === 1 ? (
                          <span className="badge badge-confirmado">Livre</span>
                        ) : (
                          <span className="badge badge-pendente">Ocupado</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn-action delete" 
                          onClick={() => handleSlotDelete(d.id)}
                          disabled={d.status_disponivel === 0}
                          style={{ opacity: d.status_disponivel === 0 ? 0.3 : 1 }}
                          title={d.status_disponivel === 0 ? 'Horário reservado não pode ser removido' : 'Remover horário'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Doctor Modal Add/Edit */}
      {showDoctorModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale-up">
            <div className="modal-header">
              <h3>{editingId ? 'Editar Médico' : 'Cadastrar Médico'}</h3>
              <button className="btn-close" onClick={() => setShowDoctorModal(false)}>
                <X size={18} />
              </button>
            </div>

            {doctorError && (
              <div className="error-alert">
                <AlertCircle size={16} />
                <span>{doctorError}</span>
              </div>
            )}

            <form onSubmit={handleDoctorSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Nome Completo *</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Nome do Médico"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>

              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-label">CRM *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="CRM-UF 000000"
                    value={crm}
                    onChange={(e) => setCrm(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Especialidade *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Ex: Cardiologia"
                    value={especialidade}
                    onChange={(e) => setEspecialidade(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Patologias Atendidas (Separadas por vírgula)</label>
                <textarea 
                  className="form-control"
                  placeholder="Ex: Hipertensão, Arritmia, Infarto..."
                  value={patologias}
                  onChange={(e) => setPatologias(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowDoctorModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingId ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Availability Batch Modal */}
      {showSlotModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale-up" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h3>Configurar Disponibilidade (Lote)</h3>
              <button className="btn-close" onClick={() => setShowSlotModal(false)}>
                <X size={18} />
              </button>
            </div>

            {slotError && (
              <div className="error-alert">
                <AlertCircle size={16} />
                <span>{slotError}</span>
              </div>
            )}

            <form onSubmit={handleSlotSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Selecionar Médico *</label>
                <select 
                  className="form-control"
                  value={selMedicoId}
                  onChange={(e) => setSelMedicoId(e.target.value)}
                  required
                >
                  {medicos.map(m => (
                    <option key={m.id} value={m.id}>{m.nome} ({m.especialidade})</option>
                  ))}
                </select>
              </div>

              {/* Quantidade de dias e horários */}
              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-label">Quantos dias cadastrar? *</label>
                  <select 
                    className="form-control"
                    value={daysCount}
                    onChange={(e) => handleDaysCountChange(e.target.value)}
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'dia' : 'dias'}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Quantos horários por dia? *</label>
                  <select 
                    className="form-control"
                    value={hoursCount}
                    onChange={(e) => handleHoursCountChange(e.target.value)}
                  >
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'horário' : 'horários'}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Campos dinâmicos de data */}
              <div className="batch-inputs-scroll-container">
                <h4 className="batch-label"><Calendar size={14} /> Seleção de Datas</h4>
                <div className="batch-grid">
                  {datas.map((d, idx) => (
                    <div key={idx} className="form-group">
                      <label className="form-label">Dia {idx + 1} *</label>
                      <input 
                        type="date" 
                        className="form-control"
                        value={d}
                        onChange={(e) => {
                          const newDatas = [...datas];
                          newDatas[idx] = e.target.value;
                          setDatas(newDatas);
                        }}
                        required
                      />
                    </div>
                  ))}
                </div>

                <h4 className="batch-label" style={{ marginTop: '1rem' }}><Clock size={14} /> Seleção de Horários</h4>
                <div className="batch-grid">
                  {horas.map((h, idx) => (
                    <div key={idx} className="form-group">
                      <label className="form-label">Horário {idx + 1} *</label>
                      <input 
                        type="time" 
                        className="form-control"
                        value={h}
                        onChange={(e) => {
                          const newHoras = [...horas];
                          newHoras[idx] = e.target.value;
                          setHoras(newHoras);
                        }}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowSlotModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Liberar Agenda em Lote
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .medicos-view-layout {
          display: flex;
          flex-direction: column;
          gap: 2.5rem;
        }

        .section-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 2rem;
        }

        .title-desc h3 {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .title-desc p {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 0.15rem;
        }

        .doctors-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
          gap: 1.5rem;
        }

        .doctor-card {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .doctor-avatar-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .doc-avatar-bg {
          width: 50px;
          height: 50px;
          background: rgba(14, 165, 233, 0.08);
          border: 1px solid rgba(14, 165, 233, 0.2);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .doctor-avatar-section h4 {
          font-size: 1.1rem;
          font-weight: 700;
        }

        .doc-crm {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .doctor-info-section {
          background: rgba(0, 0, 0, 0.15);
          padding: 1rem;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.85rem;
        }

        .info-row.pathologies {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.25rem;
        }

        .info-row .label {
          color: var(--text-muted);
          font-weight: 500;
        }

        .spec-badge {
          color: var(--primary);
          background: rgba(14, 165, 233, 0.08);
          padding: 0.15rem 0.5rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          font-size: 0.8rem;
        }

        .path-text {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .doctor-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
        }

        .btn-sm {
          padding: 0.5rem 1rem;
          font-size: 0.8rem;
          border-radius: var(--radius-sm);
        }

        .time-tag-disp {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--primary);
          background: rgba(14, 165, 233, 0.08);
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-sm);
          font-weight: 700;
          font-size: 0.85rem;
        }

        /* Batch registration specific */
        .batch-inputs-scroll-container {
          max-height: 250px;
          overflow-y: auto;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-color);
          padding: 1rem;
          border-radius: var(--radius-sm);
          margin: 0.5rem 0;
        }

        .batch-label {
          font-size: 0.8rem;
          color: var(--text-primary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          border-bottom: 1px dashed var(--border-color);
          padding-bottom: 0.4rem;
          margin-bottom: 0.75rem;
        }

        .batch-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        @media (max-width: 768px) {
          .section-header {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
          }
          .doctors-grid {
            grid-template-columns: 1fr;
          }
          .batch-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default MedicosView;
