const faDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });
const faDateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });

export function formatJalaliDate(value){ if(!value) return '-'; const d=value instanceof Date?value:new Date(value); return Number.isNaN(d.getTime())?String(value):faDate.format(d); }
export function formatJalaliDateTime(value){ if(!value) return '-'; const d=value instanceof Date?value:new Date(value); return Number.isNaN(d.getTime())?String(value):faDateTime.format(d); }
export function formatGregorianDateString(value){ if(!value) return '-'; return formatJalaliDate(`${value}T12:00:00+03:30`); }

const faDigits='۰۱۲۳۴۵۶۷۸۹';
export function normalizeDigits(s=''){return String(s).replace(/[۰-۹]/g,d=>String(faDigits.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));}
function div(a,b){return ~~(a/b)}
function mod(a,b){return a-~~(a/b)*b}
const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy,withoutLeap=false){let bl=breaks.length,gy=jy+621,leapJ=-14,jp=breaks[0],jm,jump=0,leap,leapG,march,n,i;if(jy<jp||jy>=breaks[bl-1])throw new Error('سال جلالی خارج از محدوده است');for(i=1;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(mod(jump,33),4);jp=jm}n=jy-jp;leapJ+=div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ+=1;leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;march=20+leapJ-leapG;if(withoutLeap)return{gy,march};if(jump-n<6)n=n-jump+div(jump+4,33)*33;leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return{leap,gy,march}}
function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d}
function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308;const gd=div(mod(i,153),5)+1;const gm=mod(div(i,153),12)+1;const gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd}}
function j2d(jy,jm,jd){const r=jalCal(jy,true);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1}
export function toGregorian(jy,jm,jd){return d2g(j2d(Number(jy),Number(jm),Number(jd)))}
export function jalaliToGregorianDate(value){const raw=normalizeDigits(value).trim().replace(/-/g,'/');const m=raw.match(/^(\d{3,4})\/(\d{1,2})\/(\d{1,2})$/);if(!m || m[1].length!==4 || m[2].length!==2 || m[3].length!==2)throw new Error('تاریخ را به شکل ۱۴۰۵/۰۶/۲۸ وارد کنید');const jy=Number(m[1]),jm=Number(m[2]),jd=Number(m[3]);if(jm<1||jm>12||jd<1||jd>31||(jm>6&&jd>30))throw new Error('تاریخ جلالی معتبر نیست');const g=toGregorian(jy,jm,jd);const check=new Intl.DateTimeFormat('en-US-u-ca-persian',{timeZone:'UTC',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date(Date.UTC(g.gy,g.gm-1,g.gd)));const part=t=>Number(check.find(x=>x.type===t)?.value);if(part('year')!==jy||part('month')!==jm||part('day')!==jd)throw new Error('تاریخ جلالی معتبر نیست');return `${String(g.gy).padStart(4,'0')}-${String(g.gm).padStart(2,'0')}-${String(g.gd).padStart(2,'0')}`}
export function todayJalali(){const parts=faDate.formatToParts(new Date());const get=t=>normalizeDigits(parts.find(p=>p.type===t)?.value||'');return `${get('year')}/${get('month')}/${get('day')}`;}
export function gregorianKeyToJalali(value){if(/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return formatGregorianDateString(value);if(/^\d{4}-\d{2}$/.test(String(value)))return formatGregorianDateString(`${value}-01`).slice(0,7);return value;}
