import { Alert, Box, Button, Card, CardContent, TextField, Typography } from '@mui/material';
import { useState } from 'react';

import { AdminSession, api, errMsg } from '../api';
import { useSession } from '../auth/useSession';

export default function LoginPage() {
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<AdminSession>('/admin/login', { email, password });
      signIn(res.data);
    } catch (err) {
      setError(errMsg(err, 'Login gagal'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'primary.main', p: 2 }}>
      <Card sx={{ width: 380 }}>
        <CardContent component="form" onSubmit={submit} sx={{ p: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
            Pulsa Juan
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Masuk ke dashboard admin
          </Typography>
          <TextField label="Email" type="email" fullWidth margin="dense" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <TextField label="Password" type="password" fullWidth margin="dense" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 2, height: 44 }} disabled={busy || !email || !password}>
            {busy ? 'Memproses...' : 'Masuk'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
