import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Logo} from '../../components/common';
import {Flex} from 'native-grid-styled';
import {metadata} from '../..';
import {
  JournalSelector,
  NewJournalSelector,
  JournalAccessModal,
} from '../../components/Home';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';

const MMKV = new MMKVStorage.Loader().withEncryption().initialize();

export default ({navigation, route}) => {
  const [reRender, setReRender] = useState(0);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [accessModalVisible, setAccessModalVisible] = useState(false);
  const [appData, setAppData] = useMMKVStorage('canto', MMKV, {
    initialized: true,
    version: metadata.srcVersion,
    journals: [],
  });
  const goToJournal = (j, k) => {
    navigation.navigate('Journal', {
      journal: j,
      key: k,
    });
  };
  const journals = appData.journals.map((j, i) => (
    <JournalSelector
      key={i}
      onPress={() => {
        setSelectedJournal(j);
        if (j.secure) {
          setAccessModalVisible(!accessModalVisible);
        } else {
          goToJournal(j, null);
        }
      }}
      icon={j.icon}
      title={j.title}
    />
  ));
  const saveJournal = journal => {
    let data = appData;
    data.journals.push(journal);
    setAppData(data);
    setReRender(reRender + 1);
  };

  return (
    <Container>
      <Logo />
      <WelcomeText>
        {' '}
        Welcome to Canto, your Journaling app. Please select one of your
        journals or create a new one:
      </WelcomeText>
      <Scroll>
        <JournalTable>
          {journals}

          <NewJournalSelector save={saveJournal} />

          <JournalAccessModal
            journal={selectedJournal}
            show={accessModalVisible}
            unShow={() => setAccessModalVisible(!accessModalVisible)}
            navigate={goToJournal}
            key={'am' + accessModalVisible}
          />
        </JournalTable>
      </Scroll>
    </Container>
  );
};

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

const Container = styled.View`
  align-items: center;
  justify-content: center;
`;

const WelcomeText = styled.Text`
  font-weight: bold;
  text-align: center;
  font-size: 16px;
  padding: 0 50px 0 50px;
`;

const JournalTable = styled(Flex)`
  margin: 20px 0 0 0;
  width: 100%;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-evenly;
  padding: 0 0 150px 0;
`;
