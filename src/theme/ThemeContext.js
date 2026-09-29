import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getSetting, setSetting } from '../database/db';

const lightColors = {
  background: '#f2f2f7',
  card: '#ffffff',
  text: '#1c1c1e',
  textSecondary: '#8e8e93',
  primary: '#2f95dc',
  primaryLight: '#2f95dc22',
  border: '#e5e5ea',
  borderLight: '#f0f0f0',
  success: '#34c759',
  danger: '#ff3b30',
  warning: '#ffcc00',
  iconBackground: '#eef',
  dangerLight: '#ffe5e5',
  successLight: '#e5ffe5',
  tabBar: '#ffffff',
  tabBarActive: '#2f95dc',
  tabBarInactive: '#8e8e93',
  headerBackground: '#ffffff',
  headerText: '#1c1c1e',
  inputBackground: '#fafafa',
};

const darkColors = {
  background: '#121212',
  card: '#1e1e1e',
  text: '#f2f2f7',
  textSecondary: '#a1a1aa',
  primary: '#4da3ff',
  primaryLight: '#4da3ff33',
  border: '#333333',
  borderLight: '#2c2c2e',
  success: '#32d74b',
  danger: '#ff453a',
  warning: '#ffd60a',
  iconBackground: '#2c2c2e',
  dangerLight: '#ff453a33',
  successLight: '#32d74b33',
  tabBar: '#1e1e1e',
  tabBarActive: '#4da3ff',
  tabBarInactive: '#a1a1aa',
  headerBackground: '#1e1e1e',
  headerText: '#f2f2f7',
  inputBackground: '#2c2c2e',
};

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const db = useSQLiteContext();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const darkModeSetting = await getSetting(db, 'dark_mode');
        if (darkModeSetting === 'true') {
          setIsDarkMode(true);
        }
      } catch (e) {
        console.warn('Failed to load theme preference', e);
      } finally {
        setIsLoaded(true);
      }
    };
    loadTheme();
  }, [db]);

  const toggleDarkMode = useCallback(async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    try {
      await setSetting(db, 'dark_mode', newValue ? 'true' : 'false');
    } catch (e) {
      console.warn('Failed to save theme preference', e);
    }
  }, [isDarkMode, db]);

  const colors = isDarkMode ? darkColors : lightColors;

  if (!isLoaded) {
    return null; // or a loading spinner
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
