import { Platform, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { ALL } from '@/lib/gameFilters';
import { colors } from '@/theme';

export function DropdownFilter({
  label,
  allLabel,
  options,
  selected,
  onSelect,
}: {
  label: string;
  allLabel?: string;
  options: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const allOptions = allLabel ? [{ label: allLabel, value: ALL }, ...options] : options;

  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.dropdownWrapper}>
        <Picker
          selectedValue={selected}
          onValueChange={(value) => onSelect(value)}
          style={styles.picker}
          accessibilityLabel={label}
        >
          {allOptions.map((option) => (
            <Picker.Item key={option.value} label={option.label} value={option.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { gap: 6 },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  dropdownWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  picker: {
    color: colors.text,
    ...Platform.select({
      ios: { height: 120 },
      default: { height: 44 },
    }),
  },
});
