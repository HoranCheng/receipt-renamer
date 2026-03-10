export const css = `
@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');
@keyframes spin { to { transform: rotate(360deg) } }
@keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes slideUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.45 } }
@keyframes shimmer { 0% { background-position:-200% 0 } 100% { background-position:200% 0 } }
@keyframes scaleIn { from { opacity:0;transform:scale(0.94) } to { opacity:1;transform:scale(1) } }
@keyframes floatRight { 0%,100% { transform:translate(0,0) rotate(10deg) } 50% { transform:translate(5px,-10px) rotate(18deg) } }
@keyframes floatLeft { 0%,100% { transform:translate(0,0) rotate(-5deg) } 50% { transform:translate(-5px,-8px) rotate(-12deg) } }
@keyframes floatUp { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-8px) } }
@keyframes blink { 0%,90%,100% { opacity:1 } 95% { opacity:0 } }
@keyframes bounce { 0%,100% { transform:translateY(0) } 30% { transform:translateY(-14px) } 60% { transform:translateY(-6px) } }
@keyframes confetti { 0% { transform:translateY(0) rotate(0) opacity:1 } 100% { transform:translateY(-60px) rotate(360deg); opacity:0 } }
* { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
input,button,select { font-family:inherit; }
::-webkit-scrollbar { display:none; }
`;
