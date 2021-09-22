import React from 'react';
import styled from 'styled-components/native';
import {Header} from './components/main';

const Body = styled.View`
  background-color: rgb(201, 242, 237);
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const App = () => {
  return (
    <Body>
      <Header />
    </Body>
  );
};

export default App;
