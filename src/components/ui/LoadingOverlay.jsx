import React, { useState, useEffect } from 'react';

const FUN_FACTS = [
  "Private school students average 8 more library visits per year.",
  "Small class sizes are linked to stronger critical thinking skills.",
  "Students who feel matched to their school report 40% higher engagement.",
  "Schools with outdoor programs see improved student focus and creativity.",
  "Over 60% of private schools offer needs-based financial aid.",
  "The average private school class has fewer than 18 students.",
];

export default function LoadingOverlay({ visible, statusMessage = 'Finding Your Matches...', onTransitionComplete }) {
  const [showFlash, setShowFlash] = useState(false);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  // Flash animation on mount
  useEffect(() => {
    if (visible && !showFlash) {
      setShowFlash(true);
      setFlashOpacity(1);
      const timer = setTimeout(() => setFlashOpacity(0), 350);
      return () => clearTimeout(timer);
    }
  }, [visible, showFlash]);

  // Rotating facts
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setFactIndex(i => (i + 1) % FUN_FACTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [visible]);

  // Handle fade out
  useEffect(() => {
    if (!visible && showFlash) {
      setFadeOut(true);
      const timer = setTimeout(() => {
        setFadeOut(false);
        setShowFlash(false);
        if (onTransitionComplete) onTransitionComplete();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [visible, showFlash, onTransitionComplete]);

  if (!visible && !showFlash) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: '#f8f9fb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.4s ease',
      }}
    >
      {/* Teal Flash */}
      {showFlash && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#18968a',
            opacity: flashOpacity,
            transition: 'opacity 0.35s ease',
            pointerEvents: 'none',
            zIndex: 10001,
          }}
        />
      )}

      {/* Loader Content */}
      <div style={{ textAlign: 'center', maxWidth: '600px', width: '100%', padding: '20px', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
        {/* Status Badge */}
        <div
          style={{
            background: 'rgba(24,150,138,0.1)',
            border: '1px solid rgba(24,150,138,0.25)',
            padding: '6px 18px',
            borderRadius: '20px',
            fontSize: '13px',
            color: '#18968a',
            display: 'inline-block',
            fontWeight: '500',
            animation: 'pulse 2s ease-in-out infinite',
          }}
        >
          {statusMessage}
        </div>

        {/* Orbit Container */}
        <div
          style={{
            position: 'relative',
            width: '160px',
            height: '160px',
            margin: '0 auto',
          }}
        >
          {/* Concentric Rings */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              border: '1px solid rgba(24,150,138,0.3)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '130px',
              height: '130px',
              borderRadius: '50%',
              border: '1px solid rgba(24,150,138,0.3)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              border: '1px solid rgba(24,150,138,0.3)',
            }}
          />

          {/* Rotating Arc 1 (130px, 8s) */}
          <div
            style={{
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
              animation: 'spin 8s linear infinite',
            }}
          />

          {/* Rotating Arc 2 (160px, 12s reverse) */}
          <div
            style={{
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
              animation: 'spin 12s linear infinite reverse',
            }}
          />

          {/* Center Logo */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'white',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40.54 38.56" width="32" height="32">
              <path fill="#18968a" d="M20.21,0h-11.7L0,8.48l7,10.78L0,30.05l8.52,8.52h12.76l19.26-19.3L21.28,0h-1.06ZM37.53,19.27l-16.26,16.29-.09-.09-5.7-5.7,6.06-9.34.75-1.16-.75-1.16-6.06-9.34,5.79-5.76.58.58,15.68,15.68Z" />
              <polygon fill="#fff" points="15.48 8.77 21.54 18.11 22.29 19.26 21.54 20.42 15.48 29.76 21.18 35.46 21.28 35.56 37.53 19.27 21.85 3.59 21.27 3.01 15.48 8.77" />
            </svg>
          </div>

          {/* Gold Orbit Dots */}
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
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#e8a838',
                animation: `dotPulse 2s ease-in-out infinite`,
                animationDelay: dot.delay,
              }}
            />
          ))}
        </div>

        {/* Progress Steps */}
        <div style={{ fontSize: '14px', color: '#334155', textAlign: 'left', display: 'inline-block' }}>
          {[
            { emoji: '📋', label: 'Analyzing your preferences', progress: 0 },
            { emoji: '👓', label: 'Matching with schools', progress: 1 },
            { emoji: '⭐', label: 'Ranking your top picks', progress: 2 },
          ].map((step, i) => (
            <div
              key={i}
              style={{
                opacity: i <= Math.min(Math.floor((Date.now() % 9000) / 3000), 2) ? 1 : 0.4,
                padding: '12px 0',
                transition: 'opacity 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '16px' }}>{step.emoji}</span>
              <span>{step.label}</span>
              <div
                style={{
                  height: '3px',
                  width: '60px',
                  background: '#cbd5e1',
                  borderRadius: '2px',
                  marginLeft: 'auto',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: '#18968a',
                    borderRadius: '2px',
                    animation: `progressBar 9s linear infinite`,
                    animationDelay: `${-i * 3}s`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Fun Fact Box */}
        <div
          style={{
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
            position: 'relative',
            border: '1px solid rgba(24,150,138,0.15)',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              animation: 'fadeInFact 0.5s ease',
            }}
          >
            <span style={{ color: '#18968a', fontWeight: 'bold', marginRight: '4px' }}>Did you know?</span>
            <span>{FUN_FACTS[factIndex]}</span>
          </div>
        </div>

        <style>{`
          @keyframes spin {
            to {
              transform: translate(-50%, -50%) rotate(360deg);
            }
          }
          @keyframes pulse {
            0%, 100% {
              opacity: 0.85;
            }
            50% {
              opacity: 1;
            }
          }
          @keyframes dotPulse {
            0%, 100% {
              transform: scale(1);
              opacity: 0.85;
            }
            50% {
              transform: scale(1.4);
              opacity: 1;
            }
          }
          @keyframes progressBar {
            0% {
              width: 0%;
            }
            100% {
              width: 100%;
            }
          }
          @keyframes fadeInFact {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
      </div>
    </div>
  );
}