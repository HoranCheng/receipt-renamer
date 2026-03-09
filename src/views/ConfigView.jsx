import { T } from '../constants/theme';
import Header from '../components/Header';
import Field from '../components/Field';
import Btn from '../components/Btn';
import StatusDot from '../components/StatusDot';

export default function ConfigView({ config, setConfig, onSave, onReconnect, onReset }) {
  return (
    <div style={{padding:"0 16px 100px"}}>
      <Header title={"\u8BBE\u7F6E"} sub={"Google \u8FDE\u63A5\u4E0E\u6587\u4EF6\u5939\u914D\u7F6E"}/>

      {/* Connection Status */}
      <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:14,
        padding:"16px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <StatusDot level={config.connected?"ok":"err"}/>
            <span style={{fontSize:13,fontWeight:600,color:config.connected?T.grn:T.red}}>
              {config.connected?"Google \u5DF2\u8FDE\u63A5":"\u672A\u8FDE\u63A5"}
            </span>
          </div>
          <Btn small onClick={onReconnect}>{config.connected?"\u91CD\u65B0\u8FDE\u63A5":"\u8FDE\u63A5"}</Btn>
        </div>
        <div style={{fontSize:11,color:T.tx3}}>Client ID: {config.clientId?.slice(0,20)}...</div>
      </div>

      <Field label="OAuth Client ID" icon={"\u{1F511}"} value={config.clientId}
        onChange={v=>setConfig(c=>({...c,clientId:v}))} mono
        placeholder="xxxxx.apps.googleusercontent.com"/>
      <Field label={"\u6536\u4EF6\u7BB1"} icon={"\u{1F4E5}"} value={config.inboxFolder}
        onChange={v=>setConfig(c=>({...c,inboxFolder:v}))} placeholder="00_inbox"/>
      <Field label={"\u5DF2\u9A8C\u8BC1"} icon={"\u2705"} value={config.validatedFolder}
        onChange={v=>setConfig(c=>({...c,validatedFolder:v}))} placeholder="10_validated"/>
      <Field label={"\u5F85\u5BA1\u6838"} icon={"\u26A0\uFE0F"} value={config.reviewFolder}
        onChange={v=>setConfig(c=>({...c,reviewFolder:v}))} placeholder="20_review_needed"/>
      <Field label="Sheets ID" icon={"\u{1F4CA}"} value={config.sheetId}
        onChange={v=>setConfig(c=>({...c,sheetId:v}))} mono placeholder={"\u53EF\u9009"}/>
      <Field label={"\u5DE5\u4F5C\u8868\u540D"} icon={"\u{1F4CB}"} value={config.sheetName}
        onChange={v=>setConfig(c=>({...c,sheetName:v}))} placeholder="receipt_index"/>

      <Btn primary full onClick={()=>onSave(config)} style={{marginTop:4,marginBottom:12}}>
        {"\u{1F4BE} \u4FDD\u5B58\u8BBE\u7F6E"}
      </Btn>
      <Btn danger full onClick={onReset}>{"\u{1F5D1}\uFE0F \u91CD\u7F6E\u6240\u6709\u6570\u636E"}</Btn>

      {/* Info */}
      <div style={{marginTop:24,padding:"16px",background:T.sf,borderRadius:12,
        border:`1px solid ${T.bdr}`}}>
        <div style={{fontSize:12,fontWeight:700,color:T.tx2,marginBottom:8}}>{"\u2139\uFE0F \u5DE5\u4F5C\u539F\u7406"}</div>
        <div style={{fontSize:11,color:T.tx3,lineHeight:1.8}}>
          {"1. \u4ECE Drive \u6536\u4EF6\u7BB1\u8BFB\u53D6\u5C0F\u7968\u56FE\u7247/PDF"}<br/>
          {"2. AI \u81EA\u52A8\u63D0\u53D6\u65E5\u671F\u3001\u5546\u6237\u3001\u91D1\u989D\u3001\u5206\u7C7B"}<br/>
          {"3. \u91CD\u547D\u540D\u4E3A\u300CYYYY-MM-DD \u5206\u7C7B \u5546\u6237.ext\u300D"}<br/>
          {"4. \u9AD8\u7F6E\u4FE1 \u2192 \u5DF2\u9A8C\u8BC1\u6587\u4EF6\u5939 / \u4F4E\u7F6E\u4FE1 \u2192 \u5F85\u5BA1\u6838"}<br/>
          {"5. \u5143\u6570\u636E\u540C\u6B65\u5230 Google Sheets\uFF08\u53EF\u9009\uFF09"}<br/>
          <br/>
          <strong style={{color:T.tx2}}>{"AI \u5F15\u64CE\uFF1A"}</strong>{"Claude Sonnet\uFF08\u5185\u7F6E\uFF0C\u65E0\u9700 API Key\uFF09"}<br/>
          <strong style={{color:T.tx2}}>{"\u6570\u636E\u5B89\u5168\uFF1A"}</strong>{"\u6240\u6709\u6570\u636E\u5B58\u5728\u60A8\u81EA\u5DF1\u7684 Google \u8D26\u53F7\u4E2D"}
        </div>
      </div>
    </div>
  );
}
