import React from 'react';
import styled from 'styled-components/native';
import {SafeAreaView, FlatList} from 'react-native';
import {Flex} from 'native-grid-styled';
import Icon from 'react-native-vector-icons/Feather';
import Markdown from 'react-native-markdown-display';
import {getTime, getDate} from '../../lib';

export default props => {
  const renderItem = i => (
    <Item
      onPress={() => props.onClick(i.item)}
      date={i.item.date}
      text={i.item.text}
    />
  );
  return (
    <Container>
      <FlatList
        data={props.data}
        renderItem={renderItem}
        keyExtractor={item => item.id}
      />
    </Container>
  );
};

const Container = styled(SafeAreaView)`
  flex: 1;
  margin-top: 70px;
`;

const Item = props => {
  const date = getDate(props.date);
  const text =
    props.text.length > 200 ? props.text.substring(0, 200) + '...' : props.text;
  const time = getTime(props.date);
  return (
    <ItemBackground onPress={props.onPress}>
      <Flex css={{flexDirection: 'row', flex: 1}}>
        <ItemThumbnail />
        <Flex css={{flexDirection: 'column'}}>
          <Flex css={{flexDirection: 'row'}}>
            <ItemDate>{date}</ItemDate>
            <ItemTime>{time}</ItemTime>
          </Flex>
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
  margin: 5px;
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
