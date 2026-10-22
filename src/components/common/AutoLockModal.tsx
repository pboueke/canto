import { useSyncExternalStore } from 'react';
import { Modal } from 'react-native';
import { router } from 'expo-router';
import { useJournalKeys } from '@/contexts/JournalKeyContext';
import { PrivacyShield } from '@/components/common/PrivacyShield';

/**
 * Full-screen, opaque lock screen: the app's only top-level privacy modal.
 * The background cover is a plain shield view instead, because iOS presents
 * one modal per presenter and a second sibling modal would be dropped.
 */
export function AutoLockModal() {
  const { getOverlayState, subscribePrivacyCover, dismissLockScreen } = useJournalKeys();
  const { locked } = useSyncExternalStore(subscribePrivacyCover, getOverlayState);

  const handleRequestClose = () => {
    dismissLockScreen();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  };

  return (
    <Modal
      visible={locked}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleRequestClose}
    >
      <PrivacyShield variant="screen" />
    </Modal>
  );
}
