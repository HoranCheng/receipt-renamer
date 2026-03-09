import { useState, useRef, useCallback } from 'react';
import { T } from '../constants/theme';
import { analyzeReceipt } from '../services/ai';
import Header from '../components/Header';
import Btn from '../components/Btn';
import Field from '../components/Field';
import CatChips from '../components/CatChips';
import StatusDot from '../components/StatusDot';

export default function ScanView({ onComplete, config }) {
  const [stage, setStage] = useState("idle");
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    setStage("processing");
    const reader = new FileReader();
    reader.onload = async (e) => {
      setPreview(e.target.result);
      const [header, b64] = e.target.result.split(",");
      const mt = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      try {
        const data = await analyzeReceipt(b64, mt);
        setResult(data);
        setEdit({ ...data });
        setStage("result");
      } catch (err) {
        setError(err.message || "\u8BC6\u522B\u5931\u8D25");
        setStage("idle");
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSave = () => {
    const receipt = {
      id: `r_${Date.now()}`,
      ...edit,
      amount: parseFloat(edit.amount) || 0,
      confidence: result.confidence,
      source: "camera",
      createdAt: new Date().toISOString(),
    };
    onComplete(receipt);
    setStage("idle"); setPreview(null); setResult(null); setEdit(null);
  };

  const reset = () => { setStage("idle"); setPreview(null); setResult(null); setEdit(null); setError(null); };

  return (
    <div style={{padding:"0 16px 100px"}}>
      <Header title={"\u626B\u63CF\u5C0F\u7968"} sub={"\u62CD\u7167\u6216\u9009\u62E9\u56FE\u7247\uFF0CAI \u81EA\u52A8\u63D0\u53D6"}/>
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={e=>handleFile(e.target.files?.[0])}/>

      {stage==="idle" && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          <button onClick={()=>{fileRef.current?.setAttribute("capture","environment");fileRef.current?.click();}}
            style={{
              width:"100%",padding:"44px 20px",background:T.card,
              border:`2px dashed ${T.bdr2}`,borderRadius:20,cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:10,
            }}>
            <div style={{width:56,height:56,borderRadius:14,background:T.accDim,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>{"\u{1F4F7}"}</div>
            <span style={{fontSize:15,fontWeight:700,color:T.tx,fontFamily:"inherit"}}>{"\u62CD\u7167\u8BC6\u522B"}</span>
          </button>
          <button onClick={()=>{fileRef.current?.removeAttribute("capture");fileRef.current?.click();}}
            style={{
              width:"100%",padding:"14px",background:T.card,
              border:`1px solid ${T.bdr}`,borderRadius:13,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            }}>
            <span style={{fontSize:16}}>{"\u{1F5BC}\uFE0F"}</span>
            <span style={{fontSize:13,fontWeight:600,color:T.tx2,fontFamily:"inherit"}}>{"\u4ECE\u76F8\u518C\u9009\u62E9"}</span>
          </button>
          {error && <div style={{marginTop:14,padding:"12px",background:"rgba(239,68,68,0.08)",
            border:"1px solid rgba(239,68,68,0.25)",borderRadius:11,color:T.red,fontSize:12,
            textAlign:"center"}}>{error}</div>}
        </div>
      )}

      {stage==="processing" && (
        <div style={{textAlign:"center",padding:"32px 0",animation:"fadeUp 0.3s ease"}}>
          {preview && <div style={{marginBottom:20,borderRadius:14,overflow:"hidden",
            border:`1px solid ${T.bdr}`,maxHeight:180}}>
            <img src={preview} style={{width:"100%",objectFit:"cover",display:"block"}} alt=""/></div>}
          <div style={{width:40,height:40,border:`3px solid ${T.bdr}`,borderTopColor:T.acc,
            borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/>
          <div style={{fontSize:15,fontWeight:700,color:T.tx}}>{"AI \u8BC6\u522B\u4E2D..."}</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>{"\u63D0\u53D6\u65E5\u671F\u3001\u5546\u6237\u3001\u91D1\u989D\u3001\u5206\u7C7B"}</div>
        </div>
      )}

      {stage==="result" && edit && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          {preview && <div style={{marginBottom:14,borderRadius:14,overflow:"hidden",
            border:`1px solid ${T.bdr}`,maxHeight:140}}>
            <img src={preview} style={{width:"100%",objectFit:"cover",display:"block"}} alt=""/></div>}

          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14,
            padding:"8px 12px",background:T.card,borderRadius:10,border:`1px solid ${T.bdr}`}}>
            <StatusDot level={(result.confidence||0)>=75?"ok":(result.confidence||0)>=50?"warn":"err"}/>
            <span style={{fontSize:11,color:T.tx2}}>{"\u7F6E\u4FE1\u5EA6"} {result.confidence}%</span>
            {(result.confidence||0)<60 && <span style={{fontSize:10,color:T.acc,marginLeft:"auto"}}>{"\u5EFA\u8BAE\u6838\u5BF9"}</span>}
          </div>

          <Field label={"\u65E5\u671F"} icon={"\u{1F4C5}"} value={edit.date} onChange={v=>setEdit(d=>({...d,date:v}))} type="date"/>
          <Field label={"\u5546\u6237"} icon={"\u{1F3EA}"} value={edit.merchant} onChange={v=>setEdit(d=>({...d,merchant:v}))}/>
          <Field label={"\u91D1\u989D"} icon={"\u{1F4B0}"} value={edit.amount} onChange={v=>setEdit(d=>({...d,amount:v}))} type="number" mono/>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:T.tx3,letterSpacing:"1px",
              display:"flex",alignItems:"center",gap:4,marginBottom:6}}>{"\u{1F3F7}\uFE0F \u5206\u7C7B"}</label>
            <CatChips value={edit.category} onChange={v=>setEdit(d=>({...d,category:v}))}/>
          </div>

          <div style={{display:"flex",gap:8,marginTop:18}}>
            <Btn full onClick={reset} style={{flex:1}}>{"\u53D6\u6D88"}</Btn>
            <Btn primary full onClick={handleSave} style={{flex:2}}>{"\u4FDD\u5B58 \u2713"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
