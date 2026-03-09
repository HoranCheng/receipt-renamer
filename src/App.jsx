import { useState, useEffect } from 'react';
import { T, F } from './constants/theme';
import { DEFAULT_CONFIG } from './constants';
import { initGoogleAPI, isGapiLoaded, requestAccessToken } from './services/google';
import { store, load } from './services/storage';
import { css } from './styles';
import Nav from './components/Nav';
import SetupView from './views/SetupView';
import DashView from './views/DashView';
import InboxView from './views/InboxView';
import ScanView from './views/ScanView';
import LogView from './views/LogView';
import ConfigView from './views/ConfigView';

export default function App() {
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
      if (!isGapiLoaded()) await initGoogleAPI(config.clientId);
      await requestAccessToken();
      const updated = { ...config, connected: true };
      setConfig(updated);
      await store("rr-config", updated);
    } catch (e) {
      alert("\u8FDE\u63A5\u5931\u8D25\uFF1A" + (e.message || JSON.stringify(e)));
    }
  };

  const handleReset = async () => {
    if (!confirm("\u786E\u5B9A\u8981\u6E05\u9664\u6240\u6709\u8BBE\u7F6E\u548C\u8BB0\u5F55\u5417\uFF1F")) return;
    setConfig(DEFAULT_CONFIG);
    setReceipts([]);
    await store("rr-config", DEFAULT_CONFIG);
    await store("rr-receipts", []);
  };

  if (!ready) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",
      background:T.bg,fontFamily:F}}>
      <div style={{textAlign:"center",color:T.tx3}}>
        <div style={{fontSize:40,marginBottom:8}}>{"\u{1F9FE}"}</div>
        <div style={{fontSize:13}}>Loading...</div>
      </div>
    </div>
  );

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
