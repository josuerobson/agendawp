import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  Stethoscope, 
  FileText, 
  MessageSquare,
  Sun,
  Moon,
  Activity,
  DoorOpen,
  Tv,
  Bell
} from 'lucide-react';

import Dashboard from './components/Dashboard';
import AgendamentosView from './components/AgendamentosView';
import PacientesView from './components/PacientesView';
import MedicosView from './components/MedicosView';
import ConveniosView from './components/ConveniosView';
import WhatsappSimPanel from './components/WhatsappSimPanel';
import SalasView from './components/SalasView';
import TelaMedicoView from './components/TelaMedicoView';
import PainelChamadasView from './components/PainelChamadasView';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('dark');
  const [selectedPatientForBooking, setSelectedPatientForBooking] = useState(null);

  // Toggle Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }, [theme]);

  // Sidebar Menu Items
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'agendamentos', label: 'Agendamentos', icon: CalendarDays },
    { id: 'pacientes', label: 'Pacientes', icon: Users },
    { id: 'medicos', label: 'Médicos', icon: Stethoscope },
    { id: 'convenios', label: 'Convênios', icon: FileText },
    { id: 'whatsapp', label: 'Simulador WhatsApp', icon: MessageSquare, badge: true },
    { id: 'salas', label: 'Consultórios / Salas', icon: DoorOpen },
    { id: 'tela_medico', label: 'Console do Médico', icon: Bell },
    { id: 'painel_chamadas', label: 'Painel TV Chamadas', icon: Tv }
  ];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="glass-sidebar">
        <div className="sidebar-brand">
          <Activity className="brand-logo" size={28} />
          <div>
            <h2>Agenda WP</h2>
            <span>Gestão Clínica</span>
          </div>
        </div>

        <nav className="sidebar-menu">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`menu-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">Whats</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button 
            className="theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="content-wrapper">
        {/* Top Header */}
        <header className="main-header glass-panel">
          <div className="header-info">
            <h1>
              {menuItems.find(i => i.id === activeTab)?.label}
            </h1>
            <p className="header-date">
              {new Date().toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>

          <div className="header-status">
            <div className="status-indicator">
              <span className="dot pulse"></span>
              <span className="status-label">Simulador WhatsApp Ativo</span>
            </div>
            
            <img 
              src="/logo.png" 
              alt="Agenda WP Logo" 
              className="clinic-logo-img" 
            />
          </div>
        </header>

        {/* Dynamic View Content */}
        <main className="main-content">
          {activeTab === 'dashboard' && <Dashboard setActiveTab={setActiveTab} />}
          {activeTab === 'agendamentos' && (
            <AgendamentosView 
              initialPatient={selectedPatientForBooking}
              onClearInitialPatient={() => setSelectedPatientForBooking(null)}
            />
          )}
          {activeTab === 'pacientes' && (
            <PacientesView 
              onSchedulePatient={(patient) => {
                setSelectedPatientForBooking(patient);
                setActiveTab('agendamentos');
              }}
            />
          )}
          {activeTab === 'medicos' && <MedicosView />}
          {activeTab === 'convenios' && <ConveniosView />}
          {activeTab === 'whatsapp' && <WhatsappSimPanel />}
          {activeTab === 'salas' && <SalasView />}
          {activeTab === 'tela_medico' && <TelaMedicoView />}
          {activeTab === 'painel_chamadas' && <PainelChamadasView />}
        </main>
      </div>

      {/* Inline styles for navigation layouts */}
      <style>{`
        .glass-sidebar {
          width: 260px;
          background: var(--bg-sidebar);
          backdrop-filter: blur(var(--glass-blur));
          -webkit-backdrop-filter: blur(var(--glass-blur));
          border-right: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          padding: 2rem 1.5rem;
          height: 100vh;
          position: sticky;
          top: 0;
          z-index: 100;
          transition: all 0.3s ease;
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 3rem;
        }

        .brand-logo {
          color: var(--primary);
          filter: drop-shadow(0 0 8px rgba(14, 165, 233, 0.4));
        }

        .sidebar-brand h2 {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.1;
        }

        .sidebar-brand span {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        .sidebar-menu {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1;
        }

        .menu-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.85rem 1rem;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: var(--font-heading);
          font-weight: 500;
          font-size: 0.95rem;
          text-align: left;
          transition: all 0.2s ease;
          position: relative;
        }

        .menu-link:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.03);
        }

        .menu-link.active {
          color: #ffffff;
          background: var(--primary);
          box-shadow: 0 4px 12px var(--primary-glow);
        }

        .nav-badge {
          position: absolute;
          right: 0.75rem;
          background: var(--whatsapp);
          color: white;
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.15rem 0.4rem;
          border-radius: var(--radius-full);
          text-transform: uppercase;
        }

        .sidebar-footer {
          margin-top: auto;
          border-top: 1px solid var(--border-color);
          padding-top: 1.5rem;
        }

        .theme-toggle {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          width: 100%;
          cursor: pointer;
          font-family: var(--font-heading);
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .theme-toggle:hover {
          color: var(--text-primary);
          background: rgba(0, 0, 0, 0.25);
          border-color: var(--text-muted);
        }

        .content-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .main-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2.5rem;
          margin: 1.5rem 2.5rem 0 2.5rem;
          border-radius: var(--radius-md);
        }

        .header-info h1 {
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.03em;
        }

        .header-date {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-top: 0.25rem;
          text-transform: capitalize;
        }

        .header-status {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.2);
          padding: 0.4rem 0.8rem;
          border-radius: var(--radius-full);
        }

        .dot {
          width: 8px;
          height: 8px;
          background-color: var(--whatsapp);
          border-radius: 50%;
          display: inline-block;
        }

        .dot.pulse {
          box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
          }
        }

        .status-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--whatsapp);
        }

        .clinic-logo-img {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid var(--primary);
          object-fit: cover;
          box-shadow: var(--shadow-sm);
        }

        @media (max-width: 992px) {
          .glass-sidebar {
            width: 220px;
          }
          .main-header {
            margin: 1.5rem 1.5rem 0 1.5rem;
            padding: 1.25rem 1.5rem;
          }
        }

        @media (max-width: 768px) {
          .glass-sidebar {
            width: 100%;
            height: auto;
            position: relative;
            padding: 1.25rem;
          }
          .sidebar-brand {
            margin-bottom: 1.5rem;
          }
          .sidebar-menu {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 0.25rem;
          }
          .menu-link {
            padding: 0.6rem 0.8rem;
            font-size: 0.85rem;
          }
          .sidebar-footer {
            display: none;
          }
          .main-header {
            margin: 1rem 1rem 0 1rem;
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          .header-status {
            width: 100%;
            justify-content: space-between;
          }
        }
      `}</style>
    </div>
  );
}

export default App;
