import { useState, useEffect, useRef, useCallback } from "react";

/*
 * Receipt Renamer Mobile — Multi-user Google Drive receipt processor
 * 
 * Architecture:
 * - Google OAuth: Users sign in with their own Google account
 * - Google Drive API: Scan inbox, rename files, move to folders
 * - Google Sheets API: Sync receipt metadata
 * - Claude API (artifact built-in): AI receipt analysis — no user API key needed
 * 
 * Setup: Users provide a Google Cloud OAuth Client ID (one-time)
 * Then sign in with Google to grant Drive + Sheets access
 */

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

const CATEGORIES = [
  "Grocery","Dining","Fuel","Medical","Hardware & Garden",
  "Outdoor & Camping","Transport","Utilities","Entertainment",
  "Shopping","Education","Insurance","Subscription","Other"
];
const CAT_ICON = {
  Grocery:"🛒",Dining:"🍽️",Fuel:"⛽",Medical:"💊","Hardware & Garden":"🔧",
  "Outdoor & Camping":"🏕️",Transport:"🚌",Utilities:"💡",Entertainment:"🎬",
  Shopping:"🛍️",Education:"📚",Insurance:"🛡️",Subscription:"📱",Other:"📄"
};
const CAT_CLR = {
  Grocery:"#34d399",Dining:"#fbbf24",Fuel:"#f87171",Medical:"#f472b6",
  "Hardware & Garden":"#a78bfa","Outdoor & Camping":"#2dd4bf",Transport:"#60a5fa",
  Utilities:"#818cf8",Entertainment:"#fb923c",Shopping:"#fb7185",
  Education:"#38bdf8",Insurance:"#94a3b8",Subscription:"#a78bfa",Other:"#64748b"
};

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOCS = [
  "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
  "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest",
];

const DRIVE_FOLDERS = {
  inbox: "00_inbox",
  validated: "10_validated",
  review: "20_flags/review_needed",
};

// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════

const T = {
  bg: "#08080b", sf: "#111116", sf2: "#191920", card: "#14141a",
  bdr: "#252530", bdr2: "#35354a", tx: "#eae8e4", tx2: "#8b8b9a",
  tx3: "#55556a", acc: "#e8b931", accDim: "rgba(232,185,49,0.10)",
  accGlow: "rgba(232,185,49,0.25)", red: "#ef4444", grn: "#34d399",
  blue: "#60a5fa",
};
const F = `'Libre Franklin','Noto Sans SC',system-ui,sans-serif`;
const FM = `'IBM Plex Mono','SF Mono',monospace`;

// ═══════════════════════════════════════════
// GOOGLE API SERVICE
// ═══════════════════════════════════════════

let gapiLoaded = false;
let gisLoaded = false;
let tokenClient = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initGoogleAPI(clientId) {
  await loadScript("https://apis.google.com/js/api.js");
  await loadScript("https://accounts.google.com/gsi/client");
  
  await new Promise((resolve, reject) => {
    window.gapi.load("client", { callback: resolve, onerror: reject });
  });

  await window.gapi.client.init({ discoveryDocs: DISCOVERY_DOCS });
  gapiLoaded = true;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {},
  });
  gisLoaded = true;
}

function requestAccessToken() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Google not initialized"));
    tokenClient.callback = (resp) => {
      if (resp.error) reject(resp);
      else resolve(resp);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

// Drive helpers
async function findOrCreateFolder(name, parentId) {
  const q = parentId
    ? `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await window.gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
  if (res.result.files?.length > 0) return res.result.files[0].id;
  // Create
  const meta = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  const created = await window.gapi.client.drive.files.create({ resource: meta, fields: "id" });
  return created.result.id;
}

async function listFilesInFolder(folderId) {
  const q = `'${folderId}' in parents and trashed=false and (mimeType contains 'image/' or mimeType='application/pdf')`;
  const res = await window.gapi.client.drive.files.list({
    q, fields: "files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,size)",
    pageSize: 50, orderBy: "createdTime desc",
  });
  return res.result.files || [];
}

async function getFileAsBase64(fileId, mimeType) {
  const resp = await window.gapi.client.drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  const bytes = new Uint8Array(resp.body.length);
  for (let i = 0; i < resp.body.length; i++) bytes[i] = resp.body.charCodeAt(i);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function renameAndMoveFile(fileId, newName, targetFolderId, currentParents) {
  await window.gapi.client.drive.files.update({
    fileId,
    resource: { name: newName },
    addParents: targetFolderId,
    removeParents: currentParents,
    fields: "id,name,parents",
  });
}

async function appendToSheet(spreadsheetId, sheetName, row) {
  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:F`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [row] },
  });
}

