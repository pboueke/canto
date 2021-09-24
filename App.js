import React from 'react';
import styled from 'styled-components/native';

import {Button, View, Text} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import HomeScreen from './src/screens/Home';

const cantoVersion = '0.1';

const Stack = createNativeStackNavigator();
const MMKV = new MMKVStorage.Loader().withEncryption().initialize();

const App = () => {
  const [appData, setAppData] = useMMKVStorage('canto', MMKV, {
    initialized: true,
    version: cantoVersion,
    journals: [],
  });

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name=" " component={HomeScreen} initialParams={appData} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
