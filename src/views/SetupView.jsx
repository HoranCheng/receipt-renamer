import { useState } from 'react';
import { T } from '../constants/theme';
import { initGoogleAPI, requestAccessToken } from '../services/google';
import Field from '../components/Field';
import Btn from '../components/Btn';
import StatusDot from '../components/StatusDot';

export default function SetupView({ config, setConfig, onSave }) {
  const [step, setStep] = useState(config.clientId ? 1 : 0);

  return (
    <div style={{padding:"0 18px 100px"}}>
      <div style={{padding:"60px 0 8px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>{"\u{1F9FE}"}</div>
        <div style={{fontSize:26,fontWeight:900,color:T.tx,letterSpacing:"-0.5px"}}>Receipt Renamer</div>
        <div style={{fontSize:13,color:T.tx2,marginTop:4}}>{"\u5C0F\u7968\u667A\u80FD\u7BA1\u5BB6 \u00B7 \u8FDE\u63A5 Google Drive"}</div>
      </div>

      {/* Steps indicator */}
      <div style={{display:"flex",justifyContent:"center",gap:8,margin:"24px 0 28px"}}>
        {["Google \u914D\u7F6E","\u8FDE\u63A5\u8D26\u53F7","\u6587\u4EF6\u5939\u8BBE\u7F6E"].map((s,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{
              width:24,height:24,borderRadius:"50%",fontSize:11,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",
              background:step>=i?T.accDim:T.sf2,
              border:`1.5px solid ${step>=i?T.acc:T.bdr}`,
              color:step>=i?T.acc:T.tx3,
            }}>{i+1}</div>
            {i<2 && <div style={{width:20,height:1,background:step>i?T.acc:T.bdr}}/>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:16,
            padding:"18px",marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:T.tx,marginBottom:10}}>
              {"\u{1F4CB} \u9996\u6B21\u8BBE\u7F6E \u2014 Google Cloud Client ID"}
            </div>
            <div style={{fontSize:12,color:T.tx2,lineHeight:1.7,marginBottom:14}}>
              {"\u9700\u8981\u4E00\u4E2A Google Cloud OAuth Client ID \u6765\u8BBF\u95EE\u60A8\u7684 Drive\u3002\u8FD9\u662F\u4E00\u6B21\u6027\u8BBE\u7F6E\uFF0C\u60A8\u7684\u6570\u636E\u4EC5\u5B58\u5728\u4E8E\u60A8\u81EA\u5DF1\u7684 Google \u8D26\u53F7\u4E2D\u3002"}
            </div>
            <div style={{fontSize:11,color:T.tx3,lineHeight:1.8,padding:"12px 14px",
              background:T.sf,borderRadius:10,border:`1px solid ${T.bdr}`,marginBottom:14}}>
              <strong style={{color:T.acc}}>{"\u5FEB\u901F\u6B65\u9AA4\uFF1A"}</strong><br/>
              {"1. \u6253\u5F00 console.cloud.google.com"}<br/>
              {"2. \u521B\u5EFA\u9879\u76EE \u2192 API \u548C\u670D\u52A1 \u2192 \u51ED\u636E"}<br/>
              {"3. \u521B\u5EFA OAuth 2.0 \u5BA2\u6237\u7AEF ID\uFF08Web \u5E94\u7528\uFF09"}<br/>
              {"4. \u6388\u6743\u6765\u6E90\u6DFB\u52A0\u5F53\u524D\u9875\u9762\u57DF\u540D"}<br/>
              {"5. \u542F\u7528 Drive API \u548C Sheets API"}<br/>
              {"6. \u590D\u5236 Client ID \u7C98\u8D34\u5230\u4E0B\u65B9"}
            </div>
          </div>
          <Field label="Google OAuth Client ID" icon={"\u{1F511}"}
            value={config.clientId} onChange={v=>setConfig(c=>({...c,clientId:v}))}
            placeholder="xxxxx.apps.googleusercontent.com" mono />
          <Btn primary full style={{marginTop:8}} disabled={!config.clientId}
            onClick={()=>setStep(1)}>{"\u4E0B\u4E00\u6B65 \u2192"}</Btn>
        </div>
      )}

      {step === 1 && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:16,
            padding:"24px",textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:36,marginBottom:12}}>{"\u{1F517}"}</div>
            <div style={{fontSize:15,fontWeight:700,color:T.tx,marginBottom:6}}>{"\u8FDE\u63A5 Google \u8D26\u53F7"}</div>
            <div style={{fontSize:12,color:T.tx2,marginBottom:20}}>
              {"\u6388\u6743\u8BBF\u95EE Google Drive \u548C Sheets"}
            </div>
            <Btn primary onClick={async()=>{
              try {
                await initGoogleAPI(config.clientId);
                await requestAccessToken();
                setConfig(c=>({...c,connected:true}));
                setStep(2);
              } catch(e) {
                alert("\u8FDE\u63A5\u5931\u8D25\uFF1A" + (e.message || JSON.stringify(e)));
              }
            }}>{"\u{1F510} \u4F7F\u7528 Google \u767B\u5F55"}</Btn>
          </div>
          <Btn full onClick={()=>setStep(0)}>{"\u2190 \u8FD4\u56DE"}</Btn>
        </div>
      )}

      {step === 2 && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:16,
            padding:"18px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <StatusDot level="ok"/>
              <span style={{fontSize:13,fontWeight:600,color:T.grn}}>{"Google \u5DF2\u8FDE\u63A5"}</span>
            </div>
            <div style={{fontSize:14,fontWeight:700,color:T.tx,marginBottom:10}}>
              {"\u{1F4C1} \u6587\u4EF6\u5939\u914D\u7F6E"}
            </div>
            <div style={{fontSize:12,color:T.tx2,lineHeight:1.6,marginBottom:14}}>
              {"\u8BBE\u7F6E Google Drive \u4E2D\u7684\u6536\u636E\u6587\u4EF6\u5939\u540D\u79F0\u3002\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u521B\u5EFA\u4E0D\u5B58\u5728\u7684\u6587\u4EF6\u5939\u3002"}
            </div>
          </div>
          <Field label={"\u6536\u4EF6\u7BB1\u6587\u4EF6\u5939"} icon={"\u{1F4E5}"}
            value={config.inboxFolder} onChange={v=>setConfig(c=>({...c,inboxFolder:v}))}
            placeholder="00_inbox" />
          <Field label={"\u5DF2\u9A8C\u8BC1\u6587\u4EF6\u5939"} icon={"\u2705"}
            value={config.validatedFolder} onChange={v=>setConfig(c=>({...c,validatedFolder:v}))}
            placeholder="10_validated" />
          <Field label={"\u5F85\u5BA1\u6838\u6587\u4EF6\u5939"} icon={"\u26A0\uFE0F"}
            value={config.reviewFolder} onChange={v=>setConfig(c=>({...c,reviewFolder:v}))}
            placeholder="20_review_needed" />
          <Field label={"Google Sheets ID\uFF08\u53EF\u9009\uFF09"} icon={"\u{1F4CA}"}
            value={config.sheetId} onChange={v=>setConfig(c=>({...c,sheetId:v}))}
            placeholder={"\u7559\u7A7A\u5219\u8DF3\u8FC7 Sheets \u540C\u6B65"} mono />
          <Field label={"Sheet \u5DE5\u4F5C\u8868\u540D"} icon={"\u{1F4CB}"}
            value={config.sheetName} onChange={v=>setConfig(c=>({...c,sheetName:v}))}
            placeholder="receipt_index" />
          <Btn primary full style={{marginTop:8}} onClick={()=>onSave(config)}>
            {"\u{1F680} \u5F00\u59CB\u4F7F\u7528"}
          </Btn>
        </div>
      )}
    </div>
  );
}
