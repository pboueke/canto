import React from 'react';
import styled from 'styled-components/native';
import {withTheme} from 'styled-components';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';

const TagsTable = withTheme(
  ({tags, allTags, onChange, mode = 'in-use', theme, dic}) => {
    let tagsToDisplay = allTags ?? tags;
    let action, color, icon, emptyMessage;
    switch (mode) {
      case 'remove':
        action = tag => onChange(tags.filter(t => t !== tag));
        color = theme.tag.removeBg;
        icon = 'x';
        emptyMessage = dic('no tags selected');
        break;
      case 'add':
        action = tag => onChange(Array.from(new Set(tags).add(tag)));
        color = theme.tag.addBg;
        icon = 'plus';
        emptyMessage = dic('no more tags in use in this journal');
        break;
      case 'in-use':
        action = tag => onChange(tags.filter(t => t !== tag));
        color = theme.tag.inUseBg;
        icon = 'x';
        emptyMessage = dic('no tags in use in this page');
        break;
    }

    return (
      <Flex
        css={{
          flexFlow: 'row wrap',
          flexGrow: 1,
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          marginRight: '10px',
          marginLeft: '10px',
        }}>
        {!tagsToDisplay || tagsToDisplay.length === 0 ? (
          <EmptyTableWarning>{emptyMessage}</EmptyTableWarning>
        ) : (
          tagsToDisplay.map(t => (
            <Tag
              key={t + '-tag'}
              text={t}
              onPress={() => action(t)}
              color={color}
              icon={icon}
            />
          ))
        )}
      </Flex>
    );
  },
);

const TagsRow = withTheme(
  ({
    tags,
    scale = 1,
    justify = 'flex-start',
    align = 'flex-start',
    maxWidth = '100%',
    theme,
  }) => (
    <Flex
      css={{
        justifyContent: justify,
        flexFlow: 'row wrap',
        flexGrow: 1,
        alignSelf: align,
        marginTop: 5,
        marginLeft: 5,
        maxWidth: maxWidth,
      }}>
      {tags.map(t => (
        <Tag
          text={t}
          key={t}
          scale={scale}
          pd="0px 4px 1px 4px"
          color={theme.tag.defaultBg}
        />
      ))}
    </Flex>
  ),
);

const Tag = ({
  text,
  onPress,
  color = 'rgb(200, 200, 200)',
  icon = 'x',
  scale = 1,
  pd = '2px 5px 2px 5px',
}) => {
  const TagRemove = () => (
    <DelButton onPress={onPress}>
      <DelIcon name={icon} size={20 * scale} />
    </DelButton>
  );
  return (
    <TagWrapper color={color} pd={pd}>
      <TagText full={onPress} size={14 * scale} mg={pd}>
        <Hashtag size={14 * scale} mg={pd}>
          #
        </Hashtag>
        {text}
      </TagText>
      {onPress && <TagRemove tag={text} />}
    </TagWrapper>
  );
};

const EmptyTableWarning = styled.Text`
  font-family: ${p => p.theme.font.menu.lght};
  margin-top: -10px;
  width: 100%;
  text-align: center;
  color: ${p => p.theme.textColor};
`;

const TagText = styled.Text`
  font-family: ${p => p.theme.font.menu.bold};
  font-size: ${p => p.size ?? 14}px;
  margin: ${p => p.mg ?? '5px'};
  font-weight: 500;
  max-width: ${p => (p.full ? 90 : 100)}%;
  color: ${p => p.theme.tag.color};
`;

const Hashtag = styled(TagText)`
  font-weight: 300;
  margin-right: 1px;
  letter-spacing: 1px;
  color: ${p => p.theme.tag.color};
`;

const DelButton = styled.Pressable``;

const DelIcon = styled(Icon)`
  color: ${p => p.theme.tag.color};
`;

const TagWrapper = styled.View`
  background-color: ${props => props.color};
  margin: 5px;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border-radius: 20px;
  padding: ${p => p.pd};
`;

export {Tag, TagsTable, TagsRow};
