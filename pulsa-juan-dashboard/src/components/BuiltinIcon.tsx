import { Box } from '@mui/material';
import { builtinIcon, IconSpec, resolveIconColor } from 'pulsa-juan-common';

/** DOM renderer for the shared IconSpec data (same glyphs as the app). */
export function IconGlyph({ spec, px }: { spec: IconSpec; px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 48 48">
      {spec.elements.map((el, i) => {
        switch (el.type) {
          case 'path':
            return <path key={i} d={el.d} fill={el.stroke ? 'none' : resolveIconColor(spec, el.fill, spec.fg)} stroke={el.stroke ? resolveIconColor(spec, el.stroke, spec.fg) : undefined} strokeWidth={el.strokeWidth} strokeLinecap={el.linecap ?? 'round'} strokeLinejoin="round" opacity={el.opacity ?? 1} />;
          case 'circle':
            return <circle key={i} cx={el.cx} cy={el.cy} r={el.r} fill={el.stroke ? 'none' : resolveIconColor(spec, el.fill, spec.fg)} stroke={el.stroke ? resolveIconColor(spec, el.stroke, spec.fg) : undefined} strokeWidth={el.strokeWidth} opacity={el.opacity ?? 1} />;
          case 'rect':
            return <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx ?? 0} fill={resolveIconColor(spec, el.fill, spec.fg)} opacity={el.opacity ?? 1} />;
          case 'text':
            return <text key={i} x={el.x} y={el.y} fontSize={el.size} fontWeight={el.weight ?? 700} fill={resolveIconColor(spec, el.fill, spec.accent)} textAnchor="middle" dominantBaseline="central" letterSpacing={el.spacing ?? 0} fontFamily="Inter, system-ui, sans-serif">{el.text}</text>;
        }
      })}
    </svg>
  );
}

/** Tile as the app shows it: built-in glyph on its tinted rounded square, or a remote image. */
export function ServiceTile({ iconUrl, slug, px = 40 }: { iconUrl?: string | null; slug?: string; px?: number }) {
  const spec = builtinIcon(iconUrl, slug);
  const radius = Math.round(px * 0.27);
  if (spec) {
    return (
      <Box sx={{ width: px, height: px, borderRadius: `${radius}px`, bgcolor: spec.bg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <IconGlyph spec={spec} px={Math.round(px * 0.62)} />
      </Box>
    );
  }
  return (
    <Box sx={{ width: px, height: px, borderRadius: `${radius}px`, bgcolor: '#E3F4F1', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
      <img src={iconUrl!} alt="" style={{ width: Math.round(px * 0.62), height: Math.round(px * 0.62), objectFit: 'contain' }} />
    </Box>
  );
}
