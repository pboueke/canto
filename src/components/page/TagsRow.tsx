import { StyleSheet, View } from 'react-native';
import { Tag } from '@/components/common/Tag';

interface TagsRowProps {
  tags: string[];
}

export function TagsRow({ tags }: TagsRowProps) {
  if (tags.length === 0) return null;

  return (
    <View style={styles.container}>
      {tags.map((tag) => (
        <Tag key={tag} label={tag} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 8,
    width: '90%',
    alignSelf: 'center',
  },
});
