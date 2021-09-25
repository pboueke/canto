import React from 'react';

import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
//import MMKVStorage, {useMMKVStorage} from 'react-native-mmkv-storage';
import HomeScreen from './src/screens/Home';

const cantoVersion = '0.1';

const Stack = createNativeStackNavigator();
/*const MMKV = new MMKVStorage.Loader().withEncryption().initialize();
  const [appData, setAppData] = useMMKVStorage('canto', MMKV, {
    initialized: true,
    version: cantoVersion,
    journals: [],
  });*/

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
