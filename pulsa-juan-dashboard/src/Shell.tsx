import {
  AccountTree,
  CreditCard,
  Group,
  Hub,
  Inventory2,
  Logout,
  Menu as MenuIcon,
  ReceiptLong,
  Settings,
} from '@mui/icons-material';
import { AppBar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, ListSubheader, Toolbar, Typography, useMediaQuery } from '@mui/material';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useSession } from './auth/useSession';

// NAV_ITEMS + groups pattern from terbebas prodpanel, but each item is its own
// page and routed by URL (deep-linkable, back button works).
export const NAV_ITEMS = [
  { key: 'topups', label: 'Top Up Saldo', to: '/topups', group: 'Operasional', icon: <CreditCard fontSize="small" /> },
  { key: 'transactions', label: 'Transaksi', to: '/transactions', group: 'Operasional', icon: <ReceiptLong fontSize="small" /> },
  { key: 'agents', label: 'Agen', to: '/agents', group: 'Mitra', icon: <Group fontSize="small" /> },
  { key: 'mitra', label: 'Referral & Komisi', to: '/mitra', group: 'Mitra', icon: <Hub fontSize="small" /> },
  { key: 'segments', label: 'Segmen & Alur', to: '/segments', group: 'Katalog', icon: <AccountTree fontSize="small" /> },
  { key: 'packages', label: 'Paket', to: '/packages', group: 'Katalog', icon: <Inventory2 fontSize="small" /> },
  { key: 'settings', label: 'Pengaturan', to: '/settings', group: 'Toko', icon: <Settings fontSize="small" /> },
];
const NAV_GROUPS = ['Operasional', 'Mitra', 'Katalog', 'Toko'];
const SIDEBAR = 220;
const HEADER = 60;

export default function Shell() {
  const wide = useMediaQuery('(min-width:960px)');
  const [open, setOpen] = useState(false);
  const session = useSession((s) => s.session)!;
  const signOut = useSession((s) => s.signOut);
  const location = useLocation();

  const nav = (
    <Box sx={{ width: SIDEBAR, pt: 1 }}>
      {NAV_GROUPS.map((g) => (
        <List key={g} dense subheader={<ListSubheader sx={{ lineHeight: '28px', fontSize: 11, letterSpacing: 1, color: 'text.secondary' }}>{g.toUpperCase()}</ListSubheader>}>
          {NAV_ITEMS.filter((i) => i.group === g).map((i) => (
            <ListItemButton
              key={i.key}
              component={NavLink}
              to={i.to}
              selected={location.pathname.startsWith(i.to)}
              onClick={() => setOpen(false)}
              sx={{ mx: 1, borderRadius: 1, '&.Mui-selected': { bgcolor: 'rgba(30,156,143,0.12)', color: 'primary.dark' } }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: 'inherit' }}>{i.icon}</ListItemIcon>
              <ListItemText primary={i.label} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
      ))}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ height: HEADER, justifyContent: 'center', zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ minHeight: HEADER }}>
          {!wide && (
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ fontWeight: 800, flex: 1 }}>
            Pulsa Juan · Dashboard
          </Typography>
          <Typography variant="body2" sx={{ mr: 1, opacity: 0.9 }}>
            {session.admin.email} · {session.admin.role}
          </Typography>
          <IconButton color="inherit" onClick={signOut} title="Keluar">
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>
      {wide ? (
        <Box component="nav" sx={{ width: SIDEBAR, flexShrink: 0, borderRight: '1px solid #E3E9EA', bgcolor: '#fff', position: 'fixed', top: HEADER, bottom: 0, overflowY: 'auto' }}>
          {nav}
        </Box>
      ) : (
        <Drawer open={open} onClose={() => setOpen(false)}>
          <Toolbar sx={{ minHeight: HEADER }} />
          <Divider />
          {nav}
        </Drawer>
      )}
      <Box component="main" sx={{ flex: 1, ml: wide ? `${SIDEBAR}px` : 0, mt: `${HEADER}px`, p: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
