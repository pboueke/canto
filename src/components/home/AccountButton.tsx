import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';

export function AccountButton() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { user, isSignedIn, isLoading, signIn, signOut } = useGoogleAuth();
  const [showPopover, setShowPopover] = useState(false);

  if (isLoading) return null;

  if (!isSignedIn) {
    return (
      <Pressable onPress={signIn} style={styles.row}>
        <Feather name="cloud" size={14} color={theme.colors.primary} />
        <Text
          style={[
            styles.connectText,
            { color: theme.colors.primary, fontFamily: theme.fonts.regular },
          ]}
        >
          {t.sync.connectAccount}
        </Text>
      </Pressable>
    );
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <>
      <Pressable onPress={() => setShowPopover(true)} style={styles.avatarButton}>
        {user?.photo ? (
          <Image source={{ uri: user.photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.initialsCircle, { backgroundColor: theme.colors.primary }]}>
            <Text
              style={[
                styles.initialsText,
                { color: theme.colors.foreground, fontFamily: theme.fonts.bold },
              ]}
            >
              {initials}
            </Text>
          </View>
        )}
      </Pressable>

      <Modal
        visible={showPopover}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPopover(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowPopover(false)}>
          <View
            style={[
              styles.popover,
              {
                backgroundColor: theme.colors.foreground,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Text
              style={[styles.email, { color: theme.colors.text, fontFamily: theme.fonts.regular }]}
            >
              {t.sync.signedInAs}
            </Text>
            <Text
              style={[
                styles.emailValue,
                { color: theme.colors.text, fontFamily: theme.fonts.bold },
              ]}
              numberOfLines={1}
            >
              {user?.email}
            </Text>
            <Pressable
              onPress={async () => {
                setShowPopover(false);
                await signOut();
              }}
              style={[styles.signOutBtn, { backgroundColor: theme.colors.highlight }]}
            >
              <Feather name="log-out" size={14} color={theme.colors.error} />
              <Text
                style={[
                  styles.signOutText,
                  { color: theme.colors.error, fontFamily: theme.fonts.regular },
                ]}
              >
                {t.sync.signOut}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  connectText: {
    fontSize: 14,
  },
  avatarButton: {
    padding: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  initialsCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontSize: 12,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  popover: {
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 300,
    gap: 8,
  },
  email: {
    fontSize: 12,
  },
  emailValue: {
    fontSize: 14,
    marginBottom: 8,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  signOutText: {
    fontSize: 14,
  },
});
