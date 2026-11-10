// Reading an Indonesian e-KTP from OCR text (ML Kit on the phone). OCR mixes
// up look-alike characters in the NIK line (O/0, I/l/1, B/8, S/5, Z/2, G/6), and
// the labels come as "NIK", "N I K", "Nama" or "Nama :" depending on the photo.

// province codes of the first two NIK digits (Dukcapil): 11–19 Sumatra,
// 21 Kepri, 31–36 Java, 51–53 Bali/Nusa Tenggara, 61–65 Kalimantan,
// 71–76 Sulawesi, 81–82 Maluku, 91–96 Papua
const PROVINCE_PREFIX = /^(1[1-9]|21|3[1-6]|5[1-3]|6[1-5]|7[1-6]|8[1-2]|9[1-6])/;

/**
 * 16 digits that look like a real NIK: a known province code, a birth date
 * (day 01–31, +40 for women) and month 01–12.
 */
export function isPlausibleNik(nik: string): boolean {
  if (!/^\d{16}$/.test(nik ?? '')) return false;
  if (!PROVINCE_PREFIX.test(nik)) return false;
  let day = Number(nik.slice(6, 8));
  if (day > 40) day -= 40;
  const month = Number(nik.slice(8, 10));
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

const DIGIT_LOOKALIKE: Record<string, string> = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', i: '1', L: '1', B: '8', S: '5', s: '5', Z: '2', z: '2', G: '6', b: '6', T: '7', '?': '7', A: '4' };

/** Turns an OCR'd run like "32O7I0S5O69O0OO2" into digits where it can. */
export function digitsFromOcr(run: string): string {
  return run
    .split('')
    .map((ch) => (/\d/.test(ch) ? ch : DIGIT_LOOKALIKE[ch] ?? ''))
    .join('');
}

function cleanName(raw: string): string {
  return raw
    .replace(/^[\s:;.\-=]+/, '')
    .replace(/[^A-Za-z.,' -]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,'-]+$/, '')
    .trim()
    .toUpperCase();
}

/**
 * Picks NIK and name out of the KTP's OCR text. Either may be null when the
 * photo is unclear; the agent confirms both before sending.
 */
export function parseKtpText(text: string): { nik: string | null; name: string | null } {
  const lines = (text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // NIK: prefer the line labelled NIK (or the line after it), else any 16-char run
  let nik: string | null = null;
  const candidates: string[] = [];
  lines.forEach((line, i) => {
    if (/^n\s*[i1l]\s*k\b/i.test(line)) {
      candidates.push(line.replace(/^n\s*[i1l]\s*k\s*[:;.]?/i, ''));
      if (lines[i + 1]) candidates.push(lines[i + 1]);
    }
  });
  candidates.push(...lines);
  for (const c of candidates) {
    for (const run of c.match(/[0-9OoDQIl|iLBSsZzGbT?A]{14,20}/g) ?? []) {
      const d = digitsFromOcr(run);
      if (d.length === 16 && isPlausibleNik(d)) {
        nik = d;
        break;
      }
    }
    if (nik) break;
  }

  // Name: the text after "Nama", or the next line when the label stands alone
  let name: string | null = null;
  for (let i = 0; i < lines.length && !name; i++) {
    const m = lines[i].match(/^nama\s*[:;.]?\s*(.*)$/i);
    if (!m) continue;
    const same = cleanName(m[1]);
    const next = lines[i + 1] && !/^(tempat|tgl|jenis|alamat)/i.test(lines[i + 1]) ? cleanName(lines[i + 1]) : '';
    name = same.length >= 2 ? same : next.length >= 2 ? next : null;
  }
  return { nik, name };
}
