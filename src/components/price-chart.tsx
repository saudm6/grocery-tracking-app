import { useState } from 'react';
import { Text, View } from 'react-native';
import { formatOMR, type InflationPoint } from '../data/grocery';

export function PriceChart({ points }: { points: InflationPoint[] }) {
  const [width, setWidth] = useState(0);
  const height = 160;
  const padding = 12;
  const minimum = points.reduce((value, point) => Math.min(value, point.price), points[0]?.price ?? 0);
  const maximum = points.reduce((value, point) => Math.max(value, point.price), minimum);
  const positions = points.map((point, index) => ({
    x: points.length === 1 ? width / 2 : padding + index / (points.length - 1) * Math.max(0, width - padding * 2),
    y: maximum === minimum ? height / 2 : padding + (maximum - point.price) / (maximum - minimum) * (height - padding * 2),
  }));
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={{ fontSize: 20 }}>Recorded price chart</Text>
    <Text>Points follow observation order; spacing does not represent elapsed time. Not inflation points are omitted and leave gaps. The timeline baseline is shown when in range and counts no change.</Text>
    <Text selectable>Price scale · {formatOMR(minimum)} to {formatOMR(maximum)} OMR</Text>
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height, borderWidth: 1, borderColor: '#657469', borderRadius: 8, backgroundColor: '#f6faf7', overflow: 'hidden' }}>
      {width > padding * 2 ? points.map((point, index) => {
        const position = positions[index];
        const previous = positions[index - 1];
        const length = previous ? Math.hypot(position.x - previous.x, position.y - previous.y) : 0;
        const angle = previous ? Math.atan2(position.y - previous.y, position.x - previous.x) : 0;
        return <View key={point.id}>
          {previous && !point.gapBefore ? <View style={{ position: 'absolute', left: (previous.x + position.x) / 2 - length / 2, top: (previous.y + position.y) / 2 - 1, width: length, height: 2, backgroundColor: '#21643c', transform: [{ rotate: `${angle}rad` }] }} /> : null}
          <View style={{ position: 'absolute', left: position.x - 4, top: position.y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#21643c' }} />
        </View>;
      }) : null}
    </View>
    {points.map((point, index) => <View key={point.id} style={{ gap: 4, paddingVertical: 8 }}>
      {point.gapBefore ? <Text>Gap before this point · An excluded actual observation separates it from the previous visible point.</Text> : null}
      <Text selectable>Point {index + 1} · Observation {point.id} · {point.effectiveDate ?? `${point.effectiveMonth} · Exact date not supplied`} · {formatOMR(point.price)} OMR</Text>
      <Text selectable>{point.baseline ? 'Timeline baseline · Counted change 0.000 OMR' : `Counted change · ${point.countedChange > 0 ? '+' : point.countedChange < 0 ? '-' : ''}${formatOMR(Math.abs(point.countedChange))} OMR`}</Text>
      <Text selectable>Previous actual price · {point.previousPrice === null ? 'No earlier observation' : `${formatOMR(point.previousPrice)} OMR`}</Text>
      <Text selectable>Source · {point.source === 'saved_price' ? 'Saved price' : 'Receipt'}{point.sourcePurchaseId !== null ? ` · Purchase ${point.sourcePurchaseId}` : ''} · {point.included ? 'Included in inflation' : 'Not inflation'}</Text>
      <Text selectable>Observed store · {point.store ?? 'Not supplied'} · Recorded · {new Date(point.recordedAt).toLocaleString()}</Text>
    </View>)}
  </View>;
}
