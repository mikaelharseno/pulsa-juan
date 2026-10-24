import { formatRp } from 'pulsa-juan-common';

// Admin alerts to a Telegram group (TELEGRAM_BOT_TOKEN + TELEGRAM_ALERT_CHAT_IDS).
// Fire-and-forget: never awaited by request handlers, never throws, no-op when
// unconfigured. Tests swap the sender with setTelegramSender.

export type TelegramSender = (chatId: string, html: string) => Promise<void>;

const TIMEOUT_MS = 5000;

const defaultSender: TelegramSender = async (chatId, html) => {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`telegram ${res.status}: ${(await res.text()).slice(0, 200)}`);
};

let sender: TelegramSender = defaultSender;

export function setTelegramSender(s: TelegramSender | null) {
  sender = s ?? defaultSender;
}

export function alertChatIds(): string[] {
  return (process.env.TELEGRAM_ALERT_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function telegramConfigured() {
  return sender !== defaultSender || (!!process.env.TELEGRAM_BOT_TOKEN && alertChatIds().length > 0);
}

export function escapeHtml(s: string | number | null | undefined) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function dashboardLink(path: string, label: string) {
  const base = (process.env.DASHBOARD_URL ?? '').replace(/\/$/, '');
  return base ? `<a href="${escapeHtml(base + path)}">${escapeHtml(label)}</a>` : '';
}

/** Sends to every alert chat; resolves when done, never rejects. */
export async function sendAdminAlert(html: string): Promise<void> {
  const chats = alertChatIds();
  if (!telegramConfigured()) {
    // local dev: show what would have been sent
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') console.log(`[telegram off] ${html.replace(/<[^>]+>/g, '')}`);
    return;
  }
  await Promise.all(
    (chats.length ? chats : ['test']).map((chatId) =>
      sender(chatId, html).catch((error) => console.error('telegram alert failed', (error as Error).message)),
    ),
  );
}

/** For hot paths: schedule the alert and return immediately. */
export function queueAdminAlert(html: string) {
  void sendAdminAlert(html);
}

// ---- message builders ----

interface AlertAgent {
  id: string;
  name: string;
  phone: string;
}

export function topUpClaimedAlert(o: { orderNumber: number; totalTransfer: number; bank: string | null }, agent: AlertAgent) {
  return [
    `💰 <b>Top up #${o.orderNumber} — sudah transfer</b>`,
    `${escapeHtml(agent.name)} (${escapeHtml(agent.phone)})`,
    `Transfer <b>${escapeHtml(formatRp(o.totalTransfer))}</b> via ${escapeHtml(o.bank ?? '-')}`,
    'Cek mutasi bank lalu konfirmasi dengan bukti.',
    dashboardLink('/topups', 'Buka Top Up Saldo →'),
  ]
    .filter(Boolean)
    .join('\n');
}

interface AlertTrx {
  trxNumber: number;
  segmentLabel: string;
  phoneNumber: string | null;
  customerId: string | null;
  total: number;
  agentId: string;
}

function trxLines(t: AlertTrx, packageName: string | null, agentName?: string) {
  return [
    `${escapeHtml(t.segmentLabel)}${packageName ? ` · ${escapeHtml(packageName)}` : ''}`,
    `Tujuan <b>${escapeHtml(t.phoneNumber ?? t.customerId ?? '-')}</b> · ${escapeHtml(formatRp(t.total))}`,
    agentName ? `Agen: ${escapeHtml(agentName)}` : '',
  ];
}

const orderLink = (t: AlertTrx) => dashboardLink(`/transactions?agentId=${t.agentId}`, 'Buka Order Isi Pulsa →');

export function manualOrderAlert(t: AlertTrx, packageName: string | null, agentName: string) {
  return [`🧾 <b>Order #${t.trxNumber} perlu diproses manual</b>`, ...trxLines(t, packageName, agentName), orderLink(t)].filter(Boolean).join('\n');
}

export function supplierFailedAlert(t: AlertTrx, reason: string | null) {
  return [
    `⚠️ <b>Order #${t.trxNumber} GAGAL di OtomaX</b> — saldo agen sudah direfund otomatis`,
    ...trxLines(t, null),
    reason ? `Pesan: <i>${escapeHtml(reason.slice(0, 300))}</i>` : '',
    orderLink(t),
  ]
    .filter(Boolean)
    .join('\n');
}

export function supplierUnreachableAlert(t: AlertTrx, error: string) {
  return [
    `🚨 <b>Order #${t.trxNumber} tidak terkirim ke OtomaX</b>`,
    ...trxLines(t, null),
    `Error: <i>${escapeHtml(error.slice(0, 200))}</i>`,
    'Cek apakah order masuk di OtomaX, atau proses manual (Sukses/Gagal) di dashboard.',
    orderLink(t),
  ]
    .filter(Boolean)
    .join('\n');
}

export function stuckOrderAlert(t: AlertTrx & { provider: string | null }, minutes: number) {
  return [
    `⏳ <b>Order #${t.trxNumber} masih diproses lebih dari ${minutes} menit</b> (${escapeHtml(t.provider === 'otomax' ? 'OtomaX' : 'manual')})`,
    ...trxLines(t, null),
    orderLink(t),
  ]
    .filter(Boolean)
    .join('\n');
}
