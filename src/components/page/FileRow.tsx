import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useI18n } from '@/hooks/useI18n';
import type { Attachment } from 'canto-data';

interface FileRowProps {
  files: Attachment[];
  editable: boolean;
  onRemove?: (id: string) => void;
  onOpen?: (file: Attachment) => void;
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileRow({ files, editable, onRemove, onOpen }: FileRowProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const activeFiles = files.filter((f) => !f.deleted);

  if (activeFiles.length === 0) return null;

  return (
    <View style={styles.container}>
      {activeFiles.map((file) => {
        const ext = file.name.split('.').pop()?.toUpperCase() ?? '';
        const sizeStr = formatSize(file.size);

        return (
          <View
            key={file.id}
            style={[
              styles.fileItem,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderWidth: theme.borderWidth,
              },
            ]}
          >
            <Pressable
              onPress={() => onOpen?.(file)}
              style={styles.fileContent}
              accessibilityLabel={`${file.name} ${sizeStr}`}
              accessibilityRole="button"
            >
              <View style={styles.fileIcon}>
                <Feather name="paperclip" size={20} color={theme.colors.textSecondary} />
                {file.encrypted && (
                  <Feather
                    name="lock"
                    size={10}
                    color={theme.colors.primary}
                    style={styles.lockIcon}
                  />
                )}
              </View>
              {ext ? (
                <View style={[styles.extBadge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={[styles.extText, { fontFamily: theme.fonts.bold }]}>{ext}</Text>
                </View>
              ) : null}
              <Text
                style={[
                  styles.fileName,
                  { color: theme.colors.text, fontFamily: theme.fonts.regular },
                ]}
                numberOfLines={2}
              >
                {file.name}
              </Text>
              {sizeStr ? (
                <Text
                  style={[
                    styles.fileSize,
                    { color: theme.colors.textSecondary, fontFamily: theme.fonts.light },
                  ]}
                >
                  {sizeStr}
                </Text>
              ) : null}
            </Pressable>

            {editable && (
              <Pressable
                onPress={() => onRemove?.(file.id)}
                style={[styles.removeButton, { backgroundColor: theme.colors.deleteAction }]}
                accessibilityLabel={t.a11y.deleteFile}
                accessibilityRole="button"
              >
                <Feather name="x" size={12} color="#fff" />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  fileItem: {
    width: 100,
    height: 100,
    borderRadius: 8,
    position: 'relative',
  },
  fileContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  fileIcon: {
    marginBottom: 4,
    position: 'relative',
  },
  lockIcon: {
    position: 'absolute',
    bottom: -2,
    right: -6,
  },
  extBadge: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginBottom: 4,
  },
  extText: {
    fontSize: 9,
    color: '#fff',
  },
  fileName: {
    fontSize: 10,
    textAlign: 'center',
  },
  fileSize: {
    fontSize: 9,
    textAlign: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
