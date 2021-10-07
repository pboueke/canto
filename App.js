import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from './src/screens/Home';
import JournalScreen from './src/screens/Journal';
import PageScreen from './src/screens/Page';
import Toast from 'react-native-toast-message';
import {toastConfig} from './src/components/common';
import {ThemeProvider} from 'styled-components/native';
import {CantoThemes} from './src';

const Stack = createNativeStackNavigator();

const App = () => {
  console.log(
    '\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nCANTO DEBUG\n-------------------------------\n\n\n\n',
  );
  const theme = CantoThemes.main;
  return (
    <ThemeProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{headerShown: false}}
          />
          <Stack.Screen
            name="Journal"
            component={JournalScreen}
            options={{
              headerStyle: {
                backgroundColor: theme.headerBg,
                color: theme.textColor,
              },
              headerTintColor: theme.textColor,
            }}
          />
          <Stack.Screen
            name="Page"
            component={PageScreen}
            options={{headerShown: false}}
          />
        </Stack.Navigator>
        <Toast config={toastConfig} ref={ref => Toast.setRef(ref)} />
      </NavigationContainer>
    </ThemeProvider>
  );
};

export default App;
