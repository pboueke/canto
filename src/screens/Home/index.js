import React, {useState} from 'react';
import {Linking} from 'react-native';
import styled from 'styled-components/native';
import {Logo} from '../../components/common';
import {Flex, Box} from 'native-grid-styled';
import {metadata} from '../..';
import {CantoThemes} from '../..';
import {
  JournalSelector,
  NewJournalSelector,
  JournalAccessModal,
} from '../../components/Home';
import RNRestart from 'react-native-restart';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';

const MMKV = new MMKVStorage.Loader()
  .withInstanceID(metadata.mmkvInstance)
  .withEncryption()
  .initialize();

export default ({navigation, route}) => {
  const [reRender, setReRender] = useState(0);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [accessModalVisible, setAccessModalVisible] = useState(false);
  const [appData, setAppData] = useMMKVStorage('canto', MMKV, {
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

  const [theme, setTheme] = useMMKVStorage('theme', MMKV, {name: 'main'});

  return (
    <Container>
      <Flex
        css={{
          marginBottom: 15,
          marginTop: 10,
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          width: '100%',
        }}>
        <Box width={2 / 5} css={{alignItems: 'center'}}>
          <Logo />
        </Box>
        <InfoBox width={2 / 5}>
          <InfoBoxText>Switch theme:</InfoBoxText>
          {Object.keys(CantoThemes)
            .filter(t => t !== theme.name)
            .map(t => (
              <ThemeSelector key={t} themeName={t} onPress={setTheme} />
            ))}
          <InfoBoxText>About Canto:</InfoBoxText>
          <InfoBoxLink text="visit our project page" url={metadata.url} />
          <InfoBoxText>Version:</InfoBoxText>
          <Version>{metadata.srcVersion}</Version>
        </InfoBox>
      </Flex>
      <NewJournalSelector save={saveJournal} />
      <Scroll>
        <JournalTable>
          {journals}

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

const InfoBox = styled(Box)`
  align-items: center;
  align-self: center;
  border-color: ${p => p.theme.borderColor};
  border-width: ${p => p.theme.borderWidth};
  border-radius: 5px;
  border-style: solid;
  background-color: ${p => p.theme.highlightBg};
  height: 180px;
  justify-content: space-evenly;
`;

const InfoBoxText = styled.Text`
  font-family: ${p => p.theme.font.menu.bold};
  margin: 2px 0 0 0;
  color: ${p => p.theme.textColor};
`;

const Version = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  color: ${p => p.theme.textColor};
  margin: 0 0 4px 0;
`;

const InfoBoxLink = ({text, url}) => {
  const Link = styled.Pressable`
    border-color: ${p => p.theme.linkColor};
    border-bottom-width: 1px;
  `;
  const Label = styled.Text`
    font-family: ${p => p.theme.font.menu.reg};
    color: ${p => p.theme.linkColor};
  `;
  return (
    <Link
      onPress={() =>
        Linking.openURL(url).catch(err =>
          console.error('An error occurred', err),
        )
      }>
      <Label>{text}</Label>
    </Link>
  );
};

const ThemeSelector = ({themeName, onPress}) => {
  const ThemePressable = styled.Pressable`
    background-color: ${p => p.theme.foreground};
    border-color: ${p => p.theme.borderColor};
    border-width: ${p => p.theme.borderWidth};
    border-radius: 5px;
    border-style: solid;
    padding: 5px;
    margin: 2px;
  `;
  const ThemeText = styled.Text`
    font-family: ${p => p.theme.font.menu.reg};
    color: ${p => p.theme.textColor};
  `;
  return (
    <ThemePressable
      theme={CantoThemes[themeName]}
      onPress={() => {
        onPress({name: themeName});
        RNRestart.Restart();
      }}>
      <ThemeText theme={CantoThemes[themeName]}>
        {CantoThemes[themeName].displayName}
      </ThemeText>
    </ThemePressable>
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
  margin: 25px 0 0 0;
  background-color: ${p => p.theme.tableBg};
`;

const Container = styled.View`
  align-items: center;
  justify-content: center;
  margin-bottom: 0;
  background-color: ${p => p.theme.foreground};
  height: 100%;
`;

const JournalTable = styled(Flex)`
  margin: 20px 0 0 0;
  width: 100%;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-evenly;
  padding: 0 0 150px 0;
`;