// ═══════════════════════════════════════════
// AI RECEIPT ANALYSIS (Claude API — built into artifacts)
// ═══════════════════════════════════════════

async function analyzeReceipt(base64, mediaType) {
  const prompt = `You are a receipt data extractor for an Australian user. Analyze this receipt and extract structured data.

RULES:
- Dates: prefer DD/MM/YYYY (Australian). Output as YYYY-MM-DD.
- Merchant: clean name only. Remove ABN, PTY LTD, ACN, TAX INVOICE, addresses.
- Amount: the TOTAL paid. Number only, no currency symbol.
- Currency: usually AUD unless clearly otherwise.
- Category: exactly ONE of: ${CATEGORIES.join(", ")}
- Confidence: 0-100 your certainty

Respond ONLY with this JSON, no markdown, no backticks:
{"date":"YYYY-MM-DD","merchant":"Clean Name","amount":0.00,"currency":"AUD","category":"Category","items":["item1","item2"],"confidence":85}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: prompt },
      ]}],
    }),
  });
  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════

async function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
async function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

// ═══════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════

const css = `
@import url('https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap');
@keyframes spin { to { transform: rotate(360deg) } }
@keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
@keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
input, button, select { font-family: inherit; }
::-webkit-scrollbar { display: none; }
`;

function Nav({ view, set }) {
  const tabs = [
    { id:"dash", ic:"⌂", lb:"首页" },
    { id:"inbox", ic:"↓", lb:"收件" },
    { id:"scan", ic:"◎", lb:"扫描" },
    { id:"log", ic:"☰", lb:"记录" },
    { id:"cfg", ic:"⚙", lb:"设置" },
  ];
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

function Header({ title, sub }) {
  return (
    <div style={{padding:"50px 0 16px"}}>
      <div style={{fontSize:22,fontWeight:800,color:T.tx,letterSpacing:"-0.3px"}}>{title}</div>
      {sub && <div style={{fontSize:12,color:T.tx2,marginTop:3}}>{sub}</div>}
    </div>
  );
}

function Btn({ children, primary, danger, small, full, style: sx, ...props }) {
  const base = {
    padding: small ? "8px 14px" : "14px 18px",
    borderRadius: small ? 10 : 14,
    fontSize: small ? 12 : 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: F,
    border: "none",
    transition: "all 0.15s",
    width: full ? "100%" : undefined,
    ...sx,
  };
  if (primary) Object.assign(base, {
    background: `linear-gradient(135deg, ${T.acc}, #d4a017)`,
    color: "#0a0a0a",
  });
  else if (danger) Object.assign(base, {
    background: "rgba(239,68,68,0.1)",
    border: `1px solid rgba(239,68,68,0.3)`,
    color: T.red,
  });
  else Object.assign(base, {
    background: T.sf2,
    border: `1px solid ${T.bdr}`,
    color: T.tx2,
  });
  return <button style={base} {...props}>{children}</button>;
}

