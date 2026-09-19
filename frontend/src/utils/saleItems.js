/** Immutable sale-line operations. IDs are per-line, never array indexes. */
export function appendSaleItem(items,id){
  if(items.some(x=>x.id===id))return items;
  return [...items,{id,productId:'',quantity:''}];
}
export function removeSaleItem(items,id){
  return items.length>1?items.filter(x=>x.id!==id):items;
}
