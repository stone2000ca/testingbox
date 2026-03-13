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

        {/* Orbit Animation */}
        <div style={{
          position: 'relative',
          width: '160px',
          height: '160px',
          margin: '0 auto 28px',
        }}>
          {/* Static Rings */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            border: '1px solid rgba(24,150,138,0.3)',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            border: '1px solid rgba(24,150,138,0.3)',
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '160px',
            height: '160px',
            borderRadius: '50%',
            border: '1px solid rgba(24,150,138,0.3)',
          }} />

          {/* Spinning Arc 1 (130px, 3s) */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '130px',
            height: '130px',
            borderRadius: '50%',
            borderTop: '2.5px solid #18968a',
            borderRight: '2.5px solid #18968a',
            borderBottom: '2.5px solid transparent',
            borderLeft: '2.5px solid transparent',
            animation: 'spin 3s linear infinite',
          }} />

          {/* Spinning Arc 2 (160px, 4.5s reverse) */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '160px',
            height: '160px',
            borderRadius: '50%',
            borderTop: '2.5px solid #18968a',
            borderRight: '2.5px solid #18968a',
            borderBottom: '2.5px solid transparent',
            borderLeft: '2.5px solid transparent',
            animation: 'spin 4.5s linear infinite reverse',
          }} />

          {/* Center Circle with Logo */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40.54 38.56' width='36' height='36'>
              <path fill='#18968a' d='M20.21,0h-11.7L0,8.48l7,10.78L0,30.05l8.52,8.52h12.76l19.26-19.3L21.28,0h-1.06ZM37.53,19.27l-16.26,16.29-.09-.09-5.7-5.7,6.06-9.34.75-1.16-.75-1.16-6.06-9.34,5.79-5.76.58.58,15.68,15.68Z' />
              <polygon fill='#fff' points='15.48 8.77 21.54 18.11 22.29 19.26 21.54 20.42 15.48 29.76 21.18 35.46 21.28 35.56 37.53 19.27 21.85 3.59 21.27 3.01 15.48 8.77' />
            </svg>
          </div>

          {/* Gold Dots */}
          {[
            { top: '5px', left: '75px', delay: '0s' },
            { top: '30px', left: '140px', delay: '0.4s' },
            { top: '115px', left: '145px', delay: '0.8s' },
            { top: '140px', left: '55px', delay: '1.2s' },
            { top: '40px', left: '10px', delay: '1.6s' },
          ].map((dot, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: dot.top,
                left: dot.left,
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#d4a017',
                animation: `pulse 2s ease-in-out infinite`,
                animationDelay: dot.delay,
              }}
            />
          ))}
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
          @keyframes spin {
            to {
              transform: translate(-50%, -50%) rotate(360deg);
            }
          }
          @keyframes pulse {
            0%, 100% {
              transform: scale(1);
              opacity: 0.85;
            }
            50% {
              transform: scale(1.5);
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}