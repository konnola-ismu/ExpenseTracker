import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '../database/db';

const lightColors = {
  background: '#f8fafc',
  card: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  primary: '#0284c7',
  primaryLight: '#0284c718',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  iconBackground: '#f1f5f9',
  dangerLight: '#fee2e2',
  successLight: '#d1fae5',
  tabBar: '#ffffff',
  tabBarActive: '#0284c7',
  tabBarInactive: '#94a3b8',
  headerBackground: '#ffffff',
  headerText: '#0f172a',
  inputBackground: '#f1f5f9',
};

const darkColors = {
  background: '#0b111a',
  card: '#131b26',
  text: '#f2f2f7',
  textSecondary: '#94a3b8',
  primary: '#38bdf8',
  primaryLight: '#38bdf822',
  border: '#1e293b',
  borderLight: '#1e293b',
  success: '#10b981',
  danger: '#ff453a',
  warning: '#fbbf24',
  iconBackground: '#1e293b',
  dangerLight: '#ff453a33',
  successLight: '#064e3b44',
  tabBar: '#131b26',
  tabBarActive: '#38bdf8',
  tabBarInactive: '#94a3b8',
  headerBackground: '#131b26',
  headerText: '#f2f2f7',
  inputBackground: '#0d131d',
};

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const db = useSQLiteContext();
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState('system'); // 'system' | 'light' | 'dark'
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedMode = await getSetting(db, 'theme_mode');
        if (savedMode === 'system' || savedMode === 'light' || savedMode === 'dark') {
          setThemeMode(savedMode);
        } else {
          const legacyDark = await getSetting(db, 'dark_mode');
          if (legacyDark === 'true') {
            setThemeMode('dark');
          } else if (legacyDark === 'false') {
            setThemeMode('light');
          } else {
            setThemeMode('system');
          }
        }
      } catch (e) {
        console.warn('Failed to load theme preference', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, [db]);

  const setThemeModePreference = useCallback(async (mode) => {
    setThemeMode(mode);
    try {
      await setSetting(db, 'theme_mode', mode);
      const effectiveDark = mode === 'dark' || (mode === 'system' && systemColorScheme === 'dark');
      await setSetting(db, 'dark_mode', effectiveDark ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to save theme preference', e);
    }
  }, [db, systemColorScheme]);

  const isDarkMode = themeMode === 'dark' || (themeMode === 'system' && systemColorScheme === 'dark');

  const toggleDarkMode = useCallback(async () => {
    const newMode = isDarkMode ? 'light' : 'dark';
    await setThemeModePreference(newMode);
  }, [isDarkMode, setThemeModePreference]);

  const colors = isDarkMode ? darkColors : lightColors;

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, themeMode, setThemeModePreference, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

