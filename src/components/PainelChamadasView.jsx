import React, { useState, useEffect, useRef } from 'react';
import { Play, Volume2, VolumeX, Maximize, Minimize, Tv, Calendar } from 'lucide-react';

function PainelChamadasView() {
  const [chamadas, setChamadas] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentCall, setCurrentCall] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);

  const prevCallIdRef = useRef(null);

  useEffect(() => {
    fetchChamadas();
    const interval = setInterval(fetchChamadas, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchChamadas = async () => {
    try {
      const res = await fetch('/api/chamadas/lista');
      const data = await res.json();
      setChamadas(data);
      
      if (data.length > 0) {
        const lastCall = data[0];
        
        // Se for uma nova chamada (ID diferente do último visto)
        if (prevCallIdRef.current !== null && prevCallIdRef.current !== lastCall.id) {
          triggerNewCallEvent(lastCall);
        }
        
        // Configurar a chamada atual em destaque
        setCurrentCall(lastCall);
        prevCallIdRef.current = lastCall.id;
      }
    } catch (err) {
      console.error(err);
    }
  };

  const triggerNewCallEvent = (call) => {
    // 1. Iniciar efeito de piscar
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 8000); // Para o piscar após 8 segundos

    if (soundEnabled) {
      // 2. Tocar som de gongo/chime
      playChimeSound();
      
      // 3. Chamar voz de IA falando nome do paciente e sala após o som (atraso de 800ms)
      setTimeout(() => {
        speakCallText(call.paciente_nome, call.sala_nome);
      }, 900);
    }
  };

  // Sintetizar áudio de gongo eletrônico
  const playChimeSound = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      // Nota 1 (C5 - 523.25Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);
      
      // Nota 2 (E5 - 659.25Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.25);
      gain2.gain.setValueAtTime(0.2, now + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.25);
      osc2.stop(now + 0.85);
    } catch (e) {
      console.warn('Erro ao tocar chime áudio:', e);
    }
  };

  // Sintetizar voz do navegador (TTS)
  const speakCallText = (pacienteNome, salaNome) => {
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel(); // Cancelar fala ativa
      
      const text = `Atenção. Paciente, ${pacienteNome}, favor dirigir-se ao, ${salaNome}.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang.startsWith('pt'));
      if (ptVoice) utterance.voice = ptVoice;
      
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Erro na síntese de voz:', e);
    }
  };

  const handleTestCall = () => {
    if (currentCall) {
      triggerNewCallEvent(currentCall);
    } else {
      alert('Nenhuma chamada pendente para teste.');
    }
  };

  const toggleFullscreen = () => {
    setFullscreen(!fullscreen);
  };

  // Formatar horário da chamada HH:MM:SS
  const formatTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    return dateTimeStr.split(' ')[1];
  };

  return (
    <div className={`painel-chamadas-container ${fullscreen ? 'fullscreen-active' : ''}`}>
      {/* Control Bar */}
      <div className="panel-controls glass-panel">
        <div className="status-meta">
          <Tv size={18} className="text-primary" />
          <span>Monitor da Sala de Espera (Sincronizado)</span>
        </div>

        <div className="controls-group">
          <button className="btn btn-secondary control-btn" onClick={handleTestCall} disabled={!currentCall}>
            <Play size={14} /> Testar Chamada
          </button>
          
          <button className="btn btn-secondary control-btn" onClick={() => setSoundEnabled(!soundEnabled)}>
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {soundEnabled ? 'Som Ativo' : 'Som Mudo'}
          </button>

          <button className="btn btn-primary control-btn" onClick={toggleFullscreen}>
            {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
            {fullscreen ? 'Sair Tela Cheia' : 'Tela Cheia'}
          </button>
        </div>
      </div>

      <div className="panel-layout-grid">
        {/* Chamada Principal em Destaque */}
        <div className={`glass-panel main-call-card ${isFlashing ? 'pulse-alert' : ''}`}>
          <span className="call-title-label">CHAMADA ATUAL</span>
          
          {currentCall ? (
            <div className="call-main-content">
              <h1 className="patient-huge-name">{currentCall.paciente_nome}</h1>
              <div className="destination-room-box">
                <h2>{currentCall.sala_nome}</h2>
              </div>
              <div className="doc-signature">
                <span>Atendimento com:</span>
                <strong>{currentCall.medico_nome}</strong>
              </div>
            </div>
          ) : (
            <div className="empty-call-state">
              <Calendar size={60} className="text-muted" />
              <h2>Nenhum paciente chamado ainda</h2>
              <p>Os chamados emitidos pelos médicos aparecerão em tempo real nesta tela.</p>
            </div>
          )}
        </div>

        {/* Histórico Lateral das Últimas Chamadas */}
        <div className="glass-panel history-calls-card">
          <h3>ÚLTIMAS CHAMADAS</h3>
          
          {chamadas.length <= 1 ? (
            <p className="no-history-text">Sem histórico de chamadas recentes.</p>
          ) : (
            <div className="history-list">
              {chamadas.slice(1, 6).map((c) => (
                <div key={c.id} className="history-item">
                  <div className="history-meta">
                    <span className="h-time">{formatTime(c.data_hora)}</span>
                    <span className="h-room">{c.sala_nome}</span>
                  </div>
                  <h4 className="h-name">{c.paciente_nome}</h4>
                  <span className="h-doc">Dr(a). {c.medico_nome}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .painel-chamadas-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: calc(100vh - 180px);
          transition: all 0.3s ease;
        }

        .painel-chamadas-container.fullscreen-active {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100vw;
          height: 100vh;
          z-index: 9999;
          background: #060913;
          padding: 2rem;
          gap: 2rem;
        }

        .panel-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1.5rem;
        }

        .status-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .controls-group {
          display: flex;
          gap: 0.75rem;
        }

        .control-btn {
          padding: 0.4rem 0.85rem;
          font-size: 0.85rem;
        }

        .panel-layout-grid {
          display: grid;
          grid-template-columns: 2.2fr 1fr;
          gap: 1.5rem;
          flex: 1;
          height: 100%;
        }

        .fullscreen-active .panel-layout-grid {
          height: calc(100vh - 120px);
        }

        .main-call-card {
          padding: 3rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          position: relative;
          background: radial-gradient(circle at center, rgba(17, 28, 54, 0.6) 0%, rgba(8, 13, 26, 0.6) 100%);
          border-width: 2px;
        }

        .call-title-label {
          position: absolute;
          top: 2rem;
          left: 3rem;
          font-family: var(--font-heading);
          font-size: 1.2rem;
          font-weight: 800;
          letter-spacing: 0.15em;
          color: var(--primary);
          text-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
        }

        .call-main-content {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2.5rem;
        }

        .patient-huge-name {
          font-family: var(--font-heading);
          font-size: 4.5rem;
          font-weight: 850;
          letter-spacing: -0.04em;
          line-height: 1.1;
          color: #ffffff;
          text-shadow: 0 0 30px rgba(255, 255, 255, 0.2);
          text-transform: uppercase;
        }

        .fullscreen-active .patient-huge-name {
          font-size: 5.5rem;
        }

        .destination-room-box {
          background: rgba(236, 72, 153, 0.08);
          border: 2px solid rgba(236, 72, 153, 0.3);
          box-shadow: 0 0 20px rgba(236, 72, 153, 0.15);
          padding: 1.5rem 4rem;
          border-radius: var(--radius-lg);
          display: inline-block;
          animation: glowRoom 2s infinite alternate;
        }

        @keyframes glowRoom {
          from { box-shadow: 0 0 15px rgba(236, 72, 153, 0.1); }
          to { box-shadow: 0 0 30px rgba(236, 72, 153, 0.35); }
        }

        .destination-room-box h2 {
          font-size: 3.25rem;
          font-weight: 800;
          color: #ec4899;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .fullscreen-active .destination-room-box h2 {
          font-size: 4rem;
        }

        .doc-signature {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .doc-signature span {
          font-size: 0.95rem;
          color: var(--text-secondary);
        }

        .doc-signature strong {
          font-size: 1.5rem;
          color: var(--text-primary);
        }

        .empty-call-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          color: var(--text-secondary);
        }

        .empty-call-state h2 {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        /* Histórico lateral */
        .history-calls-card {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .history-calls-card h3 {
          font-size: 1rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.75rem;
        }

        .no-history-text {
          font-size: 0.85rem;
          color: var(--text-muted);
          text-align: center;
          padding-top: 2rem;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow-y: auto;
          flex: 1;
        }

        .history-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.15);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
        }

        .history-meta {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .h-time {
          color: var(--primary);
        }

        .h-room {
          color: #ec4899;
          text-transform: uppercase;
        }

        .h-name {
          font-size: 1.15rem;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .h-doc {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        /* Pulse Alert Flash */
        .pulse-alert {
          animation: pulseBorder 1s infinite alternate;
        }

        @keyframes pulseBorder {
          from {
            border-color: rgba(236, 72, 153, 0.4);
            box-shadow: 0 0 10px rgba(236, 72, 153, 0.2);
          }
          to {
            border-color: rgba(236, 72, 153, 1);
            box-shadow: 0 0 40px rgba(236, 72, 153, 0.6);
            background-color: rgba(236, 72, 153, 0.03);
          }
        }

        @media (max-width: 992px) {
          .panel-layout-grid {
            grid-template-columns: 1fr;
          }
          .main-call-card {
            padding: 2rem;
            min-height: 400px;
          }
          .patient-huge-name {
            font-size: 3rem;
          }
          .destination-room-box h2 {
            font-size: 2.25rem;
          }
        }
      `}</style>
    </div>
  );
}

export default PainelChamadasView;
