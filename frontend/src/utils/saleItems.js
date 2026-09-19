/** A sale line has a stable ID that belongs to that single row, not to its product. */
export function appendSaleItem(items,id){
  if(items.some(item=>item.id===id))return items;
  return [...items,{id,productId:'',quantity:''}];
}
export function removeSaleItem(items,id){
  if(items.length<=1)return items;
  // Delete EXACTLY ONE line, even if old browser state unexpectedly contains duplicate IDs.
  const index=items.findIndex(item=>item.id===id);
  return index<0?items:items.filter((_,position)=>position!==index);
}
export function hasUniqueSaleItemIds(items){return new Set(items.map(item=>item.id)).size===items.length;}
