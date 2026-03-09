import { T, F, FM } from '../constants/theme';

export default function Field({ label, icon, value, onChange, type, mono, placeholder }) {
  return (
    <div style={{marginBottom:12}}>
      <label style={{fontSize:10,fontWeight:700,color:T.tx3,letterSpacing:"1px",
        textTransform:"uppercase",display:"flex",alignItems:"center",gap:4,marginBottom:5}}>
        {icon && <span>{icon}</span>}{label}
      </label>
      <input type={type||"text"} value={value||""} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width:"100%",padding:"11px 13px",background:T.sf,
          border:`1px solid ${T.bdr}`,borderRadius:11,color:T.tx,
          fontSize:14,fontFamily:mono?FM:F,outline:"none",
        }}
        onFocus={e=>e.target.style.borderColor=T.acc}
        onBlur={e=>e.target.style.borderColor=T.bdr} />
    </div>
  );
}
