import { T, F } from '../constants/theme';
import { CATEGORIES, CAT_ICON, CAT_CLR } from '../constants';

export default function CatChips({ value, onChange }) {
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
      {CATEGORIES.map(c=>(
        <button key={c} onClick={()=>onChange(c)} style={{
          padding:"6px 10px",borderRadius:18,fontSize:11,fontWeight:600,fontFamily:F,
          cursor:"pointer",transition:"all 0.15s",
          background:value===c?`${CAT_CLR[c]}18`:T.sf,
          border:`1.5px solid ${value===c?CAT_CLR[c]:T.bdr}`,
          color:value===c?CAT_CLR[c]:T.tx3,
        }}>{CAT_ICON[c]} {c}</button>
      ))}
    </div>
  );
}
