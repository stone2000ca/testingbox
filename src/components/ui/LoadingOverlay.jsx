import React, { useState, useEffect, useRef } from 'react';

export default function LoadingOverlay({ isVisible, onRetry }) {
  const [showError, setShowError] = useState(false);
  const [tealFlash, setTealFlash] = useState(false);
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
    if (!isVisible) {
      cleanupTimers.current();
      return;
    }

    setShowError(false);
    setTealFlash(false);

    // Teal flash animation (0-100ms)
    timerRef.current.flashTimeout = setTimeout(() => {
      setTealFlash(true);
    }, 0);
    timerRef.current.flashClearTimeout = setTimeout(() => {
      setTealFlash(false);
    }, 100);

    // 30s timeout
    timerRef.current.errorTimeout = setTimeout(() => {
      setShowError(true);
    }, 30000);

    return () => cleanupTimers.current();
  }, [isVisible]);

  const handleRetryClick = () => {
    setShowError(false);
    setTealFlash(false);
    cleanupTimers.current();

    // Restart animation
    timerRef.current.flashTimeout = setTimeout(() => {
      setTealFlash(true);
    }, 0);
    timerRef.current.flashClearTimeout = setTimeout(() => {
      setTealFlash(false);
    }, 100);
    timerRef.current.errorTimeout = setTimeout(() => {
      setShowError(true);
    }, 30000);

    if (onRetry) onRetry();
  };

  if (!isVisible) return null;

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
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes pulse-dot-0 {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes pulse-dot-1 {
          0%, 100% { opacity: 0.3; }
          33%, 100% { opacity: 1; }
        }
        @keyframes pulse-dot-2 {
          0%, 100% { opacity: 0.3; }
          66%, 100% { opacity: 1; }
        }
        @keyframes tealFlash {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }

        .teal-flash {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #18968a;
          opacity: 0;
          pointer-events: none;
          z-index: 999;
          animation: ${tealFlash ? 'tealFlash 0.1s ease-out' : 'none'};
        }

        .loader-screen {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #f8f9fb;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }

        .loader-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 48px;
        }

        .status-badge {
          background: #18968a;
          color: white;
          padding: 8px 24px;
          border-radius: 9999px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .orbit-container {
          position: relative;
          width: 280px;
          height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .orbit-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(24, 150, 138, 0.15);
        }

        .ring-1 { width: 120px; height: 120px; }
        .ring-2 { width: 160px; height: 160px; }
        .ring-3 { width: 200px; height: 200px; }

        .orbit-arc {
          position: absolute;
          width: 200px;
          height: 200px;
          border: 2px solid transparent;
          border-radius: 50%;
          top: 40px;
          left: 40px;
        }

        .arc-1 {
          border-top: 2px solid #18968a;
          border-right: 2px solid #18968a;
          animation: spinClockwise 3s linear infinite;
        }

        .arc-2 {
          border-top: 2px solid #18968a;
          border-right: 2px solid #18968a;
          opacity: 0.6;
          animation: spinCounterClockwise 4.5s linear infinite;
        }

        .center-icon {
          position: absolute;
          width: 80px;
          height: 80px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          z-index: 10;
        }

        .center-icon svg {
          width: 52px;
          height: 52px;
        }

        .orbit-dots {
          position: absolute;
          width: 200px;
          height: 200px;
          top: 40px;
          left: 40px;
        }

        .dot {
          position: absolute;
          width: 8px;
          height: 8px;
          background: #d4a017;
          border-radius: 50%;
        }

        .dot-0 { top: 0; left: 50%; transform: translateX(-50%); animation: pulseDot 2.5s ease-in-out infinite; }
        .dot-1 { top: 29.3%; right: 0; animation: pulseDot 2.5s ease-in-out infinite 0.5s; }
        .dot-2 { bottom: 29.3%; right: 0; animation: pulseDot 2.5s ease-in-out infinite 1s; }
        .dot-3 { bottom: 0; left: 50%; transform: translateX(-50%); animation: pulseDot 2.5s ease-in-out infinite 1.5s; }
        .dot-4 { top: 29.3%; left: 0; animation: pulseDot 2.5s ease-in-out infinite 2s; }

        .error-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 51;
        }

        .error-dialog {
          background: white;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          max-width: 400px;
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
          margin-bottom: 32px;
          line-height: 1.5;
        }

        .retry-button {
          background: #18968a;
          color: white;
          border: none;
          padding: 10px 28px;
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

      <div className="teal-flash" id="tealFlash"></div>

      <div className="loader-screen" id="loaderScreen">
        <div className="loader-content">
          <div className="status-badge">Finding Your Matches...</div>

          <div className="orbit-container">
            <div className="orbit-ring ring-1"></div>
            <div className="orbit-ring ring-2"></div>
            <div className="orbit-ring ring-3"></div>

            <div className="orbit-arc arc-1"></div>
            <div className="orbit-arc arc-2"></div>

            <div className="orbit-dots">
              <div className="dot dot-0"></div>
              <div className="dot dot-1"></div>
              <div className="dot dot-2"></div>
              <div className="dot dot-3"></div>
              <div className="dot dot-4"></div>
            </div>

            <div className="center-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40.54 38.56">
                <path fill="#18968a" d="M20.21,0h-11.7L0,8.48l7,10.78L0,30.05l8.52,8.52h12.76l19.26-19.3L21.28,0h-1.06ZM37.53,19.27l-16.26,16.29-.09-.09-5.7-5.7,6.06-9.34.75-1.16-.75-1.16-6.06-9.34,5.79-5.76.58.58,15.68,15.68Z"/>
                <polygon fill="#ffffff" points="15.48 8.77 21.54 18.11 22.29 19.26 21.54 20.42 15.48 29.76 21.18 35.46 21.28 35.56 3.38 17.62 15.48 8.77"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {showError && (
        <div className="error-overlay">
          <div className="error-dialog">
            <div className="error-title">Taking longer than expected</div>
            <div className="error-message">
              This shouldn't usually take this long. Try clicking retry or reach out for support.
            </div>
            <button className="retry-button" onClick={handleRetryClick}>
              Retry
            </button>
          </div>
        </div>
      )}
    </>
  );
}