function Field({ label, icon, value, onChange, type, mono, placeholder }) {
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

function CatChips({ value, onChange }) {
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

function ReceiptRow({ r, compact }) {
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
      }}>{CAT_ICON[r.category]||"📄"}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:600,color:T.tx,
          overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {r.merchant||"Unknown"}</div>
        <div style={{fontSize:11,color:T.tx2,marginTop:2,display:"flex",gap:6,alignItems:"center"}}>
          <span>{r.date||"—"}</span>
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

function StatusDot({ level }) {
  const clr = level==="ok"?T.grn:level==="warn"?T.acc:T.red;
  return <span style={{width:7,height:7,borderRadius:"50%",background:clr,display:"inline-block"}}/>;
}

// ═══════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════

function SetupView({ config, setConfig, onSave }) {
  const [step, setStep] = useState(config.clientId ? 1 : 0);

  return (
    <div style={{padding:"0 18px 100px"}}>
      <div style={{padding:"60px 0 8px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🧾</div>
        <div style={{fontSize:26,fontWeight:900,color:T.tx,letterSpacing:"-0.5px"}}>Receipt Renamer</div>
        <div style={{fontSize:13,color:T.tx2,marginTop:4}}>小票智能管家 · 连接 Google Drive</div>
      </div>

      {/* Steps indicator */}
      <div style={{display:"flex",justifyContent:"center",gap:8,margin:"24px 0 28px"}}>
        {["Google 配置","连接账号","文件夹设置"].map((s,i)=>(
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
              📋 首次设置 — Google Cloud Client ID
            </div>
            <div style={{fontSize:12,color:T.tx2,lineHeight:1.7,marginBottom:14}}>
              需要一个 Google Cloud OAuth Client ID 来访问您的 Drive。
              这是一次性设置，您的数据仅存在于您自己的 Google 账号中。
            </div>
            <div style={{fontSize:11,color:T.tx3,lineHeight:1.8,padding:"12px 14px",
              background:T.sf,borderRadius:10,border:`1px solid ${T.bdr}`,marginBottom:14}}>
              <strong style={{color:T.acc}}>快速步骤：</strong><br/>
              1. 打开 console.cloud.google.com<br/>
              2. 创建项目 → API 和服务 → 凭据<br/>
              3. 创建 OAuth 2.0 客户端 ID（Web 应用）<br/>
              4. 授权来源添加当前页面域名<br/>
              5. 启用 Drive API 和 Sheets API<br/>
              6. 复制 Client ID 粘贴到下方
            </div>
          </div>
          <Field label="Google OAuth Client ID" icon="🔑"
            value={config.clientId} onChange={v=>setConfig(c=>({...c,clientId:v}))}
            placeholder="xxxxx.apps.googleusercontent.com" mono />
          <Btn primary full style={{marginTop:8}} disabled={!config.clientId}
            onClick={()=>setStep(1)}>下一步 →</Btn>
        </div>
      )}

      {step === 1 && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:16,
            padding:"24px",textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:36,marginBottom:12}}>🔗</div>
            <div style={{fontSize:15,fontWeight:700,color:T.tx,marginBottom:6}}>连接 Google 账号</div>
            <div style={{fontSize:12,color:T.tx2,marginBottom:20}}>
              授权访问 Google Drive 和 Sheets
            </div>
            <Btn primary onClick={async()=>{
              try {
                await initGoogleAPI(config.clientId);
                await requestAccessToken();
                setConfig(c=>({...c,connected:true}));
                setStep(2);
              } catch(e) {
                alert("连接失败：" + (e.message || JSON.stringify(e)));
              }
            }}>🔐 使用 Google 登录</Btn>
          </div>
          <Btn full onClick={()=>setStep(0)}>← 返回</Btn>
        </div>
      )}

      {step === 2 && (
        <div style={{animation:"fadeUp 0.3s ease"}}>
          <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:16,
            padding:"18px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <StatusDot level="ok"/>
              <span style={{fontSize:13,fontWeight:600,color:T.grn}}>Google 已连接</span>
            </div>
            <div style={{fontSize:14,fontWeight:700,color:T.tx,marginBottom:10}}>
              📁 文件夹配置
            </div>
            <div style={{fontSize:12,color:T.tx2,lineHeight:1.6,marginBottom:14}}>
              设置 Google Drive 中的收据文件夹名称。系统会自动创建不存在的文件夹。
            </div>
          </div>
          <Field label="收件箱文件夹" icon="📥"
            value={config.inboxFolder} onChange={v=>setConfig(c=>({...c,inboxFolder:v}))}
            placeholder="00_inbox" />
          <Field label="已验证文件夹" icon="✅"
            value={config.validatedFolder} onChange={v=>setConfig(c=>({...c,validatedFolder:v}))}
            placeholder="10_validated" />
          <Field label="待审核文件夹" icon="⚠️"
            value={config.reviewFolder} onChange={v=>setConfig(c=>({...c,reviewFolder:v}))}
            placeholder="20_review_needed" />
          <Field label="Google Sheets ID（可选）" icon="📊"
            value={config.sheetId} onChange={v=>setConfig(c=>({...c,sheetId:v}))}
            placeholder="留空则跳过 Sheets 同步" mono />
          <Field label="Sheet 工作表名" icon="📋"
            value={config.sheetName} onChange={v=>setConfig(c=>({...c,sheetName:v}))}
            placeholder="receipt_index" />
          <Btn primary full style={{marginTop:8}} onClick={()=>onSave(config)}>
            🚀 开始使用
          </Btn>
        </div>
      )}
    </div>
  );
}

function DashView({ receipts, onNav }) {
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
            小票管家</div>
        </div>
        <div style={{fontSize:11,color:T.tx3,textAlign:"right"}}>
          <StatusDot level="ok"/><span style={{marginLeft:5}}>已连接</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <div style={{flex:1,background:T.accDim,border:`1px solid ${T.accGlow}`,
          borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:T.tx3,fontWeight:700,letterSpacing:"1px",marginBottom:4}}>总笔数</div>
          <div style={{fontSize:28,fontWeight:800,color:T.acc,fontFamily:FM}}>{receipts.length}</div>
        </div>
        <div style={{flex:1,background:T.card,border:`1px solid ${T.bdr}`,borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:10,color:T.tx3,fontWeight:700,letterSpacing:"1px",marginBottom:4}}>总金额</div>
          <div style={{fontSize:22,fontWeight:800,color:T.tx,fontFamily:FM}}>${total.toFixed(0)}</div>
          {receipts.length>0 && <div style={{fontSize:10,color:T.tx3,marginTop:2}}>
            均 ${(total/receipts.length).toFixed(0)}/笔</div>}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        <Btn primary full onClick={()=>onNav("inbox")} style={{flex:1,display:"flex",
          alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:18}}>↓</span> 处理收件箱
        </Btn>
        <Btn full onClick={()=>onNav("scan")} style={{flex:1,display:"flex",
          alignItems:"center",justifyContent:"center",gap:6}}>
          <span style={{fontSize:16}}>◎</span> 拍照扫描
        </Btn>
      </div>

      {/* Category breakdown */}
      {topCats.length > 0 && (
        <div style={{marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:700,color:T.tx2,letterSpacing:"0.5px",marginBottom:10}}>
            消费分布</div>
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
        <span style={{fontSize:11,fontWeight:700,color:T.tx2}}>最近处理</span>
        {receipts.length>4 && <button onClick={()=>onNav("log")} style={{
          background:"none",border:"none",color:T.acc,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F
        }}>全部 →</button>}
      </div>
      {recent.length===0?(
        <div style={{textAlign:"center",padding:"36px 16px",color:T.tx3}}>
          <div style={{fontSize:36,marginBottom:8}}>📭</div>
          <div style={{fontSize:13}}>还没有处理记录</div>
          <div style={{fontSize:11,marginTop:4}}>从收件箱开始处理或拍照扫描</div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {recent.map(r=><ReceiptRow key={r.id} r={r} compact/>)}
        </div>
      )}
    </div>
  );
}

function InboxView({ config, onProcessed }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(null); // fileId being processed
  const [results, setResults] = useState({}); // fileId -> result
  const [batchMode, setBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current:0, total:0 });
  const inboxIdRef = useRef(null);
  const validIdRef = useRef(null);
  const reviewIdRef = useRef(null);

  const loadInbox = async () => {
    setLoading(true);
    try {
      const inboxId = await findOrCreateFolder(config.inboxFolder || "00_inbox");
      inboxIdRef.current = inboxId;
      validIdRef.current = await findOrCreateFolder(config.validatedFolder || "10_validated");
      reviewIdRef.current = await findOrCreateFolder(config.reviewFolder || "20_review_needed");
      const fs = await listFilesInFolder(inboxId);
      setFiles(fs);
    } catch(e) {
      alert("加载失败：" + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { if(config.connected) loadInbox(); }, []);

  const processFile = async (file) => {
    setProcessing(file.id);
    try {
      const base64 = await getFileAsBase64(file.id, file.mimeType);
      const mt = file.mimeType.includes("pdf") ? "application/pdf" :
        file.mimeType.includes("png") ? "image/png" : "image/jpeg";
      const data = await analyzeReceipt(base64, mt);

      // Build new filename
      const ext = file.name.split(".").pop();
      const newName = `${data.date||"unknown"} ${data.category||"Other"} ${data.merchant||"Unknown"}.${ext}`;
      const conf = data.confidence || 0;
      const targetFolder = conf >= 70 ? validIdRef.current : reviewIdRef.current;

      // Rename & move in Drive
      await renameAndMoveFile(file.id, newName, targetFolder, inboxIdRef.current);

      // Sync to Sheets if configured
      if (config.sheetId) {
        try {
          const link = `https://drive.google.com/file/d/${file.id}/view`;
          await appendToSheet(config.sheetId, config.sheetName || "receipt_index", [
            data.date, data.merchant, data.category, data.amount, data.currency||"AUD", link
          ]);
        } catch(e) { console.warn("Sheets sync failed:", e); }
      }

      const receipt = {
        id: `r_${Date.now()}_${file.id}`,
        ...data,
        originalName: file.name,
        newName,
        fileId: file.id,
        validated: conf >= 70,
        createdAt: new Date().toISOString(),
      };

      setResults(prev => ({ ...prev, [file.id]: { status: "done", receipt, newName } }));
      onProcessed(receipt);
      return receipt;
    } catch(e) {
      setResults(prev => ({ ...prev, [file.id]: { status: "error", error: e.message } }));
    } finally {
      setProcessing(null);
    }
  };

  const batchProcess = async () => {
    const unprocessed = files.filter(f => !results[f.id]);
    setBatchMode(true);
    setBatchProgress({ current: 0, total: unprocessed.length });
    for (let i = 0; i < unprocessed.length; i++) {
      setBatchProgress({ current: i + 1, total: unprocessed.length });
      await processFile(unprocessed[i]);
      // Small delay to avoid rate limiting
      if (i < unprocessed.length - 1) await new Promise(r => setTimeout(r, 1500));
    }
    setBatchMode(false);
  };

  if (!config.connected) {
    return (
      <div style={{padding:"0 16px 100px"}}>
        <Header title="收件箱" sub="请先在设置中连接 Google"/>
      </div>
    );
  }

  return (
    <div style={{padding:"0 16px 100px"}}>
      <Header title="Drive 收件箱" sub={`${config.inboxFolder || "00_inbox"} · ${files.length} 个文件`}/>

      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <Btn small onClick={loadInbox} style={{flex:1}}>🔄 刷新</Btn>
        {files.length > 0 && !batchMode && (
          <Btn small primary onClick={batchProcess} style={{flex:2}}>
            ⚡ 一键全部处理 ({files.filter(f=>!results[f.id]).length})
          </Btn>
        )}
      </div>

      {batchMode && (
        <div style={{background:T.accDim,border:`1px solid ${T.accGlow}`,borderRadius:12,
          padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:600,color:T.acc}}>批量处理中...</span>
            <span style={{fontSize:12,fontWeight:600,color:T.acc,fontFamily:FM}}>
              {batchProgress.current}/{batchProgress.total}
            </span>
          </div>
          <div style={{height:4,background:T.bdr,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:2,background:T.acc,transition:"width 0.3s",
              width:`${(batchProgress.current/batchProgress.total)*100}%`}}/>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:"center",padding:"40px",color:T.tx3}}>
          <div style={{width:32,height:32,border:`3px solid ${T.bdr}`,borderTopColor:T.acc,
            borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
          正在加载 Drive 文件...
        </div>
      ) : files.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px",color:T.tx3}}>
          <div style={{fontSize:36,marginBottom:8}}>📭</div>
          <div style={{fontSize:13}}>收件箱为空</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {files.map(f => {
            const res = results[f.id];
            const isProcessing = processing === f.id;
            return (
              <div key={f.id} style={{
                background:T.card,border:`1px solid ${T.bdr}`,borderRadius:13,
                padding:"12px 14px",animation:"fadeUp 0.3s ease both",
              }}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {/* Thumb */}
                  <div style={{
                    width:44,height:44,borderRadius:10,overflow:"hidden",
                    background:T.sf2,flexShrink:0,display:"flex",
                    alignItems:"center",justifyContent:"center",
                  }}>
                    {f.thumbnailLink ? (
                      <img src={f.thumbnailLink} style={{width:"100%",height:"100%",objectFit:"cover"}}
                        alt="" crossOrigin="anonymous" referrerPolicy="no-referrer"/>
                    ) : (
                      <span style={{fontSize:20}}>📄</span>
                    )}
                  </div>
                  {/* Info */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.tx,
                      overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {f.name}
                    </div>
                    {res?.status === "done" ? (
                      <div style={{fontSize:11,color:T.grn,marginTop:2,fontWeight:500}}>
                        ✓ → {res.newName}
                      </div>
                    ) : res?.status === "error" ? (
                      <div style={{fontSize:11,color:T.red,marginTop:2}}>✗ {res.error}</div>
                    ) : isProcessing ? (
                      <div style={{fontSize:11,color:T.acc,marginTop:2,animation:"pulse 1.5s infinite"}}>
                        识别中...
                      </div>
                    ) : (
                      <div style={{fontSize:11,color:T.tx3,marginTop:2}}>
                        {(parseInt(f.size)/1024).toFixed(0)} KB
                      </div>
                    )}
                  </div>
                  {/* Action */}
                  {!res && !isProcessing && !batchMode && (
                    <Btn small primary onClick={()=>processFile(f)}>处理</Btn>
                  )}
                  {isProcessing && (
                    <div style={{width:24,height:24,border:`2px solid ${T.bdr}`,
                      borderTopColor:T.acc,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                  )}
                  {res?.status === "done" && (
                    <span style={{fontSize:12,color:T.grn,fontWeight:700}}>
                      ${parseFloat(res.receipt.amount||0).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScanView({ onComplete, config }) {
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
        setError(err.message || "识别失败");
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
      <Header title="扫描小票" sub="拍照或选择图片，AI 自动提取"/>
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
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>📷</div>
            <span style={{fontSize:15,fontWeight:700,color:T.tx,fontFamily:F}}>拍照识别</span>
          </button>
          <button onClick={()=>{fileRef.current?.removeAttribute("capture");fileRef.current?.click();}}
            style={{
              width:"100%",padding:"14px",background:T.card,
              border:`1px solid ${T.bdr}`,borderRadius:13,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            }}>
            <span style={{fontSize:16}}>🖼️</span>
            <span style={{fontSize:13,fontWeight:600,color:T.tx2,fontFamily:F}}>从相册选择</span>
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
          <div style={{fontSize:15,fontWeight:700,color:T.tx}}>AI 识别中...</div>
          <div style={{fontSize:11,color:T.tx3,marginTop:4}}>提取日期、商户、金额、分类</div>
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
            <span style={{fontSize:11,color:T.tx2}}>置信度 {result.confidence}%</span>
            {(result.confidence||0)<60 && <span style={{fontSize:10,color:T.acc,marginLeft:"auto"}}>建议核对</span>}
          </div>

          <Field label="日期" icon="📅" value={edit.date} onChange={v=>setEdit(d=>({...d,date:v}))} type="date"/>
          <Field label="商户" icon="🏪" value={edit.merchant} onChange={v=>setEdit(d=>({...d,merchant:v}))}/>
          <Field label="金额" icon="💰" value={edit.amount} onChange={v=>setEdit(d=>({...d,amount:v}))} type="number" mono/>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:700,color:T.tx3,letterSpacing:"1px",
              display:"flex",alignItems:"center",gap:4,marginBottom:6}}>🏷️ 分类</label>
            <CatChips value={edit.category} onChange={v=>setEdit(d=>({...d,category:v}))}/>
          </div>

          <div style={{display:"flex",gap:8,marginTop:18}}>
            <Btn full onClick={reset} style={{flex:1}}>取消</Btn>
            <Btn primary full onClick={handleSave} style={{flex:2}}>保存 ✓</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function LogView({ receipts, onDelete }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = receipts.filter(r => {
    if (filter !== "all" && r.category !== filter) return false;
    if (search && !r.merchant?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const cats = [...new Set(receipts.map(r => r.category || "Other"))];

  return (
    <div style={{padding:"0 16px 100px"}}>
      <Header title="全部记录" sub={`共 ${receipts.length} 条`}/>
      <div style={{position:"relative",marginBottom:10}}>
        <input placeholder="搜索商户..." value={search} onChange={e=>setSearch(e.target.value)}
          style={{width:"100%",padding:"10px 12px 10px 34px",background:T.card,
            border:`1px solid ${T.bdr}`,borderRadius:11,color:T.tx,fontSize:13,fontFamily:F,outline:"none"}}/>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:13,color:T.tx3}}>🔍</span>
      </div>
      <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:10,scrollbarWidth:"none"}}>
        <button onClick={()=>setFilter("all")} style={{
          padding:"5px 12px",borderRadius:18,whiteSpace:"nowrap",flexShrink:0,
          background:filter==="all"?T.accDim:T.sf,
          border:`1px solid ${filter==="all"?T.acc:T.bdr}`,
          color:filter==="all"?T.acc:T.tx3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F,
        }}>全部</button>
        {cats.map(c=>(
          <button key={c} onClick={()=>setFilter(c)} style={{
            padding:"5px 10px",borderRadius:18,whiteSpace:"nowrap",flexShrink:0,
            background:filter===c?`${CAT_CLR[c]}15`:T.sf,
            border:`1px solid ${filter===c?CAT_CLR[c]:T.bdr}`,
            color:filter===c?CAT_CLR[c]:T.tx3,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F,
          }}>{CAT_ICON[c]} {c}</button>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {filtered.length===0?(
          <div style={{textAlign:"center",padding:"36px",color:T.tx3,fontSize:13}}>暂无匹配</div>
        ):filtered.map(r=>(
          <div key={r.id} style={{position:"relative"}}>
            <ReceiptRow r={r}/>
            <button onClick={()=>onDelete(r.id)} style={{
              position:"absolute",top:6,right:6,width:26,height:26,borderRadius:7,
              background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",
              color:T.red,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
            }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigView({ config, setConfig, onSave, onReconnect, onReset }) {
  return (
    <div style={{padding:"0 16px 100px"}}>
      <Header title="设置" sub="Google 连接与文件夹配置"/>

      {/* Connection Status */}
      <div style={{background:T.card,border:`1px solid ${T.bdr}`,borderRadius:14,
        padding:"16px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <StatusDot level={config.connected?"ok":"err"}/>
            <span style={{fontSize:13,fontWeight:600,color:config.connected?T.grn:T.red}}>
              {config.connected?"Google 已连接":"未连接"}
            </span>
          </div>
          <Btn small onClick={onReconnect}>{config.connected?"重新连接":"连接"}</Btn>
        </div>
        <div style={{fontSize:11,color:T.tx3}}>Client ID: {config.clientId?.slice(0,20)}...</div>
      </div>

      <Field label="OAuth Client ID" icon="🔑" value={config.clientId}
        onChange={v=>setConfig(c=>({...c,clientId:v}))} mono
        placeholder="xxxxx.apps.googleusercontent.com"/>
      <Field label="收件箱" icon="📥" value={config.inboxFolder}
        onChange={v=>setConfig(c=>({...c,inboxFolder:v}))} placeholder="00_inbox"/>
      <Field label="已验证" icon="✅" value={config.validatedFolder}
        onChange={v=>setConfig(c=>({...c,validatedFolder:v}))} placeholder="10_validated"/>
      <Field label="待审核" icon="⚠️" value={config.reviewFolder}
        onChange={v=>setConfig(c=>({...c,reviewFolder:v}))} placeholder="20_review_needed"/>
      <Field label="Sheets ID" icon="📊" value={config.sheetId}
        onChange={v=>setConfig(c=>({...c,sheetId:v}))} mono placeholder="可选"/>
      <Field label="工作表名" icon="📋" value={config.sheetName}
        onChange={v=>setConfig(c=>({...c,sheetName:v}))} placeholder="receipt_index"/>

      <Btn primary full onClick={()=>onSave(config)} style={{marginTop:4,marginBottom:12}}>
        💾 保存设置
      </Btn>
      <Btn danger full onClick={onReset}>🗑️ 重置所有数据</Btn>

      {/* Info */}
      <div style={{marginTop:24,padding:"16px",background:T.sf,borderRadius:12,
        border:`1px solid ${T.bdr}`}}>
        <div style={{fontSize:12,fontWeight:700,color:T.tx2,marginBottom:8}}>ℹ️ 工作原理</div>
        <div style={{fontSize:11,color:T.tx3,lineHeight:1.8}}>
          1. 从 Drive 收件箱读取小票图片/PDF<br/>
          2. AI 自动提取日期、商户、金额、分类<br/>
          3. 重命名为「YYYY-MM-DD 分类 商户.ext」<br/>
          4. 高置信 → 已验证文件夹 / 低置信 → 待审核<br/>
          5. 元数据同步到 Google Sheets（可选）<br/>
          <br/>
          <strong style={{color:T.tx2}}>AI 引擎：</strong>Claude Sonnet（内置，无需 API Key）<br/>
          <strong style={{color:T.tx2}}>数据安全：</strong>所有数据存在您自己的 Google 账号中
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

const DEFAULT_CONFIG = {
  clientId: "",
  connected: false,
  inboxFolder: "00_inbox",
  validatedFolder: "10_validated",
  reviewFolder: "20_review_needed",
  sheetId: "",
  sheetName: "receipt_index",
  setupDone: false,
};

export default function ReceiptRenamer() {
  const [view, setView] = useState("dash");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [receipts, setReceipts] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const c = await load("rr-config", DEFAULT_CONFIG);
      const r = await load("rr-receipts", []);
      setConfig(c);
      setReceipts(r);
      setReady(true);
      // Auto-init Google if previously configured
      if (c.clientId && c.setupDone) {
        try {
          await initGoogleAPI(c.clientId);
        } catch {}
      }
    })();
  }, []);

  const saveConfig = async (c) => {
    setConfig(c);
    await store("rr-config", c);
  };

  const addReceipt = async (r) => {
    const updated = [r, ...receipts];
    setReceipts(updated);
    await store("rr-receipts", updated);
  };

  const deleteReceipt = async (id) => {
    const updated = receipts.filter(r => r.id !== id);
    setReceipts(updated);
    await store("rr-receipts", updated);
  };

  const handleSetupComplete = async (c) => {
    await saveConfig({ ...c, setupDone: true });
    setView("dash");
  };

  const handleReconnect = async () => {
    try {
      if (!gapiLoaded) await initGoogleAPI(config.clientId);
      await requestAccessToken();
      const updated = { ...config, connected: true };
      setConfig(updated);
      await store("rr-config", updated);
    } catch (e) {
      alert("连接失败：" + (e.message || JSON.stringify(e)));
    }
  };

  const handleReset = async () => {
    if (!confirm("确定要清除所有设置和记录吗？")) return;
    setConfig(DEFAULT_CONFIG);
    setReceipts([]);
    await store("rr-config", DEFAULT_CONFIG);
    await store("rr-receipts", []);
  };

  if (!ready) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:T.bg,fontFamily:F}}>
      <div style={{textAlign:"center",color:T.tx3}}>
        <div style={{fontSize:40,marginBottom:8}}>🧾</div>
        <div style={{fontSize:13}}>Loading...</div>
      </div>
    </div>
  );

  // Show setup if not configured
  if (!config.setupDone) {
    return (
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:F,color:T.tx,
        maxWidth:520,margin:"0 auto",WebkitFontSmoothing:"antialiased"}}>
        <style>{css}</style>
        <SetupView config={config} setConfig={setConfig} onSave={handleSetupComplete}/>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:F,color:T.tx,
      maxWidth:520,margin:"0 auto",WebkitFontSmoothing:"antialiased"}}>
      <style>{css}</style>

      {view === "dash" && <DashView receipts={receipts} onNav={setView}/>}
      {view === "inbox" && <InboxView config={config} onProcessed={addReceipt}/>}
      {view === "scan" && <ScanView config={config} onComplete={r => { addReceipt(r); setView("dash"); }}/>}
      {view === "log" && <LogView receipts={receipts} onDelete={deleteReceipt}/>}
      {view === "cfg" && <ConfigView config={config} setConfig={setConfig}
        onSave={saveConfig} onReconnect={handleReconnect} onReset={handleReset}/>}

      <Nav view={view} set={setView}/>
    </div>
  );
}
