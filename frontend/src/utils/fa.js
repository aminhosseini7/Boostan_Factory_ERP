export function normalizeDigits(value=''){
  return String(value)
    .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[٬,]/g,'')
    .replace(/٫/g,'.');
}
export function toNumber(value){const n=Number(normalizeDigits(value));return Number.isFinite(n)?n:0}
export function formatNumber(value,opts={maximumFractionDigits:2}){return Number(value||0).toLocaleString('fa-IR',opts)}
export function formatToman(value){return `${formatNumber(value,{maximumFractionDigits:0})} تومان`}
export const paymentLabel={CASH:'نقدی',CARD:'کارت / انتقال بانکی',CREDIT:'نسیه',MIXED:'نسیه'};
export const saleStatusLabel={ACTIVE:'فعال',PARTIAL_RETURN:'مرجوعی بخشی',RETURNED:'مرجوع‌شده',CANCELLED:'باطل‌شده'};
export const shiftStatusLabel={ACTIVE:'در حال انجام',AWAITING_DEFECTS:'منتظر ثبت معیوب',FINALIZED:'نهایی‌شده'};
export const txLabel={OPENING:'موجودی اولیه',PRODUCTION:'تولید',SALE:'فروش',SALE_RETURN:'مرجوعی فروش',ADJUSTMENT_IN:'اصلاح افزایشی خودکار',ADJUSTMENT_OUT:'اصلاح کاهشی خودکار',PURCHASE:'خرید',GRINDING_OUT:'خروج برای آسیاب',GRINDING_IN:'ورود مواد آسیاب‌شده',PRODUCTION_CONSUMPTION:'مصرف تولید',PRODUCTION_SCRAP:'ضایعات تولید'};
export function normalizeInputValue(v){return normalizeDigits(v)}
