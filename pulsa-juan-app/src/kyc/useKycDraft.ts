import { create } from 'zustand';

/** What the identity-check screens collect before the one upload at the end. */
interface KycDraft {
  ktpUri: string | null;
  ocrText: string;
  ocrNik: string | null;
  ocrName: string | null;
  nik: string;
  name: string;
  setKtp: (v: { uri: string; text: string; nik: string | null; name: string | null }) => void;
  setConfirmed: (v: { nik: string; name: string }) => void;
  reset: () => void;
}

const EMPTY = { ktpUri: null, ocrText: '', ocrNik: null, ocrName: null, nik: '', name: '' };

export const useKycDraft = create<KycDraft>((set) => ({
  ...EMPTY,
  setKtp: ({ uri, text, nik, name }) => set({ ktpUri: uri, ocrText: text, ocrNik: nik, ocrName: name, nik: nik ?? '', name: name ?? '' }),
  setConfirmed: ({ nik, name }) => set({ nik, name }),
  reset: () => set(EMPTY),
}));
