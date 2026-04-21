import { Feather } from '@expo/vector-icons';
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HealthDataProvider, useHealthData } from './src/context/health-data-context';
import { GlobalUiProvider } from './src/context/global-ui-context';
import { SyncProvider } from './src/context/sync-context';
import { HomeScreen } from './src/screens/home-screen';
import { GoalsScreen } from './src/screens/goals-screen';
import { MealsScreen } from './src/screens/meals-screen';
import { WeightsScreen } from './src/screens/weights-screen';
import { WorkoutsScreen } from './src/screens/workouts-screen';
import { fontFamily, palette } from './src/theme';
import { useNavigation } from '@react-navigation/native';
import { pickImageFromLibrary } from './src/utils/media';
import { analyzeImage } from './src/services/ai';


const Tab = createBottomTabNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.canvas,
    primary: palette.mint,
    card: palette.paper,
    border: 'transparent',
    text: palette.ink,
  },
};

type IconName = ComponentProps<typeof Feather>['name'];

const tabIcons: Record<string, IconName> = {
  Home: 'home',
  Meals: 'coffee',
  Workouts: 'zap',
  Weights: 'heart',
  Goals: 'flag',
};

function AppTabs() {
  const { hydrated, store } = useHealthData();
  const navigationRef = React.useRef<any>(null);

  if (!hydrated) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={palette.mintDeep} size="large" />
        <Text style={styles.loadingText}>Loading your health dashboard…</Text>
      </View>
    );
  }

  const handleAddSelect = async (option: string) => {
    if (!navigationRef.current) return;

    if (option === 'meal') {
      navigationRef.current.navigate('Meals', { openComposer: true });
    } else if (option === 'workout') {
      navigationRef.current.navigate('Workouts', { openComposer: true });
    } else if (option === 'weight') {
      navigationRef.current.navigate('Weights', { openComposer: true });
    }
  };

  return (
    <GlobalUiProvider onAddSelect={handleAddSelect}>
      <NavigationContainer theme={navigationTheme} ref={navigationRef}>
        <StatusBar style="dark" />
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: palette.mintDeep,
            tabBarInactiveTintColor: '#889287',
            tabBarStyle: styles.tabBar,
            tabBarLabelStyle: styles.tabBarLabel,
            tabBarIcon: ({ color, size, focused }) => (
              <Feather
                name={tabIcons[route.name]}
                size={focused ? size + 1 : size}
                color={focused ? palette.mintDeep : color}
              />
            ),
          })}
        >
          <Tab.Screen name="Home" component={HomeScreen} />
          <Tab.Screen name="Meals" component={MealsScreen} />
          <Tab.Screen name="Workouts" component={WorkoutsScreen} />
          <Tab.Screen name="Weights" component={WeightsScreen} />
          <Tab.Screen name="Goals" component={GoalsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </GlobalUiProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <HealthDataProvider>
        <SyncProvider>
          <AppTabs />
        </SyncProvider>
      </HealthDataProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: palette.canvas,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: palette.muted,
  },
  tabBar: {
    height: 76,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E3E8E3',
    backgroundColor: 'rgba(255,255,255,0.96)',
    position: 'absolute',
  },
  tabBarLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
  },
});
