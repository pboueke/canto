import React from 'react';
import styled from 'styled-components/native';
import {SafeAreaView, FlatList} from 'react-native';
import {Flex} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';
import Markdown from 'react-native-markdown-display';
import {getTime, getDate} from '../../lib';
import {TagsRow} from '../common';

export default props => {
  const renderItem = (i, last) => (
    <Item
      onPress={() => props.onClick(i.item)}
      date={i.item.date}
      text={i.item.text}
      tags={i.item.tags}
      isLast={i.index === last}
    />
  );
  return (
    <Container>
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
  margin-top: 75px;
`;

const Item = props => {
  const date = getDate(props.date);
  let tmpText = props.text.split('\n')[0];
  const text =
    tmpText.length > 200 ? tmpText.substring(0, 200) + '...' : tmpText;
  const time = getTime(props.date);
  return (
    <ItemBackground isLast={props.isLast} onPress={props.onPress}>
      <Flex css={{flexDirection: 'row', flex: 1}}>
        <ItemThumbnail />
        <Flex css={{flexDirection: 'column'}}>
          <Flex css={{flexDirection: 'row'}}>
            <ItemDate>{date}</ItemDate>
            <ItemTime>{time}</ItemTime>
          </Flex>
          {props.tags && props.tags.length > 0 && (
            <TagsRow tags={props.tags} scale={0.75} />
          )}
          <ItemText>
            <Markdown
              style={{
                body: {fontSize: 12},
                heading1: {color: 'purple'},
                code_block: {color: 'black', fontSize: 14},
              }}>
              {text}
            </Markdown>
          </ItemText>
        </Flex>
      </Flex>
    </ItemBackground>
  );
};

const ItemBackground = styled.Pressable`
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  flex: 1;
  flex-direction: row;
  background-color: white;
  margin: ${props => (props.isLast ? '5px 5px 100px 5px' : '5px')};
`;

const ItemThumbnail = props => {
  const Nail = () => <Icon name="edit-3" size={40} />;
  const Thumb = styled.View`
    height: 100%;
    width: 80px;
    align-items: center;
    justify-content: center;
  `;
  return (
    <Thumb>
      <Nail />
    </Thumb>
  );
};

const ItemDate = styled.Text`
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 5px 0 0 0;
`;

const ItemTime = styled.Text`
  font-size: 16px;
  margin: 6px 0 0 100px;
`;

const ItemText = styled.View`
  flex-grow: 1;
  width: 310px;
`;
