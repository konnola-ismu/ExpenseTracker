import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { initDatabase, DATABASE_NAME } from './src/database/db';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

import DashboardScreen from './src/screens/DashboardScreen';
import MastersScreen from './src/screens/MastersScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettlementScreen from './src/screens/SettlementScreen';

// json-render setup
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react-native/schema";
import {
  standardComponentDefinitions,
  standardActionDefinitions,
} from "@json-render/react-native/catalog";
import { defineRegistry, StateProvider, VisibilityProvider, ActionProvider } from "@json-render/react-native";

export const catalog = defineCatalog(schema, {
  components: standardComponentDefinitions,
  actions: standardActionDefinitions,
});

export const { registry } = defineRegistry(catalog, {});

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Masters') {
            iconName = focused ? 'server' : 'server-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.borderLight },
        headerStyle: { backgroundColor: colors.headerBackground },
        headerTintColor: colors.headerText,
        headerShown: true
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Masters" component={MastersScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
    </Tab.Navigator>
  );
}

function AppNavigation() {
  const { isDarkMode, colors } = useTheme();
  
  const navTheme = isDarkMode ? DarkTheme : DefaultTheme;
  const customTheme = {
    ...navTheme,
    colors: {
      ...navTheme.colors,
      background: colors.background,
      card: colors.headerBackground,
      text: colors.headerText,
      border: colors.borderLight,
      primary: colors.primary,
    },
  };

  return (
    <NavigationContainer theme={customTheme}>
      <Stack.Navigator 
        screenOptions={{ 
          headerShown: false,
          headerStyle: { backgroundColor: colors.headerBackground },
          headerTintColor: colors.headerText,
        }}
      >
        <Stack.Screen name="MainTabs" component={TabNavigator} />
        <Stack.Screen 
          name="AddExpense" 
          component={AddExpenseScreen} 
          options={{ headerShown: true, title: 'Add Expense', presentation: 'modal' }}
        />
        <Stack.Screen 
          name="Settlement" 
          component={SettlementScreen} 
          options={{ headerShown: true, title: 'Record Settlement', presentation: 'modal' }}
        />
      </Stack.Navigator>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SQLiteProvider 
      databaseName={DATABASE_NAME} 
      onInit={initDatabase}
      useSuspense={false}
      loadingFallback={
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#02070e' }}>
          <ActivityIndicator size="large" color="#2f95dc" />
          <Text style={{ marginTop: 20, color: '#fff' }}>Initializing MIK HUB DB...</Text>
        </View>
      }
    >
      <ThemeProvider>
        <StateProvider initialState={{}}>
          <VisibilityProvider>
            <ActionProvider handlers={{}}>
              <AppNavigation />
            </ActionProvider>
          </VisibilityProvider>
        </StateProvider>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
