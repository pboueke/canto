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
import {NativeModules} from 'react-native';
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
      <WelcomeText>
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
  margin: 2px 0 0 0;
  color: ${p => p.theme.textColor};
  font-weight: 700;
`;

const Version = styled.Text`
  color: ${p => p.theme.textColor};
  font-weight: 300;
  margin: 0 0 4px 0;
`;

const InfoBoxLink = ({text, url}) => {
  const Link = styled.Pressable`
    border-color: ${p => p.theme.linkColor};
    border-bottom-width: 1px;
  `;
  const Label = styled.Text`
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
    color: ${p => p.theme.textColor};
  `;
  return (
    <ThemePressable
      theme={CantoThemes[themeName]}
      onPress={() => {
        onPress({name: themeName});
        NativeModules.DevSettings.reload();
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
  margin: 25px auto;
  background-color: ${p => p.theme.tableBg};
`;

const Container = styled.View`
  align-items: center;
  justify-content: center;
  background-color: ${p => p.theme.foreground};
`;

const WelcomeText = styled.Text`
  font-weight: bold;
  text-align: center;
  font-size: 16px;
  padding: 0 0px 0 0px;
  color: ${p => p.theme.textColor};
`;

const JournalTable = styled(Flex)`
  margin: 20px 0 0 0;
  width: 100%;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-evenly;
  padding: 0 0 150px 0;
`;
