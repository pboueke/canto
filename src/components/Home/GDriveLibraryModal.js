import React, {useState, useContext} from 'react';
import useStateRef from 'react-usestateref';
import {ActivityIndicator} from 'react-native';
import styled, {ThemeContext} from 'styled-components/native';
import {journalLibrary} from '../../lib/GDriveSync';
import Icon from 'react-native-vector-icons/Feather';

export default ({localJournalsIds, show, unShow, dic}) => {
  const theme = useContext(ThemeContext);
  const [firstLoad, setFirstLoad, firstLoadRef] = useStateRef(true);
  const [lib, setLib] = useState([]);
  const [loading, setLoading] = useState(true);
  if (firstLoadRef.current) {
    setFirstLoad(false);
    journalLibrary().then(lib => {
      setLoading(false);
      setLib(lib);
    });
  }
  return (
    <GDLibraryModal
      animationType="slide"
      transparent={false}
      visible={show}
      onRequestClose={() => {
        unShow();
      }}>
      <Scroll>
        <GDLibraryModalInterior>
          <ModalRow>
            <IconBtn
              name="refresh-ccw"
              onPress={() => {
                setLoading(true);
                setFirstLoad(true);
              }}
            />
            <GDLibraryModalTitle>
              {dic('Your Journals on Google Drive')}
            </GDLibraryModalTitle>
            <IconBtn name="x" onPress={unShow} />
          </ModalRow>
          {loading && (
            <ActivityIndicator
              animating={true}
              size="large"
              color={theme.textColor}
            />
          )}
          {!loading &&
            lib.map(j => {
              const local = localJournalsIds.includes(j.id);
              return (
                <StoredJournal
                  alsoLocal={local}
                  key={j.id}
                  journal={j}
                  onPress={() => !local && console.log('should download...')}
                />
              );
            })}
        </GDLibraryModalInterior>
      </Scroll>
    </GDLibraryModal>
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
  margin: auto;
  background-color: ${p => p.theme.modalBg};
`;

const StoredJournal = ({alsoLocal, onPress, journal}) => {
  const Wrapper = styled.Pressable`
    flex: 1;
    flex-direction: row;
    width: 100%;
    margin: 10px 0 10px 0px;
    padding-top: 15px;
    border-top-width: 1px;
    border-radius: 10px;
    align-items: center;
    background-color: ${p =>
      alsoLocal ? p.theme.modalBg : p.theme.highlightBg};
  `;
  const SJIcon = styled(Icon)`
    font-size: ${p => (p.big ? 50 : 40)}px;
    margin: 0 20px 0 20px;
    color: ${p => p.theme.textColor};
  `;
  const SJData = styled.View`
    flex: 1;
    flex-direction: column;
  `;
  const SJText = styled.Text`
    font-family: ${p => p.theme.font.menu.reg};
    font-size: ${p => (p.title ? 24 : 18)}px;
    color: ${p => p.theme.textColor};
  `;
  return (
    <Wrapper onPress={() => !alsoLocal && onPress()}>
      <SJIcon name={journal.icon} big />
      <SJData>
        <SJText title>{journal.title}</SJText>
        <SJText>{new Date(journal.date).toLocaleDateString()}</SJText>
      </SJData>
      <SJIcon name={alsoLocal ? 'smartphone' : 'download-cloud'} />
    </Wrapper>
  );
};
const GDLibraryModalTitle = styled.Text`
  font-family: ${p => p.theme.font.menu.reg};
  font-size: 30px;
  text-align: center;
  width: 100%;
  margin: 30px 0 30px 0;
  color: ${p => p.theme.textColor};
`;

const GDLibraryModal = styled.Modal`
  text-align: center;
  margin: 10px 0 10px 0;
  align-items: center;
  elevation: 100;
`;

const GDLibraryModalInterior = styled.View`
  flex: 1;
  flex-direction: column;
  background-color: ${p => p.theme.modalBg};
`;

const ModalRow = ({children, border, wrap}) => {
  const Row = styled.View`
    ${p => (p.wrap ? 'flex-wrap: wrap;' : '')};
    width: 100%;
    flex: 1;
    flex-direction: row;
    justify-content: space-between;
    border-bottom-width: ${p => (border ? 1 : 0)}px;
    border-color: ${p => p.theme.borderColor};
    align-items: center;
  `;
  const Item = styled.View`
    flex-shrink: 1;
  `;
  if (!children) {
    return <Row />;
  }
  const chld = children.length ? children : [children];
  return (
    <Row>
      {chld.map((c, i) => (
        <Item key={i}>{c}</Item>
      ))}
    </Row>
  );
};

const IconBtn = ({onPress, name}) => {
  const Wrapper = styled.Pressable`
    height: 40px;
    width: 40px;
    margin: 0 50px 0 20px;
  `;
  const Btn = styled(Icon)`
    font-size: 40px;
    color: ${p => p.theme.textColor};
  `;
  return (
    <Wrapper onPress={onPress}>
      <Btn name={name} />
    </Wrapper>
  );
};
