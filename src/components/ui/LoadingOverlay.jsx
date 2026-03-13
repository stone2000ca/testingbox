import React, { useState, useEffect, useRef } from 'react';

const FUN_FACTS = [
  "NextSchool users find their perfect school 40% faster on average.",
  "Over 500 schools across Canada and the US are profiled in NextSchool.",
  "Families save an average of 15 hours of research using NextSchool.",
  "Our matching algorithm considers 40+ school attributes.",
  "Private school tuition ranges from $5K to $50K+ annually.",
  "IB and AP programs are available at 35% of profiled schools.",
  "Co-ed schools make up 62% of our database.",
  "The average student spends 6 hours per week at school.",
  "Boarding schools offer immersive educational experiences.",
  "Virtual tours are now available for 80% of schools.",
  "Financial aid is available at over 70% of private schools.",
  "School culture matters more than you might think.",
  "Test scores are just one factor in school fit.",
  "Parent involvement positively impacts student outcomes.",
  "STEM programs are growing rapidly in private schools.",
  "Class sizes average 15-20 students in many schools.",
  "School visits reveal what brochures cannot.",
  "Your child's learning style is unique and valid.",
  "The right school fit can transform a student's trajectory."
];

export default function LoadingOverlay({ isVisible, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [currentFactIndex, setCurrentFactIndex] = useState(0);
  const [showError, setShowError] = useState(false);
  const [factOpacity, setFactOpacity] = useState(1);
  
  const timerRef = useRef({});
  const cleanupTimers = useRef(() => {
    Object.values(timerRef.current).forEach(id => {
      if (typeof id === 'number') {
        clearTimeout(id);
        clearInterval(id);
      }
    });
    timerRef.current = {};
  });

  useEffect(() => {
    if (!isVisible) return;

    // Progress step advancement (every 2s)
    let stepCounter = 0;
    timerRef.current.stepInterval = setInterval(() => {
      setCurrentStep(Math.min(stepCounter + 1, 2));
      stepCounter = Math.min(stepCounter + 1, 2);
    }, 2000);

    // Rotating facts (every 4s with crossfade)
    let factCounter = 0;
    timerRef.current.factCrossfade = setInterval(() => {
      setFactOpacity(0);
      timerRef.current.factTransition = setTimeout(() => {
        factCounter = (factCounter + 1) % FUN_FACTS.length;
        setCurrentFactIndex(factCounter);
        setFactOpacity(1);
      }, 300);
    }, 4000);

    // 30s timeout
    timerRef.current.timeoutCheck = setTimeout(() => {
      setShowError(true);
    }, 30000);

    return () => cleanupTimers.current();
  }, [isVisible]);

  if (!isVisible) return null;

  const handleRetry = () => {
    setShowError(false);
    setCurrentStep(0);
    setCurrentFactIndex(0);
    setFactOpacity(1);
    
    cleanupTimers.current();
    
    // Restart timers
    let stepCounter = 0;
    timerRef.current.stepInterval = setInterval(() => {
      setCurrentStep(Math.min(stepCounter + 1, 2));
      stepCounter = Math.min(stepCounter + 1, 2);
    }, 2000);

    let factCounter = 0;
    timerRef.current.factCrossfade = setInterval(() => {
      setFactOpacity(0);
      timerRef.current.factTransition = setTimeout(() => {
        factCounter = (factCounter + 1) % FUN_FACTS.length;
        setCurrentFactIndex(factCounter);
        setFactOpacity(1);
      }, 300);
    }, 4000);

    timerRef.current.timeoutCheck = setTimeout(() => {
      setShowError(true);
    }, 30000);
  };

  const steps = [
    { label: 'Analyzing your preferences', active: currentStep >= 0 },
    { label: 'Matching with schools', active: currentStep >= 1 },
    { label: 'Ranking your top picks', active: currentStep >= 2 }
  ];

  return (
    <>
      <style>{`
        @keyframes spinClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spinCounterClockwise {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { opacity: 0; }
        }
        .loading-overlay {
          position: fixed;
          inset: 0;
          background: #f8f9fb;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          flex-direction: column;
        }
        .status-badge {
          background: #18968a;
          color: white;
          padding: 8px 24px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 32px;
          letter-spacing: 0.5px;
        }
        .orbit-container {
          position: relative;
          width: 200px;
          height: 200px;
          margin-bottom: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .orbit-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(24, 150, 138, 0.2);
        }
        .orbit-ring-1 { width: 120px; height: 120px; }
        .orbit-ring-2 { width: 160px; height: 160px; }
        .orbit-ring-3 { width: 200px; height: 200px; }
        .arc {
          position: absolute;
          width: 200px;
          height: 200px;
          border-radius: 50%;
        }
        .arc-1 {
          border: 2px solid transparent;
          border-top: 2px solid #18968a;
          border-right: 2px solid #18968a;
          animation: spinClockwise 3s linear infinite;
        }
        .arc-2 {
          border: 2px solid transparent;
          border-top: 2px solid #18968a;
          border-right: 2px solid #18968a;
          animation: spinCounterClockwise 4.5s linear infinite;
          opacity: 0.6;
        }
        .orbital-dots {
          position: absolute;
          width: 200px;
          height: 200px;
        }
        .dot {
          position: absolute;
          width: 8px;
          height: 8px;
          background: #d4a017;
          border-radius: 50%;
        }
        .dot-0 { top: 0; left: 50%; transform: translateX(-50%); animation: pulseDot 2s ease-in-out infinite 0s; }
        .dot-1 { top: 25%; right: 0; animation: pulseDot 2s ease-in-out infinite 0.4s; }
        .dot-2 { bottom: 25%; right: 0; animation: pulseDot 2s ease-in-out infinite 0.8s; }
        .dot-3 { bottom: 0; left: 50%; transform: translateX(-50%); animation: pulseDot 2s ease-in-out infinite 1.2s; }
        .dot-4 { top: 25%; left: 0; animation: pulseDot 2s ease-in-out infinite 1.6s; }
        .orbit-center {
          position: absolute;
          width: 68px;
          height: 68px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          font-size: 32px;
          font-weight: 700;
          color: #1e293b;
        }
        .progress-steps {
          display: flex;
          gap: 32px;
          margin-bottom: 48px;
        }
        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          transition: opacity 0.3s ease;
        }
        .progress-step.inactive {
          opacity: 0.4;
        }
        .step-icon {
          width: 40px;
          height: 40px;
          background: #18968a;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
        }
        .step-label {
          font-size: 13px;
          color: #1e293b;
          font-weight: 500;
          width: 80px;
          text-align: center;
          line-height: 1.3;
        }
        .step-fill {
          width: 60px;
          height: 3px;
          background: #e2e8f0;
          border-radius: 2px;
          overflow: hidden;
        }
        .step-fill-bar {
          height: 100%;
          background: #d4a017;
          border-radius: 2px;
          transition: width 0.3s ease;
        }
        .step-fill-bar.active {
          animation: fillBar 2s ease-out forwards;
        }
        @keyframes fillBar {
          from { width: 0; }
          to { width: 100%; }
        }
        .fact-pill {
          background: rgba(24, 150, 138, 0.08);
          border: 1px solid rgba(24, 150, 138, 0.2);
          border-radius: 12px;
          padding: 16px 24px;
          text-align: center;
          max-width: 380px;
        }
        .fact-label {
          font-size: 11px;
          font-weight: 700;
          color: #18968a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .fact-text {
          font-size: 14px;
          color: #1e293b;
          line-height: 1.5;
          transition: opacity 0.3s ease;
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .error-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 51;
        }
        .error-dialog {
          background: white;
          border-radius: 12px;
          padding: 32px;
          text-align: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          max-width: 360px;
        }
        .error-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 12px;
        }
        .error-message {
          font-size: 14px;
          color: #64748b;
          margin-bottom: 24px;
        }
        .retry-button {
          background: #18968a;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .retry-button:hover {
          background: #0f766e;
        }
      `}</style>

      <div className="loading-overlay">
        {/* Status Badge */}
        <div className="status-badge">Finding Your Matches...</div>

        {/* Orbit Animation */}
        <div className="orbit-container">
          <div className="orbit-ring orbit-ring-1"></div>
          <div className="orbit-ring orbit-ring-2"></div>
          <div className="orbit-ring orbit-ring-3"></div>
          <div className="arc arc-1"></div>
          <div className="arc arc-2"></div>
          <div className="orbital-dots">
            <div className="dot dot-0"></div>
            <div className="dot dot-1"></div>
            <div className="dot dot-2"></div>
            <div className="dot dot-3"></div>
            <div className="dot dot-4"></div>
          </div>
          <div className="orbit-center">🎓</div>
        </div>

        {/* Progress Steps */}
        <div className="progress-steps">
          {steps.map((step, idx) => (
            <div key={idx} className={`progress-step ${step.active ? '' : 'inactive'}`}>
              <div className="step-icon">{idx + 1}</div>
              <div className="step-label">{step.label}</div>
              <div className="step-fill">
                <div className={`step-fill-bar ${step.active ? 'active' : ''}`}></div>
              </div>
            </div>
          ))}
        </div>

        {/* Fun Fact */}
        <div className="fact-pill">
          <div className="fact-label">Did you know?</div>
          <div className="fact-text" style={{ opacity: factOpacity }}>
            {FUN_FACTS[currentFactIndex]}
          </div>
        </div>
      </div>

      {/* Error State */}
      {showError && (
        <div className="error-overlay">
          <div className="error-dialog">
            <div className="error-title">Taking longer than expected</div>
            <div className="error-message">
              This shouldn't usually take this long. Try refreshing or reach out for support.
            </div>
            <button className="retry-button" onClick={handleRetry}>
              Try Again
            </button>
          </div>
        </div>
      )}
    </>
  );
}