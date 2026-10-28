import { Alert, Box, Button, Chip, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';

import { api, errMsg } from '../api';

interface Integrations {
  telegram: { configured: boolean; chats: number; dashboardUrl: string | null; pendingAlertMinutes: number };
  otomax: { enabled: boolean; host: string | null; memberId: string | null; auth: string | null; reportKeySet: boolean; reportIpAllowlist: string[]; reportUrl: string };
  otp: { provider: string | null; purposes: string[]; channels: string[] };
}

const OTP_PURPOSE_LABEL: Record<string, string> = { RESET_PIN: 'lupa PIN', VERIFY_PHONE: 'ganti nomor HP', REGISTER: 'daftar' };

const On = ({ on, label }: { on: boolean; label: string }) => <Chip size="small" label={label} color={on ? 'success' : 'default'} variant={on ? 'filled' : 'outlined'} />;

/** Read-only status of Telegram alerts + OtomaX (values live in the server .env). */
export function IntegrationsCard({ canTest }: { canTest: boolean }) {
  const q = useQuery({ queryKey: ['admin-integrations'], queryFn: async () => (await api.get<Integrations>('/admin/integrations')).data });
  const test = useMutation({ mutationFn: async () => (await api.post<{ sent: boolean; reason?: string }>('/admin/integrations/telegram/test')).data });
  const d = q.data;
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Integrasi</Typography>
      <Typography variant="caption" color="text.secondary">Diatur lewat file .env di server (rahasia tidak ditampilkan).</Typography>
      {d && (
        <Table size="small" sx={{ mt: 1 }}>
          <TableBody>
            <TableRow>
              <TableCell sx={{ width: 140, fontWeight: 600 }}>Telegram</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <On on={d.telegram.configured} label={d.telegram.configured ? `Aktif · ${d.telegram.chats} chat` : 'Belum diatur'} />
                  <Typography variant="caption" color="text.secondary">Notifikasi: top up diklaim, order perlu diproses, order gagal/macet &gt; {d.telegram.pendingAlertMinutes} menit</Typography>
                  {canTest && <Button size="small" disabled={!d.telegram.configured || test.isPending} onClick={() => test.mutate()}>Kirim pesan tes</Button>}
                </Box>
                {test.data && (test.data.sent ? <Alert severity="success" sx={{ mt: 1 }}>Pesan tes terkirim</Alert> : <Alert severity="warning" sx={{ mt: 1 }}>{test.data.reason}</Alert>)}
                {test.isError && <Alert severity="error" sx={{ mt: 1 }}>{errMsg(test.error)}</Alert>}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, verticalAlign: 'top' }}>OtomaX</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <On on={d.otomax.enabled} label={d.otomax.enabled ? 'Terhubung' : 'Belum diatur — semua order manual'} />
                  {d.otomax.enabled && <Typography variant="caption">{d.otomax.host} · member {d.otomax.memberId} · auth {d.otomax.auth}</Typography>}
                </Box>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                  URL report untuk diisi di OtomaX {d.otomax.reportKeySet ? '' : '(OTOMAX_REPORT_KEY belum diisi)'}:
                </Typography>
                <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{d.otomax.reportUrl}</code>
                {d.otomax.reportIpAllowlist.length > 0 && <Typography variant="caption" component="div">IP diizinkan: {d.otomax.reportIpAllowlist.join(', ')}</Typography>}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Kode OTP</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <On on={!!d.otp.provider} label={d.otp.provider ? `Aktif · ${d.otp.provider}` : 'Belum diatur — kode hanya di log server'} />
                  {d.otp.provider && (
                    <Typography variant="caption">
                      untuk {d.otp.purposes.map((p) => OTP_PURPOSE_LABEL[p] ?? p).join(', ')} · lewat {d.otp.channels.join(' → ')}
                    </Typography>
                  )}
                </Box>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
      {q.isError && <Alert severity="error">{errMsg(q.error)}</Alert>}
    </Paper>
  );
}
