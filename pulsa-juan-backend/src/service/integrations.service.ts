import { otomaxConfig } from './fulfillment/otomax';
import { alertChatIds, escapeHtml, sendAdminAlert, telegramConfigured } from './telegram.service';

/** Read-only integration status for the dashboard (never returns secrets). */
export function integrationStatus() {
  const otomax = otomaxConfig();
  const apiBase = (process.env.UPLOADS_PUBLIC_BASE ?? '').replace(/\/$/, '');
  return {
    telegram: {
      configured: telegramConfigured(),
      chats: alertChatIds().length,
      dashboardUrl: process.env.DASHBOARD_URL ?? null,
      pendingAlertMinutes: Number(process.env.ALERT_PENDING_MINUTES) || 10,
    },
    otomax: {
      enabled: !!otomax,
      host: otomax ? new URL(otomax.url).host : null,
      memberId: otomax?.memberId ?? null,
      auth: otomax?.auth ?? null,
      reportKeySet: !!process.env.OTOMAX_REPORT_KEY,
      reportIpAllowlist: (process.env.OTOMAX_REPORT_IPS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      reportUrl: `${apiBase || 'https://<api>'}/api/fulfillment/otomax/report?key=<OTOMAX_REPORT_KEY>`,
    },
  };
}

export async function sendTelegramTest(adminEmail: string) {
  if (!telegramConfigured()) return { sent: false, reason: 'TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_IDS belum diisi di server' };
  await sendAdminAlert(`✅ Tes notifikasi Pulsa Juan dari dashboard (${escapeHtml(adminEmail)})`);
  return { sent: true };
}
