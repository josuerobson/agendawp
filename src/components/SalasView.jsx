import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, HelpCircle } from 'lucide-react';

function SalasView() {
  const [salas, setSalas] = useState([]);
  const [nome, setNome] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSalas();
  }, []);

  const fetchSalas = async () => {
    try {
      const res = await fetch('/api/salas');
      const data = await res.json();
      setSalas(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSala = async (e) => {
    e.preventDefault();
    setError('');

    if (!nome.trim()) {
      setError('O nome da sala é obrigatório.');
      return;
    }

    try {
      const res = await fetch('/api/salas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome })
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar sala');

      setNome('');
      fetchSalas();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteSala = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir esta sala? Médicos vinculados a ela ficarão sem sala vinculada.')) {
      try {
        const res = await fetch(`/api/salas/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao excluir sala');
        fetchSalas();
      } catch (err) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="animate-fade-in salas-view-container">
      <div className="grid-cols-2">
        {/* Formulário de Cadastro */}
        <div className="glass-panel form-section">
          <h3>Nova Sala / Consultório</h3>
          <p className="section-desc">Cadastre salas físicas para vincular aos médicos e usá-las no painel de chamada.</p>

          {error && (
            <div className="error-alert">
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleCreateSala} className="modal-form">
            <div className="form-group">
              <label className="form-label">Nome da Sala / Consultório *</label>
              <input 
                type="text" 
                className="form-control"
                placeholder="Ex: Consultório 1, Sala de Triagem A..."
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              <Plus size={18} /> Cadastrar Sala
            </button>
          </form>
        </div>

        {/* Lista de Salas */}
        <div className="glass-panel list-section">
          <h3>Salas Cadastradas</h3>
          
          {loading ? (
            <p className="loading-text">Carregando salas...</p>
          ) : salas.length === 0 ? (
            <div className="empty-state">
              <FileText size={40} className="text-muted" />
              <p>Nenhuma sala cadastrada ainda.</p>
            </div>
          ) : (
            <div className="salas-list">
              {salas.map((s) => (
                <div key={s.id} className="sala-card">
                  <div className="sala-info">
                    <span className="sala-icon">🚪</span>
                    <span className="sala-name">{s.nome}</span>
                  </div>
                  <button className="btn-action delete" onClick={() => handleDeleteSala(s.id)} title="Excluir Sala">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .salas-view-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-section, .list-section {
          padding: 2.25rem;
          min-height: 380px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .section-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }

        .salas-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 300px;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .sala-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.85rem 1rem;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          transition: border-color 0.2s ease;
        }

        .sala-card:hover {
          border-color: var(--text-muted);
        }

        .sala-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .sala-icon {
          font-size: 1.25rem;
        }

        .sala-name {
          font-weight: 600;
          color: var(--text-primary);
        }

        .error-alert {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: var(--danger);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}

export default SalasView;
