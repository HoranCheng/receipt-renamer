import { T, FM } from '../constants/theme';
import { CAT_ICON, CAT_CLR } from '../constants';

export default function ReceiptRow({ r, compact }) {
  const clr = CAT_CLR[r.category]||CAT_CLR.Other;
  return (
    <div style={{
      background:T.card,border:`1px solid ${T.bdr}`,borderRadius:13,
      padding:compact?"10px 12px":"12px 14px",display:"flex",alignItems:"center",gap:12,
      animation:"fadeUp 0.3s ease both",
    }}>
      <div style={{
        width:40,height:40,borderRadius:11,fontSize:19,flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"center",
        background:`${clr}14`,
      }}>{CAT_ICON[r.category]||"\u{1F4C4}"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:T.tx,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {r.merchant||"Unknown"}</div>
        <div style={{fontSize:11,color:T.tx2,marginTop:2,display:"flex",gap:6,alignItems:"center"}}>
          <span>{r.date||"\u2014"}</span>
          <span style={{width:3,height:3,borderRadius:"50%",background:T.tx3,flexShrink:0}}/>
          <span style={{color:clr}}>{r.category}</span>
        </div>
      </div>
      <div style={{fontSize:15,fontWeight:700,fontFamily:FM,color:T.tx,flexShrink:0}}>
        ${parseFloat(r.amount||0).toFixed(2)}
      </div>
    </div>
  );
}
