import { T } from '../constants/theme';

export default function StatusDot({ level }) {
  const clr = level==="ok"?T.grn:level==="warn"?T.acc:T.red;
  return <span style={{width:7,height:7,borderRadius:"50%",background:clr,display:"inline-block"}}/>;
}
