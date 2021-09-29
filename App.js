import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from './src/screens/Home';
import JournalScreen from './src/screens/Journal';
import PageScreen from './src/screens/Page';

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
        <Stack.Screen name="Page" component={PageScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
