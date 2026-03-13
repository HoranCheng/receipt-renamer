import { useState, useEffect, useRef } from 'react';
import { T } from '../constants/theme';
import {
  findOrCreateFolder,
  listFilesInFolder,
} from '../services/google';
import { processSingleFile } from '../services/processor';
import { seedNameCounters } from '../utils/naming';
import Header from '../components/Header';
import Btn from '../components/Btn';

export default function InboxView({ config, onProcessed, showAlert }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [results, setResults] = useState({});
  const [batchMode, setBatchMode] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const inboxIdRef = useRef(null);
  const validIdRef = useRef(null);
  const reviewIdRef = useRef(null);

  const loadInbox = async () => {
    setLoading(true);
    try {
      const inboxId = await findOrCreateFolder(
        config.inboxFolder || '小票待处理'
      );
      inboxIdRef.current = inboxId;
      validIdRef.current = await findOrCreateFolder(
        config.validatedFolder || '小票已存档'
      );
      reviewIdRef.current = await findOrCreateFolder(
        config.reviewFolder || '小票待确认'
      );
      // Seed name counters to avoid collisions with existing files
      try {
        const [validFiles, reviewFiles] = await Promise.all([
          listFilesInFolder(validIdRef.current).then(r => r.files),
          listFilesInFolder(reviewIdRef.current).then(r => r.files),
        ]);
        seedNameCounters([...validFiles, ...reviewFiles].map(f => f.name));
      } catch (e) { console.warn('Counter seed failed:', e); }

      const result = await listFilesInFolder(inboxId);
      setFiles(result.files);
      setNextPageToken(result.nextPageToken);
    } catch (e) {
      (showAlert || alert)('加载失败', e.message, true);
    }
    setLoading(false);
  };

  const loadMore = async () => {
    if (!nextPageToken || !inboxIdRef.current) return;
    setLoadingMore(true);
    try {
      const result = await listFilesInFolder(
        inboxIdRef.current,
        nextPageToken
      );
      setFiles((prev) => [...prev, ...result.files]);
      setNextPageToken(result.nextPageToken);
    } catch (e) {
      console.warn('Load more failed:', e);
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    if (config.connected) loadInbox();
  }, []);

  const processFile = async (file) => {
    setProcessing(file.id);
    try {
      // Delegate to the unified processor pipeline
      const result = await processSingleFile(file, config);

      if (result.success && result.receipt) {
        setResults((prev) => ({
          ...prev,
          [file.id]: { status: 'done', receipt: result.receipt, newName: result.receipt.newName },
        }));
        onProcessed(result.receipt);
        return result.receipt;
      } else {
        // not_receipt or error from processor
        const reason = result.reason === 'not_receipt' ? '不是小票' : (result.error || '处理失败');
        setResults((prev) => ({
          ...prev,
          [file.id]: { status: result.reason === 'not_receipt' ? 'not_receipt' : 'error', error: reason },
        }));
        return null;
      }
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [file.id]: { status: 'error', error: e.message },
      }));
      return null;
    } finally {
      setProcessing(null);
    }
  };

  const batchProcess = async (filesToProcess) => {
    const targets = filesToProcess || files.filter((f) => !results[f.id]);
    setBatchMode(true);
    setBatchProgress({ current: 0, total: targets.length, failed: 0 });
    let failCount = 0;
    for (let i = 0; i < targets.length; i++) {
      setBatchProgress({
        current: i + 1,
        total: targets.length,
        failed: failCount,
      });
      const result = await processFile(targets[i]);
      if (!result) failCount++;
      if (i < targets.length - 1)
        await new Promise((r) => setTimeout(r, 1500));
    }
    setBatchProgress((prev) => ({ ...prev, failed: failCount }));
    setBatchMode(false);
  };

  const retryFailed = () => {
    const failedFiles = files.filter(
      (f) => results[f.id]?.status === 'error'
    );
    // Clear previous error results for these files
    setResults((prev) => {
      const next = { ...prev };
      failedFiles.forEach((f) => delete next[f.id]);
      return next;
    });
    batchProcess(failedFiles);
  };

  const failedCount = Object.values(results).filter(
    (r) => r.status === 'error'
  ).length;

  if (!config.connected) {
    return (
      <div style={{ padding: '0 16px 100px' }}>
        <Header
          title={'\u6536\u4EF6\u7BB1'}
          sub={'\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u8FDE\u63A5 Google'}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '0 16px 100px' }}>
      <Header
        title={'Drive \u6536\u4EF6\u7BB1'}
        sub={`${config.inboxFolder || '小票待处理'} \u00B7 ${files.length} \u4E2A\u6587\u4EF6`}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Btn small onClick={loadInbox} style={{ flex: 1 }}>
          {'\u{1F504} \u5237\u65B0'}
        </Btn>
        {files.length > 0 && !batchMode && (
          <Btn
            small
            primary
            onClick={() => batchProcess()}
            style={{ flex: 2 }}
          >
            {'\u26A1 \u4E00\u952E\u5168\u90E8\u5904\u7406'} (
            {files.filter((f) => !results[f.id]).length})
          </Btn>
        )}
      </div>

      {/* Retry failed button */}
      {!batchMode && failedCount > 0 && (
        <Btn
          small
          danger
          onClick={retryFailed}
          style={{ width: '100%', marginBottom: 14 }}
        >
          🔄 重试失败项 ({failedCount})
        </Btn>
      )}

      {batchMode && (
        <div
          style={{
            background: T.accDim,
            border: `1px solid ${T.accGlow}`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: T.acc }}>
              {'\u6279\u91CF\u5904\u7406\u4E2D...'}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: T.acc,
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              {batchProgress.current}/{batchProgress.total}
              {batchProgress.failed > 0 && (
                <span style={{ color: T.red, marginLeft: 6 }}>
                  ({batchProgress.failed} 失败)
                </span>
              )}
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: T.bdr,
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                background: T.acc,
                transition: 'width 0.3s',
                width: `${(batchProgress.current / batchProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: T.tx3 }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${T.bdr}`,
              borderTopColor: T.acc,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 12px',
            }}
          />
          {'\u6B63\u5728\u52A0\u8F7D Drive \u6587\u4EF6...'}
        </div>
      ) : files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: T.tx3 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{'\u{1F4ED}'}</div>
          <div style={{ fontSize: 13 }}>{'\u6536\u4EF6\u7BB1\u4E3A\u7A7A'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f) => {
            const res = results[f.id];
            const isProcessing = processing === f.id;
            return (
              <div
                key={f.id}
                style={{
                  background: T.card,
                  border: `1px solid ${T.bdr}`,
                  borderRadius: 13,
                  padding: '12px 14px',
                  animation: 'fadeUp 0.3s ease both',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: T.sf2,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {f.thumbnailLink ? (
                      <img
                        src={f.thumbnailLink}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        alt=""
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span style={{ fontSize: 20 }}>{'\u{1F4C4}'}</span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: T.tx,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.name}
                    </div>
                    {res?.status === 'done' ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: T.grn,
                          marginTop: 2,
                          fontWeight: 500,
                        }}
                      >
                        {'\u2713 \u2192'} {res.newName}
                      </div>
                    ) : res?.status === 'error' ? (
                      <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>
                        {'\u2717'} {res.error}
                      </div>
                    ) : isProcessing ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: T.acc,
                          marginTop: 2,
                          animation: 'pulse 1.5s infinite',
                        }}
                      >
                        {'\u8BC6\u522B\u4E2D...'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: T.tx3, marginTop: 2 }}>
                        {(parseInt(f.size) / 1024).toFixed(0)} KB
                      </div>
                    )}
                  </div>
                  {!res && !isProcessing && !batchMode && (
                    <Btn small primary onClick={() => processFile(f)}>
                      {'\u5904\u7406'}
                    </Btn>
                  )}
                  {isProcessing && (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        border: `2px solid ${T.bdr}`,
                        borderTopColor: T.acc,
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                  )}
                  {res?.status === 'done' && (
                    <span
                      style={{ fontSize: 12, color: T.grn, fontWeight: 700 }}
                    >
                      ${parseFloat(res.receipt.amount || 0).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Load More button */}
          {nextPageToken && (
            <Btn
              small
              onClick={loadMore}
              disabled={loadingMore}
              style={{ width: '100%', marginTop: 10 }}
            >
              {loadingMore ? '加载中...' : '📥 加载更多'}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}
