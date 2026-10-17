import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
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
import { getSetting, setSetting } from './src/database/db';
import * as Application from 'expo-application';
import { version as packageVersion } from './package.json';

const appVersion = Application.nativeApplicationVersion || packageVersion;

import { Modal, TouchableOpacity } from 'react-native';
import { compareVersions } from './src/utils/formatters';

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

function UpdateChecker() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const checkEnabled = await getSetting(db, 'check_updates');
        if (checkEnabled !== 'true') return;

        const lastCheck = await getSetting(db, 'last_update_check_date');
        const today = new Date().toISOString().split('T')[0];
        
        if (lastCheck === today) return;

        const res = await fetch('https://myappsversions-default-rtdb.firebaseio.com/AppVersionManage.json');
        const data = await res.json();
        
        if (data && data.version && compareVersions(data.version, appVersion) > 0) {
          setUpdateInfo(data);
          setModalVisible(true);
        }
        
        await setSetting(db, 'last_update_check_date', today);
      } catch (e) {
        console.log('Update check failed', e);
      }
    };
    checkUpdate();
  }, [db]);

  if (!modalVisible || !updateInfo) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ width: '85%', backgroundColor: colors.card, padding: 22, borderRadius: 16, borderWidth: 1, borderColor: colors.borderLight }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="sparkles" size={24} color="#38bdf8" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text }}>New Version Available!</Text>
          </View>
          <Text style={{ fontSize: 15, marginBottom: 12, color: colors.textSecondary }}>
            A newer release <Text style={{ fontWeight: 'bold', color: colors.primary }}>v{updateInfo.version}</Text> is now available (Current: v{appVersion}).
          </Text>
          {updateInfo.latestChanges && updateInfo.latestChanges.length > 0 && (
            <View style={{ backgroundColor: colors.inputBackground, padding: 12, borderRadius: 10, marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 6, color: colors.text }}>What's New:</Text>
              {updateInfo.latestChanges.map((change, index) => (
                <Text key={index} style={{ marginBottom: 4, color: colors.textSecondary, fontSize: 13 }}>• {change}</Text>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ marginRight: 16, padding: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Remind me later</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setModalVisible(false)} 
              style={{ backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
      <UpdateChecker />
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
