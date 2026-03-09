import { T } from '../constants/theme';

export default function Header({ title, sub }) {
  return (
    <div style={{padding:"50px 0 16px"}}>
      <div style={{fontSize:22,fontWeight:800,color:T.tx,letterSpacing:"-0.3px"}}>{title}</div>
      {sub && <div style={{fontSize:12,color:T.tx2,marginTop:3}}>{sub}</div>}
    </div>
  );
}
