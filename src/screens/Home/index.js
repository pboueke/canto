import React, {useState} from 'react';
import {Linking} from 'react-native';
import styled from 'styled-components/native';
import {Logo} from '../../components/common';
import {Flex, Box} from 'native-grid-styled';
import {metadata} from '../..';
import {CantoThemes} from '../../styles';
import Dictionary from '../../Dictionary';
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

  const [theme, setTheme] = useMMKVStorage('theme', MMKV, {name: 'main'});
  const [lang, setLang] = useMMKVStorage('user-language', MMKV, {name: 'en'});
  const dic = Dictionary(lang.name);

  const goToJournal = (j, k) => {
    navigation.navigate('Journal', {
      journal: j,
      key: k,
      lang: lang.name,
    });
  };

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setAppData(MMKV.getMap('canto'));
    });
    return unsubscribe;
  }, [navigation, setAppData]);

  const journals = appData.journals.map((j, i) => (
    <JournalSelector
      dic={dic}
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
          <InfoBoxText>{dic('Switch theme')}:</InfoBoxText>
          {Object.keys(CantoThemes)
            .filter(t => t !== theme.name)
            .map(t => (
              <ThemeSelector key={t} themeName={t} onPress={setTheme} />
            ))}
          <InfoBoxText>{dic('Change language')}:</InfoBoxText>
          <LanguageRow>
            <LanguageSelector
              name="English"
              onPress={() => setLang({name: 'en'})}
            />
            <LanguageSelector
              name="Português"
              onPress={() => setLang({name: 'pt'})}
            />
          </LanguageRow>
          <InfoBoxText>{dic('About Canto')}:</InfoBoxText>
          <InfoBoxLink
            text={dic('visit our project page')}
            url={metadata.url}
          />
          <Version>{dic('Version') + ': ' + metadata.srcVersion}</Version>
        </InfoBox>
      </Flex>
      <NewJournalSelector dic={dic} save={saveJournal} />
      <Scroll>
        <JournalTable>
          {journals}

          <JournalAccessModal
            dic={dic}
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
  height: 200px;
  justify-content: space-evenly;
`;

const InfoBoxText = styled.Text`
  font-family: ${p => p.theme.font.menu.bold};
  margin: 2px 0 0 0;
  color: ${p => p.theme.textColor};
`;

const LanguageSelector = ({name, onPress}) => {
  const LangWrapper = styled.Pressable`
    background-color: ${p => p.theme.background};
    padding: 5px;
    margin: 2px;
    border-radius: 5px;
  `;
  const LangTitle = styled.Text`
    color: ${p => p.theme.textColor};
    font-family: ${p => p.theme.font.menu.reg};
  `;
  return (
    <LangWrapper onPress={onPress}>
      <LangTitle>{name}</LangTitle>
    </LangWrapper>
  );
};

const LanguageRow = styled.View`
  flex-flow: row wrap;
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
