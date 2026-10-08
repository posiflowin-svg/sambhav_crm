// Reconcile legacy duplicate-SKU rows without changing physical stock.
function reconcileDuplicateLines(items) {
  const groups = new Map();
  for (const item of items || []) {
    const key = String(item.sku || item.productName || '').trim().toUpperCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let changed = false;
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    // Legacy sync copied the same receivedQuantity onto every matching SKU row.
    // Only repair the unmistakable pattern: identical nonzero received values,
    // with at least one row showing more received than ordered.
    const values = rows.map(r => Number(r.receivedQuantity || 0));
    if (!values[0] || !values.every(v => v === values[0]) ||
        !rows.some(r => Number(r.receivedQuantity || 0) > Number(r.quantity || 0))) continue;
    let remaining = values[0];
    for (const row of rows) {
      const corrected = Math.min(Math.max(0, Number(row.quantity || 0)), remaining);
      if (Number(row.receivedQuantity || 0) !== corrected) changed = true;
      row.receivedQuantity = corrected;
      remaining -= corrected;
    }
  }
  return changed;
}
function refreshReceivingStatus(pi) {
  const total = (pi.items || []).reduce((n, row) => n + Number(row.quantity || 0), 0);
  const received = (pi.items || []).reduce((n, row) => n + Number(row.receivedQuantity || 0), 0);
  pi.receivingStatus = received <= 0 ? 'pending' : received >= total ? 'received' : 'partial';
  if (pi.receivingStatus !== 'received') pi.receivedAt = undefined;
}
module.exports = { reconcileDuplicateLines, refreshReceivingStatus };
