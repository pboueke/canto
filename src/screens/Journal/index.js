import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';

export default ({navigation, route}) => {
  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: route.params.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={route.params.journal.icon} />
          <HeaderTitle>{route.params.journal.title}</HeaderTitle>
        </Flex>
      ),
      headerRight: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderButton onPress={() => console.log('backup')}>
            <Icon name="hard-drive" size={22} />
          </HeaderButton>
          <HeaderButton onPress={() => console.log('settings')}>
            <Icon name="settings" size={22} />
          </HeaderButton>
        </Flex>
      ),
    });
  }, [navigation, route]);

  const [query, setQuery] = useState('');

  return (
    <Container>
      <Flex css={{flexDirection: 'row'}}>
        <FilterIput
          value={query}
          onChange={event => {
            const {eventCount, target, text} = event.nativeEvent;
            setQuery(text);
          }}
        />
      </Flex>
      <PopAction onPress={() => console.log('action!')} />
    </Container>
  );
};

const FilterIput = styled.TextInput`
  height: 40px;
  margin: 10px 10px 30px 10px;
  border-width: 2px;
  border-radius: 5px;
  border-style: solid;
  padding-left: 20px;
  flex-grow: 1;
  background-color: rgb(255, 255, 255);
`;

const HeaderTitle = styled.Text`
  font-size: 24px;
  margin: 0 10px 0 10px;
`;

const HeaderIcon = styled(Icon)`
  margin: 5px 0 0 0;
  font-size: 25px;
`;

const HeaderButton = styled.Pressable`
  background-color: white;
  margin-left: 15;
`;

const Container = styled.View`
  flex: 1;
  height: 100%;
  width: 100%;
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 100%;
  margin: 25px auto;
  background-color: white;
`;
