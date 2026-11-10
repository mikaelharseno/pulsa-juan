import crypto from 'crypto';
import sharp from 'sharp';

import { Agent, Prisma } from '../../prisma/generated';
import { prisma } from '../../prisma/client';
import { badRequest, notFound } from '../lib/errors';
import { getConfig } from './config.service';
import { putPrivate } from './privateStorage.service';

// Live check before the selfie. The server picks a random colour order; the
// phone turns the whole screen white (baseline) and then each colour in that
// order, taking a front-camera frame each time. A real face close to the
// screen picks up the colour; a printed photo held up does so far less evenly
// and a replayed video cannot know the order. We measure the face area (the
// centre of the frame) as chromaticity (r, g, b shares of the light) and check
// that every frame moved toward its colour, against the baseline and against
// the other colours.

export const LIVENESS_COLORS = ['red', 'blue', 'yellow'] as const;
export type LivenessColor = (typeof LIVENESS_COLORS)[number];
const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_FRAME_BYTES = 2 * 1024 * 1024;

export interface Chroma {
  r: number;
  g: number;
  b: number;
  /** mean brightness 0–255, to reject black / covered frames */
  luma: number;
}

/** Random order: every colour once, plus one repeat, never the same twice in a row. */
export function randomColorOrder(): LivenessColor[] {
  const order: LivenessColor[] = [...LIVENESS_COLORS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let extra: LivenessColor;
  do extra = LIVENESS_COLORS[crypto.randomInt(LIVENESS_COLORS.length)];
  while (extra === order[order.length - 1]);
  return [...order, extra];
}

export async function startChallenge(agent: Agent) {
  const colors = randomColorOrder();
  const c = await prisma.livenessChallenge.create({ data: { agentId: agent.id, colors, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) } });
  return { id: c.id, colors, expiresAt: c.expiresAt, flashMs: 450 };
}

/** Mean chromaticity of the face area: the centre 50% × 50% of the frame. */
export async function faceChroma(image: Buffer): Promise<Chroma> {
  const img = sharp(image).rotate();
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 32 || h < 32) throw badRequest('Gambar terlalu kecil', 'LIVENESS_FRAME');
  const region = { left: Math.round(w * 0.25), top: Math.round(h * 0.2), width: Math.round(w * 0.5), height: Math.round(h * 0.5) };
  const { channels } = await sharp(image).rotate().extract(region).removeAlpha().stats();
  const [R, G, B] = channels.map((ch) => ch.mean);
  const sum = R + G + B || 1;
  return { r: R / sum, g: G / sum, b: B / sum, luma: 0.299 * R + 0.587 * G + 0.114 * B };
}

/** How far a frame moved toward `color`, as a chromaticity score. */
function toward(color: LivenessColor, from: Chroma, to: Chroma) {
  const dr = to.r - from.r;
  const dg = to.g - from.g;
  const db = to.b - from.b;
  if (color === 'red') return dr - Math.max(dg, db);
  if (color === 'blue') return db - Math.max(dr, dg);
  return (dr + dg) / 2 - db; // yellow = red + green light, less blue
}

export interface LivenessResult {
  passed: boolean;
  reason: string | null;
  baseline: Chroma;
  frames: { color: LivenessColor; chroma: Chroma; vsBaseline: number; vsOthers: number }[];
  minShift: number;
}

/**
 * Pure check over measured frames. Each colour frame must move toward its
 * colour by `minShift` against the white baseline, and against the average of
 * the frames of the other colours (so a frame that is just darker or warmer
 * overall does not pass).
 */
export function evaluate(colors: LivenessColor[], baseline: Chroma, frames: Chroma[], minShift: number): LivenessResult {
  const rows = colors.map((color, i) => {
    const chroma = frames[i];
    const others = frames.filter((_, j) => colors[j] !== color);
    const avg = others.length
      ? { r: others.reduce((a, f) => a + f.r, 0) / others.length, g: others.reduce((a, f) => a + f.g, 0) / others.length, b: others.reduce((a, f) => a + f.b, 0) / others.length, luma: 0 }
      : baseline;
    return { color, chroma, vsBaseline: toward(color, baseline, chroma), vsOthers: toward(color, avg, chroma) };
  });
  let reason: string | null = null;
  if ([baseline, ...frames].some((f) => f.luma < 25)) reason = 'Gambar terlalu gelap. Dekatkan wajah ke layar dan cari tempat yang lebih redup.';
  else if (rows.some((r) => r.vsBaseline < minShift || r.vsOthers < minShift)) reason = 'Perubahan warna di wajah tidak terdeteksi. Dekatkan wajah ke layar, naikkan kecerahan, lalu ulangi.';
  return { passed: !reason, reason, baseline, frames: rows, minShift };
}

/**
 * Takes the frames for a challenge (baseline first, then one per colour in the
 * challenge's order), stores them privately and decides. One try per challenge.
 */
export async function checkChallenge(agent: Agent, id: string, files: { data: Buffer; mimetype: string }[]) {
  const c = await prisma.livenessChallenge.findFirst({ where: { id, agentId: agent.id } });
  if (!c) throw notFound('Tantangan tidak ditemukan');
  if (c.checkedAt) throw badRequest('Tantangan sudah dipakai, mulai ulang', 'LIVENESS_USED');
  if (c.expiresAt.getTime() < Date.now()) throw badRequest('Waktu habis, mulai ulang', 'LIVENESS_EXPIRED');
  const colors = c.colors as LivenessColor[];
  if (files.length !== colors.length + 1) throw badRequest(`Butuh ${colors.length + 1} gambar`, 'LIVENESS_FRAME');
  for (const f of files) {
    if (!['image/jpeg', 'image/png'].includes(f.mimetype) || f.data.length > MAX_FRAME_BYTES) throw badRequest('Gambar tidak valid', 'LIVENESS_FRAME');
  }
  // claim the challenge first so a second upload cannot race this one
  const claimed = await prisma.livenessChallenge.updateMany({ where: { id, checkedAt: null }, data: { checkedAt: new Date() } });
  if (!claimed.count) throw badRequest('Tantangan sudah dipakai, mulai ulang', 'LIVENESS_USED');

  const config = await getConfig();
  const measured = await Promise.all(files.map((f) => faceChroma(f.data)));
  const result = evaluate(colors, measured[0], measured.slice(1), config.livenessMinShift);
  const frameKeys = await Promise.all(files.map((f, i) => putPrivate(`liveness/${agent.id}`, i === 0 ? 'white' : colors[i - 1], f.data, f.mimetype)));
  await prisma.livenessChallenge.update({
    where: { id },
    data: { frameKeys, metrics: result as unknown as Prisma.InputJsonValue, passed: result.passed },
  });
  return { id, passed: result.passed, reason: result.reason };
}
