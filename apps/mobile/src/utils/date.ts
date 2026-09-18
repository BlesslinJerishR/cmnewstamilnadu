const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Date shifted into IST so its UTC getters read Indian wall-clock time. */
function ist(t: number): Date {
  return new Date(t + IST_OFFSET_MS);
}

/** "18 Sep 2026, 11:40 PM IST". Formatted by hand so it is identical on every device. */
export function formatIst(iso: string): string {
  const d = ist(new Date(iso).getTime());
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getUTCHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hour12}:${minutes} ${h < 12 ? 'AM' : 'PM'} IST`;
}

/** "5m ago", "3h ago", "2d ago", otherwise "12 Sep" (year only when not the current year). */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  const d = ist(t);
  const sameYear = d.getUTCFullYear() === ist(now).getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${sameYear ? '' : ` ${d.getUTCFullYear()}`}`;
}

/** Day heading in IST: "Today", "Yesterday", "Tuesday", or "12 September 2026". */
export function dayLabel(iso: string, now: number = Date.now()): string {
  const d = ist(new Date(iso).getTime());
  const today = ist(now);
  const startOf = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const diff = Math.round((startOf(today) - startOf(d)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return DAYS[d.getUTCDay()];
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

/** "Updated 4 min ago" style freshness line from a timestamp in ms. */
export function freshness(updatedAt: number, now: number = Date.now()): string {
  if (!updatedAt) return '';
  const m = Math.floor((now - updatedAt) / 60000);
  if (m < 1) return 'Updated just now';
  if (m < 60) return `Updated ${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `Updated ${h}h ago` : `Updated ${formatIst(new Date(updatedAt).toISOString())}`;
}
