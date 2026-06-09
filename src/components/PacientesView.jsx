import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Edit2, Trash2, X, AlertCircle, Calendar } from 'lucide-react';

function PacientesView({ onSchedulePatient }) {
  const [pacientes, setPacientes] = useState([]);
  const [convenios, setConvenios] = useState([]);
  const [search, setSearch] = useState('');

  // Sorting State
  const [sortField, setSortField] = useState('nome');
  const [sortDirection, setSortDirection] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIndicator = (field) => {
    if (sortField !== field) return <span className="sort-indicator neutral">↕</span>;
    return sortDirection === 'asc' ? 
      <span className="sort-indicator active">▲</span> : 
      <span className="sort-indicator active">▼</span>;
  };
  
  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [convenioId, setConvenioId] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPacientes();
    fetchConvenios();
  }, []);

  const fetchPacientes = async () => {
    try {
      const res = await fetch('/api/pacientes');
      const data = await res.json();
      setPacientes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchConvenios = async () => {
    try {
      const res = await fetch('/api/convenios');
      const data = await res.json();
      // Filtrar apenas convênios ativos para novos cadastros
      setConvenios(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Mascarar CPF
  const handleCpfChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      value = value.replace(/(\d{3})(\d)/, '$1.$2');
      value = value.replace(/(\d{3})(\d)/, '$1.$2');
      value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      setCpf(value);
    }
  };

  // Mascarar WhatsApp
  const handleWhatsappChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 13) {
      setWhatsapp(value);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setNome('');
    setCpf('');
    setWhatsapp('5511');
    setDataNascimento('');
    setConvenioId('');
    setError('');
    setShowModal(true);
  };

  const openEditModal = (p) => {
    setEditingId(p.id);
    setNome(p.nome);
    setCpf(p.cpf);
    setWhatsapp(p.whatsapp);
    setDataNascimento(p.data_nascimento);
    setConvenioId(p.convenio_id || '');
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!nome || !cpf || !whatsapp || !dataNascimento) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (whatsapp.length < 10) {
      setError('Formato de WhatsApp inválido. Utilize o formato DDI+DDD+NÚMERO (Ex: 5511999998888).');
      return;
    }

    const payload = {
      nome,
      cpf,
      whatsapp,
      data_nascimento: dataNascimento,
      convenio_id: convenioId ? parseInt(convenioId) : null
    };

    try {
      const url = editingId ? `/api/pacientes/${editingId}` : '/api/pacientes';
      const method = editingId ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar paciente');
      }

      setShowModal(false);
      fetchPacientes();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este paciente?')) {
      try {
        const res = await fetch(`/api/pacientes/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao deletar paciente');
        }
        fetchPacientes();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  const filteredPacientes = pacientes.filter(p => 
    p.nome.toLowerCase().includes(search.toLowerCase()) ||
    p.cpf.includes(search)
  );

  const sortedPacientes = [...filteredPacientes].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'convenio') {
      valA = a.convenio_nome || 'particular';
      valB = b.convenio_nome || 'particular';
    }

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const formatBirthday = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const formatPhone = (phoneStr) => {
    if (!phoneStr) return '';
    return phoneStr.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  };

  return (
    <div className="animate-fade-in">
      {/* Header Operations */}
      <div className="view-actions glass-panel">
        <div className="search-box">
          <Search className="search-icon" size={18} />
          <input 
            type="text" 
            placeholder="Pesquisar por Nome ou CPF..." 
            className="form-control search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <UserPlus size={18} /> Cadastrar Paciente
        </button>
      </div>

      {/* Patients List Grid */}
      <div className="glass-panel table-section">
        {loading ? (
          <p className="loading-text">Carregando pacientes...</p>
        ) : filteredPacientes.length === 0 ? (
          <div className="empty-state">
            <Users size={40} className="text-muted" />
            <p>Nenhum paciente encontrado.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('nome')} className="sortable-th">Nome {getSortIndicator('nome')}</th>
                  <th onClick={() => handleSort('cpf')} className="sortable-th">CPF {getSortIndicator('cpf')}</th>
                  <th onClick={() => handleSort('whatsapp')} className="sortable-th">WhatsApp {getSortIndicator('whatsapp')}</th>
                  <th onClick={() => handleSort('data_nascimento')} className="sortable-th">Nascimento {getSortIndicator('data_nascimento')}</th>
                  <th onClick={() => handleSort('convenio')} className="sortable-th">Convênio {getSortIndicator('convenio')}</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedPacientes.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: '600' }}>{p.nome}</td>
                    <td>{p.cpf}</td>
                    <td>{formatPhone(p.whatsapp)}</td>
                    <td>{formatBirthday(p.data_nascimento)}</td>
                    <td>
                      {p.convenio_nome ? (
                        <span className="convenio-tag">{p.convenio_nome}</span>
                      ) : (
                        <span className="convenio-tag particular">Particular</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="action-buttons">
                        {onSchedulePatient && (
                          <button className="btn-action schedule" onClick={() => onSchedulePatient(p)} title="Agendar Consulta/Exame">
                            <Calendar size={14} />
                          </button>
                        )}
                        <button className="btn-action edit" onClick={() => openEditModal(p)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="btn-action delete" onClick={() => handleDelete(p.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add/Edit Patient */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content animate-scale-up">
            <div className="modal-header">
              <h3>{editingId ? 'Editar Paciente' : 'Novo Paciente'}</h3>
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

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label className="form-label">Nome Completo *</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Nome do Paciente"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>

              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-label">CPF *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={handleCpfChange}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">WhatsApp *</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="5511999998888"
                    value={whatsapp}
                    onChange={handleWhatsappChange}
                    required
                  />
                  <span className="input-hint">DDI (55) + DDD + Celular</span>
                </div>
              </div>

              <div className="grid-cols-2">
                <div className="form-group">
                  <label className="form-label">Data de Nascimento *</label>
                  <input 
                    type="date" 
                    className="form-control"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Convênio Médico</label>
                  <select 
                    className="form-control"
                    value={convenioId}
                    onChange={(e) => setConvenioId(e.target.value)}
                  >
                    <option value="">Particular (Sem convênio)</option>
                    {convenios
                      .filter(c => c.status_ativo === 1 || c.id === convenioId)
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.nome_plano} {c.status_ativo === 0 ? '(Inativo)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
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

      <style>{`
        .sort-indicator {
          font-size: 0.65rem;
          margin-left: 0.4rem;
          display: inline-block;
          vertical-align: middle;
        }
        .sort-indicator.neutral {
          opacity: 0.3;
        }
        .sort-indicator.active {
          color: var(--primary);
          opacity: 1;
        }
        .sortable-th {
          cursor: pointer;
          user-select: none;
          transition: background 0.2s;
        }
        .sortable-th:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .view-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.25rem 2rem;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }

        .search-box {
          position: relative;
          width: 350px;
        }

        .search-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .search-input {
          padding-left: 2.5rem;
        }

        .table-section {
          padding: 2rem;
        }

        .convenio-tag {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--primary);
          background: rgba(14, 165, 233, 0.08);
          border: 1px solid rgba(14, 165, 233, 0.2);
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-sm);
        }

        .convenio-tag.particular {
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.03);
          border-color: var(--border-color);
        }

        .action-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .btn-action {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          background: rgba(0, 0, 0, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-secondary);
        }

        .btn-action:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.05);
        }

        .btn-action.schedule:hover {
          color: var(--success);
          border-color: rgba(16, 185, 129, 0.3);
        }

        .btn-action.edit:hover {
          color: var(--primary);
          border-color: rgba(14, 165, 233, 0.3);
        }

        .btn-action.delete:hover {
          color: var(--danger);
          border-color: rgba(239, 68, 68, 0.3);
        }

        /* Modal specific */
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 1rem;
        }

        .btn-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.2s;
        }

        .btn-close:hover {
          color: var(--text-primary);
        }

        .error-alert {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--danger);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          margin-bottom: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .input-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          margin-top: 2rem;
          border-top: 1px solid var(--border-color);
          padding-top: 1.5rem;
        }

        @media (max-width: 768px) {
          .view-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .search-box {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

export default PacientesView;
