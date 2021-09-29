import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';

export default ({navigation, route}) => {
  const props = route.params;
  const [dateTime, setDateTime] = useState(new Date(props.page.date));

  console.log(props);
  React.useLayoutEffect(() => {
    const getDate = () => dateTime.toDateString();
    const getTime = () => dateTime.getHours() + ':' + dateTime.getMinutes();
    navigation.setOptions({
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name="calendar" />
          <HeaderTitle>{getDate()}</HeaderTitle>
        </Flex>
      ),
      headerRight: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name="clock" size={18} />
          <HeaderTitle size={18}>{getTime()}</HeaderTitle>
        </Flex>
      ),
    });
  }, [navigation, props, dateTime]);

  return (
    <Container>
      <Scroll />
      <PopAction icon="edit-2" onPress={() => console.log('Action!')} />
    </Container>
  );
};

const HeaderTitle = styled.Text`
  font-size: ${props => props.size ?? 20}px;
  margin: 0 10px 0 10px;
`;

const HeaderIcon = styled(Icon)`
  font-size: ${props => props.size ?? 20}px;
  margin: 4px 0 0 0;
`;

const Container = styled.View`
  flex: 1
  flex-direction: column
  width: 100%;
  height: 100%;
`;

const Scroll = styled.ScrollView.attrs({
  contentContainerStyle: props => {
    return {
      justifyContent: 'center',
    };
  },
})`
  width: 100%;
`;
