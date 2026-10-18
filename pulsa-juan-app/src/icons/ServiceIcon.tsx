import { Image } from 'expo-image';
import { builtinIcon, IconSpec, resolveIconColor } from 'pulsa-juan-common';
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

import { size } from '../theme';

/** Draws a built-in IconSpec (48x48 data) with react-native-svg. */
export function Glyph({ spec, px }: { spec: IconSpec; px: number }) {
  return (
    <Svg width={px} height={px} viewBox="0 0 48 48">
      {spec.elements.map((el, i) => {
        switch (el.type) {
          case 'path':
            return (
              <Path
                key={i}
                d={el.d}
                fill={el.stroke ? 'none' : resolveIconColor(spec, el.fill, spec.fg)}
                stroke={el.stroke ? resolveIconColor(spec, el.stroke, spec.fg) : undefined}
                strokeWidth={el.strokeWidth}
                strokeLinecap={el.linecap ?? 'round'}
                strokeLinejoin="round"
                opacity={el.opacity ?? 1}
              />
            );
          case 'circle':
            return (
              <Circle
                key={i}
                cx={el.cx}
                cy={el.cy}
                r={el.r}
                fill={el.stroke ? 'none' : resolveIconColor(spec, el.fill, spec.fg)}
                stroke={el.stroke ? resolveIconColor(spec, el.stroke, spec.fg) : undefined}
                strokeWidth={el.strokeWidth}
                opacity={el.opacity ?? 1}
              />
            );
          case 'rect':
            return <Rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx ?? 0} fill={resolveIconColor(spec, el.fill, spec.fg)} opacity={el.opacity ?? 1} />;
          case 'text':
            return (
              <SvgText
                key={i}
                x={el.x}
                y={el.y}
                fontSize={el.size}
                fontWeight={String(el.weight ?? 700) as never}
                fill={resolveIconColor(spec, el.fill, spec.accent)}
                textAnchor="middle"
                alignmentBaseline="central"
                letterSpacing={el.spacing ?? 0}
                fontFamily="Inter, system-ui, sans-serif"
              >
                {el.text}
              </SvgText>
            );
        }
      })}
    </Svg>
  );
}

/** Rounded-square tile: built-in glyph, or a remote image on a soft tile. */
export function ServiceTile({ iconUrl, slug, px = size.tile }: { iconUrl?: string | null; slug?: string; px?: number }) {
  const spec = builtinIcon(iconUrl, slug);
  const radius = Math.round(px * 0.27);
  if (spec) {
    return (
      <View style={{ width: px, height: px, borderRadius: radius, backgroundColor: spec.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph spec={spec} px={Math.round(px * 0.62)} />
      </View>
    );
  }
  return (
    <View style={{ width: px, height: px, borderRadius: radius, backgroundColor: '#E3F4F1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Image source={{ uri: iconUrl! }} style={{ width: Math.round(px * 0.62), height: Math.round(px * 0.62) }} contentFit="contain" />
    </View>
  );
}
