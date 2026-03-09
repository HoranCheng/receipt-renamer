import { T } from '../constants/theme';
import { F } from '../constants/theme';

export default function Btn({ children, primary, danger, small, full, style: sx, ...props }) {
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
