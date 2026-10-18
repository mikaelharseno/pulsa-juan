import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

import { api, errMsg } from '../api';

// Dashed drag-&-drop area (react-dropzone), ported from terbebas MediaDropZone.

export const IMAGE_ACCEPT = { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'] };
export const PROOF_ACCEPT = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] };

/** Hands the picked File(s) to the caller (no upload) — used for proof screenshots sent as multipart. */
export function FileDropZone({ onFiles, accept = IMAGE_ACCEPT, multiple = false, compact = false, label }: {
  onFiles: (files: File[]) => void;
  accept?: Record<string, string[]>;
  multiple?: boolean;
  compact?: boolean;
  label?: string;
}) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({ multiple, accept, onDrop: onFiles });
  return (
    <Box>
      <Box
        {...getRootProps()}
        sx={{
          border: '2px dashed',
          borderColor: isDragActive ? 'primary.main' : '#c5c9d4',
          borderRadius: 1,
          textAlign: 'center',
          cursor: 'pointer',
          bgcolor: isDragActive ? (t) => alpha(t.palette.primary.main, 0.06) : 'transparent',
          p: compact ? 1 : 2.5,
          transition: 'all 0.15s',
        }}
      >
        <input {...getInputProps()} />
        <Typography variant={compact ? 'caption' : 'body2'} sx={{ color: '#676767' }}>
          {isDragActive ? 'Lepaskan untuk memilih' : label ?? '📷 Tarik & letakkan gambar ke sini, atau klik untuk pilih'}
        </Typography>
      </Box>
      {fileRejections.length > 0 && (
        <Alert severity="error" sx={{ mt: 1 }}>
          Format file tidak didukung
        </Alert>
      )}
    </Box>
  );
}

export async function uploadFiles(files: File[], folder = 'media'): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', folder);
    const res = await api.post<{ url: string }>('/admin/uploads', fd);
    urls.push(res.data.url);
  }
  return urls;
}

/** Uploads to POST /admin/uploads and returns the public URLs. */
export function MediaDropZone({ onUploaded, folder = 'media', multiple = false, compact = false }: {
  onUploaded: (urls: string[]) => void;
  folder?: string;
  multiple?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handle = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setBusy(true);
      setError('');
      try {
        onUploaded(await uploadFiles(multiple ? files : files.slice(0, 1), folder));
      } catch (e) {
        setError(errMsg(e, 'Upload gagal'));
      } finally {
        setBusy(false);
      }
    },
    [onUploaded, folder, multiple],
  );
  return (
    <Box>
      {busy ? (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <CircularProgress size={22} />
        </Box>
      ) : (
        <FileDropZone onFiles={handle} multiple={multiple} compact={compact} />
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
