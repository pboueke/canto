import React, {useState} from 'react';
import styled from 'styled-components/native';
import {Keyboard} from 'react-native';
import {PopAction} from '../../components/common';
import {PageText, PageDate, PageTime} from '../../components/Page';

export default ({navigation, route}) => {
  const props = route.params;

  const [editMode, setEditMode] = useState(props.newPage);
  const [dateTime, setDateTime] = useState(new Date(props.page.date));
  const [text, setText] = useState(props.page.text);

  console.log(props);
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <PageDate editMode={editMode} date={dateTime} onChange={setDateTime} />
      ),
      headerRight: () => (
        <PageTime editMode={editMode} date={dateTime} onChange={setDateTime} />
      ),
    });
  }, [navigation, editMode, dateTime]);

  return (
    <Container onPress={() => Keyboard.dismiss()}>
      <Scroll>
        <PageText value={text} onChange={setText} editMode={editMode} />
      </Scroll>
      <PopAction
        icon={editMode ? 'save' : 'edit-2'}
        onPress={() => console.log('Action!')}
      />
    </Container>
  );
};

const Container = styled.Pressable`
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
