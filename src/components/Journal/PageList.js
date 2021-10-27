import React from 'react';
import styled from 'styled-components/native';
import {SafeAreaView, FlatList} from 'react-native';
import {Flex} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';
import {getTime, getDate} from '../../lib';
import {TagsRow, ThemedMarkdown} from '../common';
import {JournalSettings} from '../../models';

export default props => {
  const renderItem = (i, last) => (
    <Item
      settings={props.settings}
      onPress={() => props.onClick(i.item)}
      date={i.item.date}
      text={i.item.text}
      tags={i.item.tags}
      loc={i.item.location}
      thumb={i.item.thumbnail}
      img={i.item.numberOfImages > 0}
      file={i.item.numberOfFiles > 0}
      cmt={i.item.numberOfComment > 0}
      isLast={i.index === last}
    />
  );
  return (
    <Container filterVisible={props.settings.filterBar}>
      <FlatList
        data={props.data}
        renderItem={item => renderItem(item, props.data.length - 1)}
        keyExtractor={item => item.id}
      />
    </Container>
  );
};

const Container = styled(SafeAreaView)`
  flex: 1;
  margin-top: ${p => (p.filterVisible ? 75 : 0)}px;
  background-color: ${p => p.theme.tableBg};
`;

const Item = props => {
  const settings = props.settings ?? new JournalSettings();
  const date = getDate(props.date);
  let tmpText = props.text.split('\n')[0];
  const text =
    tmpText.length > 200 ? tmpText.substring(0, 200) + '...' : tmpText;
  const time = getTime(props.date, settings.use24h);
  return (
    <ItemBackground isLast={props.isLast} onPress={props.onPress}>
      <Flex css={{flexDirection: 'row', flex: 1}}>
        <Flex css={{flexDirection: 'column', flexGrow: 1}}>
          <ItemTitle>
            <ItemDate>{date}</ItemDate>
            {props.file && settings.previewIcons && (
              <ItemFile name="paperclip" />
            )}
            {props.img && settings.previewIcons && <ItemImage name="image" />}
            {props.loc && settings.previewIcons && (
              <ItemLocation name="map-pin" />
            )}
            <ItemTime small={!settings.use24h}>{time}</ItemTime>
          </ItemTitle>
          {settings.previewTags && (
            <TagsRow
              tags={props.tags}
              scale={0.75}
              maxWidth={props.thumb ? '295px' : '100%'}
            />
          )}
          <ItemText maxWidth={props.thumb ? '295px' : '100%'}>
            <ThemedMarkdown>{text + '&nbsp;'}</ThemedMarkdown>
          </ItemText>
        </Flex>
        <ItemThumbnail
          image={props.thumb}
          enabled={settings.previewThumbnail}
        />
      </Flex>
    </ItemBackground>
  );
};

const ItemBackground = styled.Pressable`
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  border-color: ${p => p.theme.borderColor};
  flex: 1;
  flex-direction: row;
  background-color: white;
  margin: ${props => (props.isLast ? '5px 5px 100px 5px' : '5px 5px 10px 5px')};
  background-color: ${p => p.theme.foreground};
`;

const Thumb = styled.View`
  height: 100%;
  width: 100px;
  align-items: center;
  justify-content: center;
`;

const ThumbnailImage = styled.Image`
  width: 80px;
  height: 80px;
  border-radius: 20px;
  margin: 10px 2px 10px 2px;
`;

const ItemThumbnail = props => {
  if (!props.image || !props.enabled) {
    return null;
  }
  return (
    <Thumb>
      <ThumbnailImage source={{uri: props.image}} />
    </Thumb>
  );
};

const ItemTitle = styled.View`
  flex: 1;
  width: 100%;
  flex-direction: row;
  height: 33px;
  border-bottom-width: 1px;
  border-color: ${p => p.theme.borderColor};
`;

const ItemDate = styled.Text`
  font-family: ${p => p.theme.font.menu.bold};
  font-size: 16px;
  letter-spacing: 2px;
  margin: 5px 0 0 10px;
  color: ${p => p.theme.textColor};
`;

const ItemTime = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  font-size: ${p => (p.small ? 12 : 16)}px;
  margin: 6px 0 0 100px;
  position: absolute;
  right: ${p => (p.small ? 6 : 8)}px;
  top: ${p => (p.small ? 4 : 0)}px;
  color: ${p => p.theme.textColor};
`;

const ItemTitleIcon = styled(Icon)`
  position: absolute
  font-size: 12px;
  top: 11px;
  color: ${p => p.theme.textColor};
`;

const ItemLocation = styled(ItemTitleIcon)`
  left: 193px;
`;

const ItemImage = styled(ItemTitleIcon)`
  left: 210px;
`;

const ItemFile = styled(ItemTitleIcon)`
  left: 227px;
`;

const ItemText = styled.View`
  max-width: ${p => p.maxWidth};
  flex-grow: 1;
  margin: 0 0 0 10px;
  color: ${p => p.theme.textColor};
`;
