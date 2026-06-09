import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Check, X, AlertCircle } from 'lucide-react';

function ConveniosView() {
  const [convenios, setConvenios] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sorting State
  const [sortField, setSortField] = useState('nome_plano');
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

  const sortedConvenios = [...convenios].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Form State
  const [nomePlano, setNomePlano] = useState('');
  const [statusAtivo, setStatusAtivo] = useState(true);
  const [error, setError] = useState('');

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editNomePlano, setEditNomePlano] = useState('');

  useEffect(() => {
    fetchConvenios();
  }, []);

  const fetchConvenios = async () => {
    try {
      const res = await fetch('/api/convenios');
      const data = await res.json();
      setConvenios(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!nomePlano.trim()) {
      setError('O nome do plano é obrigatório.');
      return;
    }

    try {
      const res = await fetch('/api/convenios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_plano: nomePlano,
          status_ativo: statusAtivo ? 1 : 0
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar convênio');

      setNomePlano('');
      setStatusAtivo(true);
      fetchConvenios();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (c) => {
    const newStatus = c.status_ativo === 1 ? 0 : 1;
    try {
      const res = await fetch(`/api/convenios/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_plano: c.nome_plano,
          status_ativo: newStatus
        })
      });
      if (!res.ok) throw new Error('Erro ao alterar status');
      fetchConvenios();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartEdit = (c) => {
    setEditingId(c.id);
    setEditNomePlano(c.nome_plano);
  };

  const handleSaveEdit = async (c) => {
    if (!editNomePlano.trim()) return;
    try {
      const res = await fetch(`/api/convenios/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_plano: editNomePlano,
          status_ativo: c.status_ativo
        })
      });
      if (!res.ok) throw new Error('Erro ao salvar nome do plano');
      setEditingId(null);
      fetchConvenios();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Deseja excluir este convênio? Pacientes associados perderão o plano e ficarão como Particular.')) {
      try {
        const res = await fetch(`/api/convenios/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao deletar convênio');
        }
        fetchConvenios();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="animate-fade-in convenios-layout">
      {/* List section */}
      <div className="glass-panel table-section list-panel">
        <div className="list-header">
          <h3>Planos de Saúde Cadastrados</h3>
          <p>Gerencie os convênios que a clínica aceita para atendimento de consultas e exames.</p>
        </div>

        {loading ? (
          <p className="loading-text">Carregando convênios...</p>
        ) : convenios.length === 0 ? (
          <div className="empty-state">
            <FileText size={40} className="text-muted" />
            <p>Nenhum convênio cadastrado.</p>
          </div>
        ) : (
          <div className="table-container">
             <table className="custom-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('nome_plano')} className="sortable-th">Nome do Plano {getSortIndicator('nome_plano')}</th>
                  <th onClick={() => handleSort('status_ativo')} className="sortable-th">Status {getSortIndicator('status_ativo')}</th>
                  <th style={{ textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedConvenios.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: '600' }}>
                      {editingId === c.id ? (
                        <div className="edit-inline-form">
                          <input 
                            type="text" 
                            className="form-control inline-input"
                            value={editNomePlano}
                            onChange={(e) => setEditNomePlano(e.target.value)}
                          />
                          <button className="btn-action check" onClick={() => handleSaveEdit(c)}>
                            <Check size={14} />
                          </button>
                          <button className="btn-action close" onClick={() => setEditingId(null)}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        c.nome_plano
                      )}
                    </td>
                    <td>
                      <button 
                        className={`badge-toggle ${c.status_ativo === 1 ? 'active' : 'inactive'}`}
                        onClick={() => handleToggleStatus(c)}
                        title="Clique para alternar o status"
                      >
                        {c.status_ativo === 1 ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {editingId !== c.id && (
                        <div className="action-buttons">
                          <button className="btn btn-secondary btn-sm" onClick={() => handleStartEdit(c)}>
                            Editar
                          </button>
                          <button className="btn-action delete" onClick={() => handleDelete(c.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add section */}
      <div className="glass-panel form-panel">
        <div className="form-header">
          <h3>Novo Convênio</h3>
          <p>Adicione um novo convênio médico para habilitá-lo na clínica.</p>
        </div>

        {error && (
          <div className="error-alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="convenios-form">
          <div className="form-group">
            <label className="form-label">Nome do Plano *</label>
            <input 
              type="text" 
              className="form-control"
              placeholder="Ex: Unimed Rio, Allianz, etc."
              value={nomePlano}
              onChange={(e) => setNomePlano(e.target.value)}
              required
            />
          </div>

          <div className="form-group row-checkbox">
            <input 
              type="checkbox" 
              id="status_ativo"
              checked={statusAtivo}
              onChange={(e) => setStatusAtivo(e.target.checked)}
            />
            <label htmlFor="status_ativo" className="checkbox-label">
              Habilitar plano imediatamente para novos cadastros
            </label>
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            <Plus size={18} /> Adicionar Plano
          </button>
        </form>
      </div>

      <style>{`
        .convenios-layout {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 2rem;
          align-items: start;
        }

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

        .list-panel {
          padding: 2rem;
        }

        .list-header {
          margin-bottom: 1.5rem;
        }

        .list-header h3, .form-header h3 {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .list-header p, .form-header p {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 0.15rem;
        }

        .form-panel {
          padding: 2rem;
        }

        .form-header {
          margin-bottom: 1.5rem;
        }

        .convenios-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .row-checkbox {
          flex-direction: row;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .checkbox-label {
          font-size: 0.85rem;
          color: var(--text-secondary);
          cursor: pointer;
        }

        .btn-block {
          width: 100%;
        }

        .badge-toggle {
          border: none;
          display: inline-flex;
          align-items: center;
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          border-radius: var(--radius-full);
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }

        .badge-toggle.active {
          background: rgba(16, 185, 129, 0.12);
          color: var(--success);
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .badge-toggle.active:hover {
          background: rgba(16, 185, 129, 0.2);
        }

        .badge-toggle.inactive {
          background: rgba(239, 68, 68, 0.12);
          color: var(--danger);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .badge-toggle.inactive:hover {
          background: rgba(239, 68, 68, 0.2);
        }

        /* Inline editing form */
        .edit-inline-form {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .inline-input {
          padding: 0.4rem 0.75rem;
          font-size: 0.9rem;
          max-width: 250px;
        }

        .btn-action.check {
          color: var(--success);
          border-color: rgba(16, 185, 129, 0.3);
        }
        
        .btn-action.check:hover {
          background: rgba(16, 185, 129, 0.1);
        }

        .btn-action.close {
          color: var(--text-muted);
        }

        @media (max-width: 992px) {
          .convenios-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default ConveniosView;
