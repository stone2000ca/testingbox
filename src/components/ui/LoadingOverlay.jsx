import React, { useState, useEffect, useRef, useCallback } from 'react';

const MIN_LOADER_MS = 3000;
const TIMEOUT_MS = 30000;

const STEPS = [
  { label: 'Analyzing preferences', icon: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  ) },
  { label: 'Matching with schools', icon: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  ) },
  { label: 'Ranking top picks', icon: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  ) },
];


const FACTS = [
  "Private school students average 8 more library visits per year.",
  "Small class sizes are linked to stronger critical thinking skills.",
  "Students who feel matched to their school report 40% higher engagement.",
  "Schools with outdoor programs see improved student focus and creativity.",
  "Over 60% of private schools offer needs-based financial aid.",
  "The average private school class has fewer than 18 students.",
  "Bilingual education can improve problem-solving ability by up to 20%.",
  "Families who visit 3+ schools report higher satisfaction with their choice.",
  "Schools with strong arts programs see higher academic performance overall.",
  "Students in project-based learning develop stronger collaboration skills.",
  "NextSchool matches families using 40+ personalized criteria.",
  "Private schools with mentorship programs report higher acceptance rates.",
  "Experiential learning improves long-term knowledge retention by up to 75%.",
  "Students in robust STEM programs are twice as likely to pursue tech careers.",
  "Schools emphasizing social-emotional learning see fewer behavioral issues.",
  "A strong school-family partnership is the #1 predictor of student success.",
  "Over 80% of private school graduates attend their first-choice university.",
  "Nature-based learning increases student curiosity and self-directed study.",
  "Schools with dedicated advisors see 30% fewer mid-year transfers.",
  "Music education strengthens mathematical reasoning in young learners.",
];

const TEAL = '#18968a';
const GOLD = '#d4a017';
const BG = '#f8f9fb';

const spin = (name, dir) => `@keyframes ${name}{to{transform:translate(-50%,-50%) rotate(${dir}360deg)}}`;
const KEYFRAMES = `
  ${spin('arcCW','')}
  ${spin('arcCCW','-')}
  @keyframes dotPulse{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.4);opacity:1}}
  @keyframes fillBar{from{width:0%}to{width:100%}}
  @keyframes badgePulse{0%,100%{opacity:.85}50%{opacity:1}}
  @keyframes dotOrbitCW{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes dotOrbitCCW{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}
  @keyframes iconPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.08)}}
  @keyframes iconLook{0%,100%{transform:rotate(0deg)}25%{transform:rotate(6deg)}75%{transform:rotate(-6deg)}}
  @keyframes tealFlash{0%{opacity:0}40%{opacity:1}100%{opacity:1}}
`;


const DOT_CONFIG = [
  { radius: 50, duration: 8, direction: 'CW', delayOffset: 0 },
  { radius: 50, duration: 8, direction: 'CW', delayOffset: -4 },
  { radius: 65, duration: 10, direction: 'CCW', delayOffset: -1.7 },
  { radius: 65, duration: 10, direction: 'CCW', delayOffset: -6.7 },
  { radius: 80, duration: 7, direction: 'CW', delayOffset: -2.3 },
];

