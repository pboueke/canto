import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { FontPrefsContext, useFontPrefs } from '../FontPrefsContext';

describe('FontPrefsContext', () => {
  it('exposes safe default preferences outside a provider', () => {
    const { result } = renderHook(() => useFontPrefs());
    expect(result.current.fontSize).toBe('default');
    expect(result.current.fontFamily).toBe('default');
    expect(() => result.current.setFontSize('large')).not.toThrow();
    expect(() => result.current.setFontFamily('serif')).not.toThrow();
  });

  it('returns the provider preferences unchanged', () => {
    const setFontSize = jest.fn();
    const setFontFamily = jest.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <FontPrefsContext.Provider
        value={{ fontSize: 'large', fontFamily: 'serif', setFontSize, setFontFamily }}
      >
        {children}
      </FontPrefsContext.Provider>
    );
    const { result } = renderHook(() => useFontPrefs(), { wrapper });
    result.current.setFontSize('small');
    result.current.setFontFamily('dyslexic');
    expect(setFontSize).toHaveBeenCalledWith('small');
    expect(setFontFamily).toHaveBeenCalledWith('dyslexic');
  });
});
