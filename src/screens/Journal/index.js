import React, {useState} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Feather';
import {Keyboard, Text} from 'react-native';
import {Flex} from 'native-grid-styled';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import {PopAction} from '../../components/common';
import {FilterBar} from '../../components/Journal';
import {JournalContent} from '../../models';
import {Page} from '../../models';

var MMKV;

export default ({navigation, route}) => {
  const props = route.params;

  if (!MMKV) {
    if (props.key) {
      MMKV = new MMKVStorage.Loader()
        .withEncryption()
        .encryptWithCustomKey(props.key.join())
        .initialize();
    } else {
      MMKV = new MMKVStorage.Loader().withEncryption().initialize();
    }
  }

  const [journalData, setJournalData] = useMMKVStorage(
    props.journal.id,
    MMKV,
    new JournalContent({cover: props.journal}),
  );

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: journalData.title,
      headerTitle: () => (
        <Flex css={{flexDirection: 'row'}}>
          <HeaderIcon name={journalData.icon} />
          <HeaderTitle>{journalData.title}</HeaderTitle>
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
  }, [navigation, journalData]);

  console.log('JOURNAL');
  console.log(props.journal.id);
  console.log(journalData);

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      <FilterBar
        journal={props.journal}
        onChange={() => console.log('filter change!')}
      />

      <Flex css={{marginTop: '100px'}}>
        <Text>PAGES #: {JSON.stringify(journalData.pages.length)}</Text>
        {journalData.pages.map(x => {
          return <Text key={x.id}>{JSON.stringify(x)}</Text>;
        })}
      </Flex>
      <PopAction
        onPress={() => {
          navigation.navigate('Page', {
            page: new Page({}),
            newPage: true,
            key: props.key,
            parent: props.journal.id,
          });
        }}
      />
    </Container>
  );
};

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
  margin-left: 15px;
`;

const Container = styled.Pressable`
  flex: 1;
  height: 100%;
  width: 100%;
`;
