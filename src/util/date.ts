// ローカルタイムゾーンでの YYYY-MM-DD 文字列。Date#toISOString はUTC基準になり
// 日付がずれることがあるため使わない。
export function todayString(): string {
  return dateToString(new Date());
}

export function dateToString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
