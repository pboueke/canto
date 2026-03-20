import { Platform, type ViewStyle } from 'react-native';

/** Max width for floating (non-fullscreen) modals on web. */
export const webModalContent: ViewStyle = Platform.OS === 'web' ? { maxWidth: 1000 } : {};
