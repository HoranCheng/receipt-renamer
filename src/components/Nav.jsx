import { T } from '../constants/theme';

const tabs = [
  { id:"dash", ic:"\u2302", lb:"\u9996\u9875" },
  { id:"inbox", ic:"\u2193", lb:"\u6536\u4EF6" },
  { id:"scan", ic:"\u25CE", lb:"\u626B\u63CF" },
  { id:"log", ic:"\u2630", lb:"\u8BB0\u5F55" },
  { id:"cfg", ic:"\u2699", lb:"\u8BBE\u7F6E" },
];

export default function Nav({ view, set }) {
  return (
    <nav style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:100,
      background:`${T.sf}ee`,borderTop:`1px solid ${T.bdr}`,
      backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",
      display:"flex",justifyContent:"space-around",
      padding:"4px 0 env(safe-area-inset-bottom, 6px)",
      maxWidth:520,margin:"0 auto",
    }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>set(t.id)} style={{
          background:"none",border:"none",cursor:"pointer",
          display:"flex",flexDirection:"column",alignItems:"center",gap:1,
          padding:"6px 12px",color:view===t.id?T.acc:T.tx3,
          transition:"color 0.2s",
        }}>
          <span style={{fontSize:20,lineHeight:1,fontWeight:view===t.id?700:400}}>{t.ic}</span>
          <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.8px"}}>{t.lb}</span>
        </button>
      ))}
    </nav>
  );
}
