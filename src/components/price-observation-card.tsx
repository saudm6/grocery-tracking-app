import { Text, View } from 'react-native';
import { formatOMR, type PriceObservation } from '../data/grocery';
import { Action } from './form';

export function PriceObservationCard({ observation, disabled, onToggle }: { observation: PriceObservation; disabled: boolean; onToggle: () => void }) {
  return <View style={{ padding: 16, gap: 6, borderWidth: 1, borderColor: '#657469', borderRadius: 10, backgroundColor: '#fff' }}>
    <Text selectable>Observation {observation.id} · {formatOMR(observation.price)} OMR · {observation.effectiveDate ?? `${observation.effectiveMonth} · Exact date not supplied`}</Text>
    <Text selectable>{observation.baseline ? 'Timeline baseline · ' : ''}{observation.included ? 'Included in inflation' : 'Not inflation'}</Text>
    <Text selectable>Source · {observation.source === 'saved_price' ? 'Saved price' : 'Receipt'}{observation.sourcePurchaseId !== null ? ` · Purchase ${observation.sourcePurchaseId}` : ''}</Text>
    <Text selectable>Observed store · {observation.store ?? 'Not supplied'}</Text>
    <Text selectable>Recorded · {new Date(observation.recordedAt).toLocaleString()}</Text>
    <Text selectable>Previous actual price · {observation.previousPrice === null ? 'No earlier observation' : `${formatOMR(observation.previousPrice)} OMR`}</Text>
    <Text selectable>Counted change · {observation.countedChange > 0 ? '+' : observation.countedChange < 0 ? '-' : ''}{formatOMR(Math.abs(observation.countedChange))} OMR</Text>
    {!observation.baseline ? <Action label={`Observation ${observation.id} · ${observation.included ? 'Mark Not inflation' : 'Include in inflation'}`} disabled={disabled} onPress={onToggle} /> : <Text>The first observation is the baseline and contributes no change. Its inflation status is kept when the baseline changes.</Text>}
  </View>;
}
