import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from './src/screens/Home';
import JournalScreen from './src/screens/Journal';
import PageScreen from './src/screens/Page';
import Toast from 'react-native-toast-message';

const Stack = createNativeStackNavigator();

const App = () => {
  console.log(
    '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nCANTO DEBUG\n-------------------------------\n\n\n\n',
  );
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen name="Journal" component={JournalScreen} />
        <Stack.Screen
          name="Page"
          component={PageScreen}
          options={{headerShown: false}}
        />
      </Stack.Navigator>
      <Toast ref={ref => Toast.setRef(ref)} />
    </NavigationContainer>
  );
};

export default App;
