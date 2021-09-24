import React from 'react';
import styled from 'styled-components/native';

import {Button, View, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from './src/screens/Home';

const Body = styled.View`
  background-color: rgb(201, 242, 237);
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name=" " component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
