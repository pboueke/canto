import React from 'react';
import styled from 'styled-components/native';
import {Logo} from '../../components/common';
import {Flex, Box} from 'native-grid-styled';
import {ScrollView, StyleSheet} from 'react-native';
import {JournalSelector, NewJournalSelector} from '../../components/Home';

export default ({navigation, route}) => {
  const journals = route.params.journals.map(j => (
    <JournalSelector title={j.title} />
  ));
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

          <JournalSelector title="Diário" />
          <JournalSelector title="Sonhos" />

          <NewJournalSelector />
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
