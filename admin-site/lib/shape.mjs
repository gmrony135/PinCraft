// Shapes the rows into the payload lists. Pure: used by metrics.mjs and by the offline tests.
// Regular users keep their name/email/plan columns and now carry usageToday (pin packs · text · image) for the merged table.
// usageTotal stays out of the regular list: the New users card and Per-user usage card already show totals.
export function shapeLists(fresh, regular, rows) {
  const strip = ({ usageToday, usageTotal, usageYesterday, activeIn7, activeIn30, pinQueueItems, pinQueuePostedToday, ...row }) => row;
  return {
    newUsers: fresh.map(row => ({ ...strip(row), usageToday: row.usageToday, usageTotal: row.usageTotal, pinQueueItems: row.pinQueueItems, pinQueuePostedToday: row.pinQueuePostedToday })),
    users: regular.map(row => ({ ...strip(row), usageToday: row.usageToday })),
    usage: rows.map(row => ({ uid: row.uid, name: row.name, email: row.email, usageToday: row.usageToday, usageTotal: row.usageTotal, lastActiveDay: row.lastActiveDay, pinQueueItems: row.pinQueueItems, pinQueuePostedToday: row.pinQueuePostedToday })),
  };
}

// Yesterday's totals from the aiUsage day documents already read for every user. No extra reads.
export function yesterdayTotals(rows) {
  const sum = (fn) => rows.reduce((total, row) => total + fn(row), 0);
  const active = rows.filter(row => row.usageYesterday.pinPacks + row.usageYesterday.text + row.usageYesterday.image > 0).length;
  return {
    activeUsers: active,
    pinPacks: sum(row => row.usageYesterday.pinPacks),
    aiRequests: sum(row => row.usageYesterday.text + row.usageYesterday.image),
  };
}
