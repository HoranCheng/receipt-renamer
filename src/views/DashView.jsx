import { T, F, FM } from '../constants/theme';
import { CAT_ICON, CAT_CLR } from '../constants';
import Btn from '../components/Btn';
import StatusDot from '../components/StatusDot';
import ReceiptRow from '../components/ReceiptRow';

export default function DashView({ receipts, onNav }) {
  const total = receipts.reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const catTotals = {};
  receipts.forEach(r => { const c=r.category||"Other"; catTotals[c]=(catTotals[c]||0)+parseFloat(r.amount||0); });
  const topCats = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxCat = topCats[0]?.[1]||1;
  const recent = receipts.slice(0,4);

  return (
    <div style={{padding:"0 16px 100px"}}>
      <div style={{padding:"50px 0 12px",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:T.tx3,letterSpacing:"2px",textTransform:"uppercase"}}>
            Receipt Renamer</div>
          <div style={{fontSize:26,fontWeight:900,color:T.tx,marginTop:2,letterSpacing:"-0.5px"}}>
            {"\u5C0F\u7968\u7BA1\u5BB6"}</div>
        </div>
        <div style={{fontSize:11,color:T.tx3,textAlign:"right"}}>
          <StatusDot level="ok"/><span style={{marginLeft:5}}>{"\u5DF2\u8FDE\u63A5"}</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <div style={{flex:1,background:T.accDim,border:`1px solid ${T.accGlow}`,
          borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:T.tx3,fontWeight:700,letterSpacing:"1px",marginBottom:4}}>{"\u603B\u7B14\u6570"}</div>
          <div style={{fontSize:28,fontWeight:800,color:T.acc,fontFamily:FM}}>{receipts.length}</div>
        </div>
        <div style={{flex:1,background:T.card,border:`1px solid ${T.bdr}`,borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:T.tx3,fontWeight:700,letterSpacing:"1px",marginBottom:4}}>{"\u603B\u91D1\u989D"}</div>
          <div style={{fontSize:22,fontWeight:800,color:T.tx,fontFamily:FM}}>${total.toFixed(0)}</div>
          {receipts.length>0 && <div style={{fontSize:10,color:T.tx3,marginTop:2}}>
            {"\u5747"} ${(total/receipts.length).toFixed(0)}/{"\u7B14"}</div>}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <Btn primary full onClick={()=>onNav("inbox")} style={{flex:1,display:"flex",
          alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:18}}>{"\u2193"}</span> {"\u5904\u7406\u6536\u4EF6\u7BB1"}
        </Btn>
        <Btn full onClick={()=>onNav("scan")} style={{flex:1,display:"flex",
          alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:16}}>{"\u25CE"}</span> {"\u62CD\u7167\u626B\u63CF"}
        </Btn>
      </div>

      {/* Category breakdown */}
      {topCats.length > 0 && (
        <div style={{marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:700,color:T.tx2,letterSpacing:"0.5px",marginBottom:10}}>
            {"\u6D88\u8D39\u5206\u5E03"}</div>
          {topCats.map(([cat,amt])=>(
            <div key={cat} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:14,width:24,textAlign:"center"}}>{CAT_ICON[cat]}</span>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:12,color:T.tx,fontWeight:500}}>{cat}</span>
                  <span style={{fontSize:12,color:T.tx2,fontFamily:FM}}>${amt.toFixed(0)}</span>
                </div>
                <div style={{height:3,background:T.bdr,borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(amt/maxCat)*100}%`,
                    background:CAT_CLR[cat],borderRadius:2,transition:"width 0.5s"}}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <span style={{fontSize:11,fontWeight:700,color:T.tx2}}>{"\u6700\u8FD1\u5904\u7406"}</span>
        {receipts.length>4 && <button onClick={()=>onNav("log")} style={{
          background:"none",border:"none",color:T.acc,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F
        }}>{"\u5168\u90E8 \u2192"}</button>}
      </div>
      {recent.length===0?(
        <div style={{textAlign:"center",padding:"36px 16px",color:T.tx3}}>
          <div style={{fontSize:36,marginBottom:8}}>{"\u{1F4ED}"}</div>
          <div style={{fontSize:13}}>{"\u8FD8\u6CA1\u6709\u5904\u7406\u8BB0\u5F55"}</div>
          <div style={{fontSize:11,marginTop:4}}>{"\u4ECE\u6536\u4EF6\u7BB1\u5F00\u59CB\u5904\u7406\u6216\u62CD\u7167\u626B\u63CF"}</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {recent.map(r=><ReceiptRow key={r.id} r={r} compact/>)}
        </div>
      )}
    </div>
  );
}
