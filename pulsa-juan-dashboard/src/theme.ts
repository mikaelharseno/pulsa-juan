import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    primary: { main: '#1E9C8F', dark: '#177A70', contrastText: '#fff' },
    secondary: { main: '#F28C28' },
    background: { default: '#F3F6F6', paper: '#fff' },
    text: { primary: '#1F2A2E', secondary: '#6B7A80' },
  },
  typography: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif', fontSize: 13 },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiTableCell: { styleOverrides: { root: { padding: '8px 12px' }, head: { fontWeight: 700, background: '#F7FAFA' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
});
