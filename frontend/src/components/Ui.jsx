export function Page({title,actions,children}){return <section><div className="page-head"><h1>{title}</h1><div>{actions}</div></div>{children}</section>}
export function Card({label,value,sub}){return <div className="card"><span>{label}</span><strong>{value??'-'}</strong>{sub&&<small>{sub}</small>}</div>}
export function ErrorBox({error}){if(!error)return null;return <div className="error">{error.response?.data?.message||error.message||String(error)}</div>}
export function Empty({text='داده‌ای وجود ندارد'}){return <div className="empty">{text}</div>}
