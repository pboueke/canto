import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';

interface MonthPreviewProps {
  year: number;
  month: number; // 0-11
  daysWithPages: Set<number>;
  onPress: (payload: { year: number; month: number }) => void;
}

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  ru: 'ru-RU',
  zh: 'zh-CN',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ar: 'ar-SA',
  hi: 'hi-IN',
  tr: 'tr-TR',
  nl: 'nl-NL',
  pl: 'pl-PL',
  sv: 'sv-SE',
  vi: 'vi-VN',
  th: 'th-TH',
  id: 'id-ID',
  uk: 'uk-UA',
};

export function MonthPreview({ year, month, daysWithPages, onPress }: MonthPreviewProps) {
  const { theme } = useTheme();
  const { lang } = useI18n();

  const monthLabel = useMemo(() => {
    try {
      const d = new Date(Date.UTC(year, month, 1));
      return d.toLocaleDateString(LOCALE_MAP[lang] ?? 'en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
    } catch {
      return `${month + 1}/${year}`;
    }
  }, [year, month, lang]);

  const grid = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(year, month, 1));
    const leadingBlanks = firstDayOfMonth.getUTCDay(); // 0 = Sunday
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  return (
    <Pressable
      testID={`month-preview-${year}-${month}`}
      onPress={() => onPress({ year, month })}
      style={[
        styles.card,
        Platform.OS === 'web' && styles.cardWeb,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.text, fontFamily: theme.fonts.bold }]}>
        {monthLabel}
      </Text>
      <View style={styles.grid}>
        {grid.map((day, i) => {
          const highlighted = day !== null && daysWithPages.has(day);
          return (
            <View
              key={i}
              testID={
                day === null
                  ? `month-cell-${year}-${month}-blank-${i}`
                  : `month-cell-${year}-${month}-${day}${highlighted ? '-highlight' : ''}`
              }
              style={styles.cell}
            >
              {day !== null && (
                <View
                  style={[styles.dayWrap, highlighted && { backgroundColor: theme.colors.primary }]}
                >
                  <Text
                    style={{
                      color: highlighted ? '#fff' : theme.colors.text,
                      fontFamily: theme.fonts.regular,
                      fontSize: 13,
                    }}
                  >
                    {day}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  cardWeb: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
