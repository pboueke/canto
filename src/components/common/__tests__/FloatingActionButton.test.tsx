import React from 'react';
import { render } from '@testing-library/react-native';
import { FloatingActionButton } from '../FloatingActionButton';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Feather: () => null,
}));

describe('FloatingActionButton', () => {
  it('adds safe area bottom inset to the bottom offset', () => {
    const { getByTestId, toJSON } = render(
      <FloatingActionButton icon="+" onPress={() => {}} backgroundColor="#000" color="#fff" />,
    );

    const tree = toJSON();
    // The Pressable should have bottom = 30 (default) + 48 (inset) = 78
    const flatStyle = Array.isArray(tree?.props?.style)
      ? Object.assign({}, ...tree.props.style)
      : tree?.props?.style;
    expect(flatStyle.bottom).toBe(78);
  });

  it('uses custom bottom prop plus inset', () => {
    const tree = render(
      <FloatingActionButton
        icon="+"
        onPress={() => {}}
        backgroundColor="#000"
        color="#fff"
        bottom={10}
      />,
    ).toJSON();

    const flatStyle = Array.isArray(tree?.props?.style)
      ? Object.assign({}, ...tree.props.style)
      : tree?.props?.style;
    expect(flatStyle.bottom).toBe(58); // 10 + 48
  });
});
