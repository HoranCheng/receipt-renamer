import { Component } from 'react';
import { T, F } from '../constants/theme';
import Btn from './Btn';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: T.bg,
            fontFamily: F,
            color: T.tx,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 340 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              出错了
            </div>
            <div
              style={{
                fontSize: 13,
                color: T.tx2,
                marginBottom: 6,
                lineHeight: 1.6,
              }}
            >
              应用遇到了一个意外错误。
            </div>
            <div
              style={{
                fontSize: 11,
                color: T.tx3,
                fontFamily: "'IBM Plex Mono', monospace",
                background: T.sf,
                border: `1px solid ${T.bdr}`,
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 20,
                textAlign: 'left',
                wordBreak: 'break-word',
                maxHeight: 80,
                overflow: 'auto',
              }}
            >
              {this.state.error?.message || 'Unknown error'}
            </div>
            <Btn primary onClick={this.handleRetry}>
              🔄 重试
            </Btn>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
