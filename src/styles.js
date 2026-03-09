export const css = `
@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');
@keyframes spin { to { transform: rotate(360deg) } }
@keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
input, button, select { font-family: inherit; }
::-webkit-scrollbar { display: none; }
`;
