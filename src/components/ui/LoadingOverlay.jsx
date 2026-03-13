import React, { useState, useEffect, useRef } from 'react';

const FUN_FACTS = [
  "Did you know? The average student spends 6+ hours per day in school.",
  "Did you know? 87% of students perform better in small class sizes (under 20 students).",
  "Did you know? Extracurricular activities boost college admissions by 40%.",
  "Did you know? Schools with outdoor learning spaces improve focus by 25%.",
  "Did you know? Peer relationships are the #1 factor in student happiness.",
  "Did you know? A 10-minute commute vs 45-minute commute affects academic performance.",
];

export default function LoadingOverlay({ isVisible, onTransitionComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const timersRef = useRef([]);

  useEffect(() => {
    if (!isVisible) return;
    setCurrentStep(0);
    setFactIndex(Math.floor(Math.random() * FUN_FACTS.length));
    const t1 = setTimeout(() => setCurrentStep(1), 2000);
    const t2 = setTimeout(() => setCurrentStep(2), 4000);
    const t3 = setInterval(() => setFactIndex(i => (i + 1) % FUN_FACTS.length), 5000);
    timersRef.current = [t1, t2, t3];
    return () => timersRef.current.forEach(t => typeof t === 'function' ? t() : clearTimeout(t));
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      background: '#f8f9fb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', width: '100%', padding: '20px' }}>
        <div style={{
          background: 'rgba(20,184,166,0.1)',
          border: '1px solid rgba(20,184,166,0.25)',
          padding: '8px 20px',
          borderRadius: '20px',
          fontSize: '13px',
          color: '#18968a',
          display: 'inline-block',
          marginBottom: '32px',
          fontWeight: '500'
        }}>
          Finding Your Matches...
        </div>

        {/* Progress Steps */}
        <div style={{ margin: '36px auto', fontSize: '14px', color: '#334155', textAlign: 'left', display: 'inline-block' }}>
          {['Analyzing preferences', 'Matching with schools', 'Ranking top picks'].map((label, i) => (
            <div key={i} style={{
              opacity: i <= currentStep ? 1 : 0.35,
              padding: '8px 0',
              transition: 'opacity 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: i <= currentStep ? '#14B8A6' : 'transparent',
                border: `2px solid ${i <= currentStep ? '#14B8A6' : '#cbd5e1'}`,
                color: 'white',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                {i <= currentStep ? '✓' : '○'}
              </span>
              {label}
              {i <= currentStep && (
                <div style={{
                  height: '3px',
                  width: '0px',
                  background: '#14B8A6',
                  borderRadius: '2px',
                  marginLeft: 'auto',
                  animation: 'fillBar 1s ease forwards'
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Fun Fact */}
        <div style={{
          marginTop: '40px',
          padding: '16px',
          background: 'rgba(51,65,85,0.05)',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#64748b',
          minHeight: '50px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeInFact 0.5s ease'
        }}>
          {FUN_FACTS[factIndex]}
        </div>

        <style>{`
          @keyframes fillBar {
            from { width: 0px; }
            to { width: 60px; }
          }
          @keyframes fadeInFact {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}