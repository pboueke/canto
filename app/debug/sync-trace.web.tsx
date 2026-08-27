import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';
import {
  clearSyncDebugTrace,
  isSyncDebugTraceEnabled,
  readSyncDebugTrace,
  setSyncDebugTraceEnabled,
} from '@/lib/sync/debug-trace';

function formatTrace(): string {
  return JSON.stringify(readSyncDebugTrace(), null, 2);
}

export default function SyncTracePage() {
  const [enabled, setEnabled] = useState(false);
  const [trace, setTrace] = useState('null');

  const refresh = useCallback(() => {
    setEnabled(isSyncDebugTraceEnabled());
    setTrace(formatTrace());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const start = () => {
    setSyncDebugTraceEnabled(true);
    clearSyncDebugTrace();
    refresh();
  };

  const stop = () => {
    setSyncDebugTraceEnabled(false);
    refresh();
  };

  const copy = async () => {
    await navigator.clipboard.writeText(trace);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Temporary sync trace</Text>
      <Text style={styles.copy}>
        Captures timings, JavaScript heap samples, supported total browser-agent memory, Drive
        request method/path/status, and body sizes. It never records journal content, attachment
        names, payloads, tokens, headers, or query strings.
      </Text>
      <Button
        title={enabled ? 'Tracing enabled' : 'Start collecting trace'}
        onPress={start}
        disabled={enabled}
      />
      <Button title="Stop collecting trace" onPress={stop} disabled={!enabled} />
      <Button title="Refresh trace" onPress={refresh} />
      <Button title="Copy trace" onPress={copy} />
      <Text selectable style={styles.output}>
        {trace}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16, padding: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  copy: { lineHeight: 22 },
  output: { fontFamily: 'monospace', fontSize: 12 },
});
