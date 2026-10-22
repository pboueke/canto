import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { dictionaries } from '@/i18n/dictionaries';
import { JournalIntegrityPanel } from '../JournalIntegrityPanel';

const mockCopy = jest.fn(async (..._args: unknown[]) => ({ copied: true, report: 'report' }));
let mockRecoverProps: { visible: boolean; onRecovered: () => void; onClose: () => void } | null =
  null;

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('@/lib/diagnostics', () => ({
  copyDiagnosticsReport: (...args: unknown[]) => mockCopy(...args),
}));
jest.mock('../RecoverPagesModal', () => ({
  RecoverPagesModal: (props: NonNullable<typeof mockRecoverProps>) => {
    mockRecoverProps = props;
    return null;
  },
}));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: {
      colors: {
        background: '#fff',
        foreground: '#f5f5f5',
        border: '#ddd',
        text: '#111',
        textSecondary: '#666',
        primary: '#000',
        highlight: '#eee',
      },
      fonts: { regular: 'System', bold: 'System' },
    },
  }),
}));
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: require('@/i18n/dictionaries').dictionaries.en }),
}));

const t = dictionaries.en;

describe('JournalIntegrityPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecoverProps = null;
  });

  it('explains legacy zero-key pages and opens recovery with the verified key', () => {
    const key = new Uint8Array(32).fill(3);
    const onRecovered = jest.fn();
    const { getByText } = render(
      <JournalIntegrityPanel
        journalId="j1"
        code="LEGACY_ZERO_KEY"
        derivedKey={key}
        onRecovered={onRecovered}
        onBack={jest.fn()}
      />,
    );
    expect(getByText(t.journalIntegrity.legacyMessage)).toBeTruthy();
    expect(mockRecoverProps!.visible).toBe(false);
    fireEvent.press(getByText(t.journalIntegrity.recover));
    expect(mockRecoverProps!.visible).toBe(true);
    act(() => mockRecoverProps!.onRecovered());
    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(mockRecoverProps!.visible).toBe(false);
    fireEvent.press(getByText(t.journalIntegrity.recover));
    act(() => mockRecoverProps!.onClose());
    expect(mockRecoverProps!.visible).toBe(false);
  });

  it('tells the user to restart after an interrupted rotation, without a recovery action', () => {
    const onBack = jest.fn();
    const { getByText, queryByText } = render(
      <JournalIntegrityPanel
        journalId="j1"
        code="ROTATION_INTERRUPTED"
        onRecovered={jest.fn()}
        onBack={onBack}
      />,
    );
    expect(getByText(t.journalIntegrity.interruptedMessage)).toBeTruthy();
    expect(queryByText(t.journalIntegrity.recover)).toBeNull();
    fireEvent.press(getByText(t.journalIntegrity.back));
    expect(onBack).toHaveBeenCalled();
  });

  it('copies a counts-only diagnostics report for unreadable data', async () => {
    const { getByText } = render(
      <JournalIntegrityPanel
        journalId="j1"
        code="JOURNAL_UNREADABLE"
        onRecovered={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    expect(getByText(t.journalIntegrity.unreadableMessage)).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByText(t.journalIntegrity.copyDiagnostics));
    });
    expect(mockCopy).toHaveBeenCalledWith('JOURNAL_UNREADABLE', 'j1', undefined);
    expect(getByText(t.journalIntegrity.diagnosticsCopied)).toBeTruthy();
  });

  // Cross-platform review: browsers can refuse the clipboard; never claim a
  // copy that did not happen, and let the user copy the report by hand.
  it('shows the report for manual copying when the clipboard refused it', async () => {
    mockCopy.mockResolvedValueOnce({ copied: false, report: '{"format":"canto-diagnostics-v1"}' });
    const { getByText, getByTestId, queryByText } = render(
      <JournalIntegrityPanel
        journalId="j1"
        code="JOURNAL_UNREADABLE"
        onRecovered={jest.fn()}
        onBack={jest.fn()}
      />,
    );
    await act(async () => {
      fireEvent.press(getByText(t.journalIntegrity.copyDiagnostics));
    });
    expect(queryByText(t.journalIntegrity.diagnosticsCopied)).toBeNull();
    expect(getByText(t.journalIntegrity.diagnosticsCopyManually)).toBeTruthy();
    const report = getByTestId('diagnostics-report');
    expect(report.props.selectable).toBe(true);
    expect(report.props.children).toBe('{"format":"canto-diagnostics-v1"}');
  });
});