export default function LoadingOverlay({ isVisible, onTransitionComplete }) {
  const [flashActive, setFlashActive] = useState(false);
  const [step, setStep] = useState(0);
  const [factIdx, setFactIdx] = useState(() => Math.floor(Math.random() * FACTS.length));
  const [factVisible, setFactVisible] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const timers = useRef([]);
  const minReady = useRef(false);
  const pending = useRef(false);
  const wasVisible = useRef(false);
  const onCompleteRef = useRef(onTransitionComplete);
  onCompleteRef.current = onTransitionComplete;

  const clear = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const t = useCallback((fn, ms) => { const id = setTimeout(fn, ms); timers.current.push(id); return id; }, []);

  useEffect(() => {
    if (!isVisible) {
      if (wasVisible.current) {
        if (minReady.current) { 
          setFlashActive(true);
          setTimeout(() => onCompleteRef.current?.(), 450);
        }

        else { pending.current = true; }
      }
      return;
    }
    wasVisible.current = true;
    pending.current = false;
    minReady.current = false;
    setFlashActive(false);
    setStep(0); setTimedOut(false); setFactVisible(true);
    setFactIdx(Math.floor(Math.random() * FACTS.length));

    t(() => setStep(1), 2000);
    t(() => setStep(2), 4000);
    t(() => {
      minReady.current = true;
      if (pending.current) { 
          pending.current = false; 
          setFlashActive(true);
          setTimeout(() => onCompleteRef.current?.(), 450);
        }
    }, MIN_LOADER_MS);
    t(() => setTimedOut(true), TIMEOUT_MS);

    const factInterval = setInterval(() => {
      setFactVisible(false);
      setTimeout(() => { setFactIdx(i => (i + 1) % FACTS.length); setFactVisible(true); }, 400);
    }, 4000);
    timers.current.push(factInterval);

    return clear;
  }, [isVisible, onTransitionComplete, t, clear]);

  useEffect(() => clear, [clear]);

  if (!isVisible && !wasVisible.current) return null;
  if (!isVisible && !flashActive) return null;

  if (flashActive) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:10001,background:TEAL,animation:'tealFlash 0.45s ease-out forwards'}}>
        <style>{KEYFRAMES}</style>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:10000,background:BG,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{textAlign:'center',padding:40}}>
          <div style={{fontSize:48,marginBottom:16}}>⏳</div>
          <h3 style={{color:'#334155',marginBottom:8}}>Taking longer than expected</h3>
          <p style={{color:'#64748b',marginBottom:24}}>The search is still running. You can wait or try again.</p>
          <button onClick={() => onCompleteRef.current?.()} style={{background:TEAL,color:'#fff',border:'none',borderRadius:8,padding:'10px 28px',fontSize:15,cursor:'pointer'}}>Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:10000,background:BG,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column'}}>

      <style>{KEYFRAMES}</style>
      <div style={{textAlign:'center',maxWidth:420,width:'100%',padding:'0 20px'}}>
        {/* Status Badge */}
        <div style={{display:'inline-block',background:`rgba(24,150,138,0.1)`,border:`1px solid rgba(24,150,138,0.25)`,padding:'6px 18px',borderRadius:20,fontSize:13,color:TEAL,fontWeight:500,animation:'badgePulse 2s ease-in-out infinite',marginBottom:28}}>Finding Your Matches...</div>

        {/* Orbit */}
        <div style={{position:'relative',width:160,height:160,margin:'0 auto 28px'}}>
          {[100,130,160].map(d=>(<div key={d} style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:d,height:d,borderRadius:'50%',border:`1px solid rgba(24,150,138,0.3)`}}/>))}
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:130,height:130,borderRadius:'50%',borderTop:`2.5px solid ${TEAL}`,borderRight:`2.5px solid ${TEAL}`,borderBottom:'2.5px solid transparent',borderLeft:'2.5px solid transparent',animation:'arcCW 3s linear infinite'}}/>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:160,height:160,borderRadius:'50%',borderTop:`2.5px solid ${TEAL}`,borderRight:`2.5px solid ${TEAL}`,borderBottom:'2.5px solid transparent',borderLeft:'2.5px solid transparent',animation:'arcCCW 4.5s linear infinite'}}/>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:52,height:52,borderRadius:'50%',background:'#fff',boxShadow:'0 2px 12px rgba(0,0,0,0.08)',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40.54 38.56" width="32" height="32"><path fill={TEAL} d="M20.21,0h-11.7L0,8.48l7,10.78L0,30.05l8.52,8.52h12.76l19.26-19.3L21.28,0h-1.06ZM37.53,19.27l-16.26,16.29-.09-.09-5.7-5.7,6.06-9.34.75-1.16-.75-1.16-6.06-9.34,5.79-5.76.58.58,15.68,15.68Z"/><polygon fill="#fff" points="15.48 8.77 21.54 18.11 22.29 19.26 21.54 20.42 15.48 29.76 21.18 35.46 21.28 35.56 37.53 19.27 21.85 3.59 21.27 3.01 15.48 8.77"/></svg>
          </div>
            {DOT_CONFIG.map((d,i)=>(
              <div key={i} style={{position:'absolute',top:'50%',left:'50%',width:0,height:0,animation:`dotOrbit${d.direction} ${d.duration}s linear infinite`,animationDelay:`${d.delayOffset}s`}}>
                <div style={{position:'absolute',transform:`translateX(${d.radius}px) translate(-5px, -5px)`}}>
                  <div style={{width:10,height:10,background:GOLD,borderRadius:'50%',boxShadow:'0 0 6px rgba(212,160,23,.4)',animation:'dotPulse 2s ease-in-out infinite',animationDelay:`${i*0.4}s`}}/>
                </div>
              </div>
            ))}
        </div>

        {/* Progress Steps */}
        <div style={{textAlign:'left',marginBottom:24}}>
          {STEPS.map((s,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',opacity:i<=step?1:0.35,transition:'opacity 0.3s'}}>
              <span style={{width:24,textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
                {i<step 
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  : s.icon(i<=step ? TEAL : '#94a3b8')
                }
              </span>
              <span style={{flex:1,fontSize:14,color:'#334155'}}>{s.label}</span>
              <div style={{width:60,height:3,background:'#e2e8f0',borderRadius:2,overflow:'hidden'}}>
                {i<=step && <div style={{height:'100%',background:TEAL,borderRadius:2,animation:i===step?'fillBar 1.8s ease-out forwards':'none',width:i<step?'100%':'0%'}}/>}
              </div>
            </div>
          ))}
        </div>

        {/* Fun Facts */}
        <div style={{background:'rgba(51,65,85,0.04)',border:'1px solid rgba(24,150,138,0.15)',borderRadius:8,padding:16,minHeight:60,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{textAlign:'center',opacity:factVisible?1:0,transform:factVisible?'translateY(0)':'translateY(8px)',transition:'opacity 0.4s, transform 0.4s'}}>
            <span style={{color:TEAL,fontWeight:600,marginRight:4,fontSize:13}}>Did you know?</span>
            <span style={{color:'#64748b',fontSize:13}}>{FACTS[factIdx]}</span>
          </div>
        </div>
      </div>
    </div>
  );
}