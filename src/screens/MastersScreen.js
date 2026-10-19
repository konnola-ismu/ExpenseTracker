import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, Modal, Linking, Switch, ActivityIndicator, Image } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { 
  addOrUpdateMember, getAllMembers, 
  addOrUpdateShop, getAllShops, 
  addOrUpdateMasterItem, getAllMasterItems,
  addOrUpdateCurrency, getAllCurrencies,
  updateMaster, deleteMaster,
  getDefaultCurrency, setDefaultCurrency,
  getSetting, setSetting, DATABASE_NAME
} from '../database/db';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { formatDate, formatAmount, getCurrencyDecimals, compareVersions } from '../utils/formatters';
import { useTheme } from '../theme/ThemeContext';
import * as Application from 'expo-application';
import { version as packageVersion } from '../../package.json';

const appVersion = Application.nativeApplicationVersion || packageVersion;


export default function MastersScreen() {
  const db = useSQLiteContext();
  const { isDarkMode, toggleDarkMode, themeMode, setThemeModePreference, colors } = useTheme();
  const styles = getStyles(colors, isDarkMode);
  
  const [members, setMembers] = useState([]);
  const [shops, setShops] = useState([]);
  const [items, setItems] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [defaultCurrency, setDefaultCurrencyState] = useState('');
  const [appLogo, setAppLogo] = useState(null);
  const [showAddress, setShowAddress] = useState(false);
  const [appAddress, setAppAddress] = useState('');
  const [checkUpdates, setCheckUpdates] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('upToDate'); // 'upToDate' | 'available'
  const [availableVersion, setAvailableVersion] = useState(null);
  const DEFAULT_LOGO = Image.resolveAssetSource(require('../../assets/mik_hub_logo.png')).uri;

  // Add inputs
  const [newMember, setNewMember] = useState('');
  const [newShop, setNewShop] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newCurrency, setNewCurrency] = useState('');
  const [newCurrencyDecimals, setNewCurrencyDecimals] = useState('2');

  // Edit Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // { id, type, name, price }
  const [editNameValue, setEditNameValue] = useState('');
  const [editPriceValue, setEditPriceValue] = useState('');
  const [selectedMaster, setSelectedMaster] = useState(null); // 'member', 'item', 'shop', 'currency'

  const loadData = useCallback(async () => {
    try {
      const [m, s, i, c, defCurr, logo, showAddr, addr, checkUpdatesSetting] = await Promise.all([
        getAllMembers(db),
        getAllShops(db),
        getAllMasterItems(db),
        getAllCurrencies(db),
        getDefaultCurrency(db),
        getSetting(db, 'app_logo'),
        getSetting(db, 'show_address'),
        getSetting(db, 'app_address'),
        getSetting(db, 'check_updates')
      ]);
      setMembers(m);
      setShops(s);
      setItems(i);
      setCurrencies(c);
      setDefaultCurrencyState(defCurr);
      setAppLogo(logo);
      setShowAddress(showAddr === 'true');
      setAppAddress(addr || '');
      setCheckUpdates(checkUpdatesSetting === 'true');
    } catch (e) {
      console.log('Error loading masters:', e);
    }
  }, [db]);

  const toggleCheckUpdates = async (value) => {
    setCheckUpdates(value);
    await setSetting(db, 'check_updates', value ? 'true' : 'false');
  };

  const handleCheckUpdateNow = async () => {
    try {
      setCheckingUpdate(true);
      const res = await fetch('https://myappsversions-default-rtdb.firebaseio.com/AppVersionManage/expense_tracker.json');
      const rawData = await res.json();
      const data = rawData?.expense_tracker || rawData;
      
      if (data && data.version) {
        const isNewer = compareVersions(data.version, appVersion) > 0;
        if (isNewer) {
          setUpdateStatus('available');
          setAvailableVersion(data.version);
          const changes = data.latestChanges && data.latestChanges.length 
            ? `\n\nWhat's New:\n${data.latestChanges.map(c => `• ${c}`).join('\n')}` 
            : '';
          Alert.alert(
            'New Version Available!',
            `Version ${data.version} is now available (Current: v${appVersion}).${changes}`,
            [{ text: 'OK' }]
          );
        } else {
          setUpdateStatus('upToDate');
          Alert.alert(
            'Up to Date',
            `Expense Tracker is up to date (v${appVersion}).`,
            [{ text: 'OK' }]
          );
        }
      } else {
        setUpdateStatus('upToDate');
        Alert.alert('Up to Date', `You are running the latest version (v${appVersion}).`);
      }
    } catch (e) {
      console.log('Update check error:', e);
      Alert.alert('Check Failed', 'Could not check for updates. Please check your internet connection.');
    } finally {
      setCheckingUpdate(false);
    }
  };


  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );



  const handleAdd = async (type) => {
    try {
      const date = new Date().toISOString();
      if (type === 'member' && newMember.trim() !== '') {
        const name = newMember.trim();
        if (name.toLowerCase() === 'all') {
          Alert.alert('Error', '"All" is a reserved keyword and cannot be used as a member name.');
          return;
        }
        if (members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
          Alert.alert('Member Exists', `"${name}" is already in your members list.`);
          return;
        }
        await addOrUpdateMember(db, name, date);
        setNewMember('');
      } else if (type === 'shop' && newShop.trim() !== '') {
        const name = newShop.trim();
        if (shops.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          Alert.alert('Shop Exists', `"${name}" is already in your shops list.`);
          return;
        }
        await addOrUpdateShop(db, name, date);
        setNewShop('');
      } else if (type === 'item' && newItemName.trim() !== '') {
        const name = newItemName.trim();
        if (items.some(i => i.name.toLowerCase() === name.toLowerCase())) {
          Alert.alert('Item Exists', `"${name}" is already in your items list.`);
          return;
        }
        const p = parseFloat(newItemPrice) || 0;
        await addOrUpdateMasterItem(db, name, p, date);
        setNewItemName('');
        setNewItemPrice('');
      } else if (type === 'currency' && newCurrency.trim() !== '') {
        const code = newCurrency.trim().toUpperCase();
        const decimals = parseInt(newCurrencyDecimals) || 2;
        if (currencies.some(c => c.code.toUpperCase() === code)) {
          Alert.alert('Currency Exists', `"${code}" is already in your currency list.`);
          return;
        }
        await addOrUpdateCurrency(db, code, decimals, date);
        setNewCurrency('');
        setNewCurrencyDecimals('2');
      }
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Could not save master data.');
    }
  };

  const openEditModal = (type, item) => {
    setEditingItem({ id: item.id, type });
    setEditNameValue(type === 'currency' ? item.code : item.name);
    if (type === 'item') {
      setEditPriceValue(item.default_price ? item.default_price.toString() : '0');
    } else if (type === 'currency') {
      setEditPriceValue(item.decimals ? item.decimals.toString() : '2');
    } else {
      setEditPriceValue('');
    }
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editNameValue.trim()) return;
    try {
      if (editingItem.type === 'member' && editNameValue.trim().toLowerCase() === 'all') {
        Alert.alert('Error', '"All" is a reserved keyword and cannot be used as a member name.');
        return;
      }
      const p = parseFloat(editPriceValue) || 0;
      await updateMaster(db, editingItem.type, editingItem.id, editNameValue.trim(), p);
      setEditModalVisible(false);
      loadData();
    } catch (e) {
      Alert.alert('Error', 'Failed to update. Name might already exist.');
    }
  };

  const handleDelete = async (type, id) => {
    Alert.alert('Confirm Delete', 'Are you sure you want to remove this?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await deleteMaster(db, type, id);
            loadData();
          } catch (e) {
            Alert.alert('Cannot Delete', e.message);
          }
        }
      }
    ]);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'We need camera roll permissions to set a logo.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      // Use base64 if possible to avoid local URI expiration or accessibility issues in PDF
      const base64Data = `data:image/png;base64,${result.assets[0].base64}`;
      await setSetting(db, 'app_logo', base64Data);
      setAppLogo(base64Data);
      Alert.alert('Success', 'Logo updated successfully');
    }
  };

  const removeLogo = async () => {
    await setSetting(db, 'app_logo', null);
    setAppLogo(null);
    Alert.alert('Success', 'Logo removed');
  };

  const toggleAddress = async (value) => {
    setShowAddress(value);
    await setSetting(db, 'show_address', value ? 'true' : 'false');
  };

  const saveAddress = async (text) => {
    setAppAddress(text);
    await setSetting(db, 'app_address', text);
  };

  const handleBackup = async () => {
    try {
      const dbDir = FileSystem.documentDirectory + 'SQLite';
      const dbPath = dbDir + '/' + DATABASE_NAME;
      
      const fileInfo = await FileSystem.getInfoAsync(dbPath);
      if (!fileInfo.exists) {
        Alert.alert('Error', 'Database file not found.');
        return;
      }
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dbPath, {
          mimeType: 'application/x-sqlite3',
          dialogTitle: 'Backup Expense Tracker Database',
          UTI: 'public.database'
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Backup Failed', e.message);
    }
  };

  const handleRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return; 
      }

      const file = result.assets[0];
      
      if (!file.name.endsWith('.db')) {
        Alert.alert('Invalid File', 'Please select a valid .db file');
        return;
      }

      Alert.alert(
        'Restore Database',
        'Are you sure you want to restore this database? This will overwrite all your current data and cannot be undone. The app must be restarted after restoration.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: 'destructive',
            onPress: async () => {
              try {
                const dbDir = FileSystem.documentDirectory + 'SQLite';
                const destPath = dbDir + '/' + DATABASE_NAME;
                
                await FileSystem.copyAsync({
                  from: file.uri,
                  to: destPath,
                });
                
                Alert.alert(
                  'Restore Successful',
                  'The database has been restored. Please completely close and reopen the app for changes to take effect.',
                  [{ text: 'OK' }] 
                );
              } catch (err) {
                console.error(err);
                Alert.alert('Restore Failed', err.message);
              }
            }
          }
        ]
      );
    } catch (e) {
      console.error(e);
      Alert.alert('Restore Failed', e.message);
    }
  };

  const renderListItem = (type, item) => {
    const isItem = type === 'item';
    const isCurrency = type === 'currency';
    const name = isCurrency ? item.code : item.name;
    const subtitle = isItem ? `Default Price: ${formatAmount(item.default_price, defaultCurrency, currencies)}` : (isCurrency ? `Decimals: ${item.decimals ?? 2}` : null);

    return (
      <View key={item.id} style={styles.listItem}>
        <View style={styles.listTextContainer}>
          <Text style={styles.listName}>{name}</Text>
          {subtitle && <Text style={styles.listSubtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.actionButtons}>
          {isCurrency && (
            <TouchableOpacity 
              style={[styles.iconBtn, { backgroundColor: defaultCurrency === item.code ? colors.primaryLight : colors.iconBackground }]} 
              onPress={async () => {
                await setDefaultCurrency(db, item.code);
                setDefaultCurrencyState(item.code);
                Alert.alert('Success', `${item.code} set as default currency`);
              }}
            >
              <Ionicons 
                name={defaultCurrency === item.code ? 'checkmark-circle' : 'star-outline'} 
                size={20} 
                color={defaultCurrency === item.code ? '#2f95dc' : '#888'} 
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={() => openEditModal(type, item)}>
            <Ionicons name="pencil" size={20} color="#0050b3" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(type, item.id)}>
            <Ionicons name="trash" size={20} color="#ff3b30" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSection = (title, icon, type, data, inputsComponent) => (
    <View style={styles.masterDetailContainer}>
      <View style={styles.detailHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedMaster(null)}>
          <Ionicons name="arrow-back" size={24} color="#2f95dc" />
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.detailTitle}>{title}</Text>
        <Ionicons name={icon} size={24} color={colors.primary} style={{ opacity: 0.5 }} />
      </View>
      
      <View style={styles.sectionCard}>
        {inputsComponent}

        <View style={styles.listContainer}>
          {data.map(item => renderListItem(type, item))}
          {data.length === 0 && <Text style={styles.emptyText}>No {title.toLowerCase()} found.</Text>}
        </View>
      </View>
    </View>
  );

  const renderIconGrid = () => (
    <View style={styles.gridContainer}>
      {[
        { id: 'member', title: 'Members', icon: 'people', color: '#5856d6' },
        { id: 'item', title: 'Items', icon: 'cart', color: '#ff9500' },
        { id: 'shop', title: 'Shops', icon: 'storefront', color: '#ff2d55' },
        { id: 'currency', title: 'Currencies', icon: 'cash', color: '#34c759' },
        { id: 'logo', title: 'App Settings', icon: 'settings', color: '#af52de' },
        { id: 'info', title: 'App Info', icon: 'information-circle', color: '#5856d6' },
      ].map(item => (
        <TouchableOpacity 
          key={item.id} 
          style={styles.gridItem} 
          onPress={() => setSelectedMaster(item.id)}
        >
          <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
            <Ionicons name={item.icon} size={32} color="#fff" />
          </View>
          <Text style={styles.gridLabel}>{item.title}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={!selectedMaster && { flex: 1, justifyContent: 'center' }}>
        
        {!selectedMaster ? (
          renderIconGrid()
        ) : (
          <>
            {selectedMaster === 'member' && renderSection(
              'Members', 'people', 'member', members,
              <View style={styles.inputRow}>
                <TextInput style={styles.input} value={newMember} onChangeText={setNewMember} placeholder="Enter member name" />
                <TouchableOpacity style={styles.addButton} onPress={() => handleAdd('member')}>
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedMaster === 'item' && renderSection(
              'Master Items', 'cart', 'item', items,
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 2, marginRight: 8 }]} value={newItemName} onChangeText={setNewItemName} placeholder="Item name" />
                <TextInput style={[styles.input, { flex: 1 }]} value={newItemPrice} onChangeText={setNewItemPrice} placeholder="Price" keyboardType="numeric" />
                <TouchableOpacity style={styles.addButton} onPress={() => handleAdd('item')}>
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedMaster === 'shop' && renderSection(
              'Shop Names', 'storefront', 'shop', shops,
              <View style={styles.inputRow}>
                <TextInput style={styles.input} value={newShop} onChangeText={setNewShop} placeholder="Enter shop or vendor name" />
                <TouchableOpacity style={styles.addButton} onPress={() => handleAdd('shop')}>
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedMaster === 'currency' && renderSection(
              'Currencies', 'cash', 'currency', currencies,
              <View style={styles.inputRow}>
                <TextInput style={[styles.input, { flex: 2, marginRight: 8 }]} value={newCurrency} onChangeText={setNewCurrency} placeholder="e.g. OMR, INR" autoCapitalize="characters" maxLength={5} />
                <TextInput style={[styles.input, { flex: 1 }]} value={newCurrencyDecimals} onChangeText={setNewCurrencyDecimals} placeholder="Dec" keyboardType="numeric" maxLength={1} />
                <TouchableOpacity style={styles.addButton} onPress={() => handleAdd('currency')}>
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {selectedMaster === 'logo' && (
              <View style={styles.masterDetailContainer}>
                <View style={styles.detailHeader}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedMaster(null)}>
                    <Ionicons name="arrow-back" size={24} color="#2f95dc" />
                    <Text style={styles.backBtnText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.detailTitle}>App Settings</Text>
                  <Ionicons name="settings" size={24} color={colors.primary} style={{ opacity: 0.5 }} />
                </View>

                {/* Section: APPEARANCE */}
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="color-palette" size={18} color="#38bdf8" />
                  <Text style={styles.sectionHeaderText}>APPEARANCE</Text>
                </View>

                <View style={styles.modernCard}>
                  <View style={styles.modernCardRow}>
                    <View style={styles.cardIconBox}>
                      <Ionicons name="moon" size={22} color="#fbbf24" />
                    </View>
                    <View style={styles.cardTextCol}>
                      <Text style={styles.modernCardTitle}>Dark Theme</Text>
                      <Text style={styles.modernCardSubtitle}>
                        {isDarkMode ? 'Dark mode is currently enabled' : 'Dark mode is currently disabled'}
                      </Text>
                    </View>
                    <Switch
                      value={isDarkMode}
                      onValueChange={toggleDarkMode}
                      trackColor={{ false: isDarkMode ? '#334155' : '#cbd5e1', true: '#38bdf8' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor={isDarkMode ? '#334155' : '#cbd5e1'}
                    />
                  </View>

                  <View style={styles.modernDivider} />

                  <Text style={styles.preferenceLabel}>Theme Mode Preference</Text>
                  <View style={styles.segmentedContainer}>
                    <TouchableOpacity
                      style={[
                        styles.segmentTab,
                        themeMode === 'system' && styles.segmentTabActive
                      ]}
                      onPress={() => setThemeModePreference('system')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="phone-portrait-outline"
                        size={17}
                        color={themeMode === 'system' ? (isDarkMode ? '#38bdf8' : '#0284c7') : '#64748b'}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          themeMode === 'system' && styles.segmentTextActive
                        ]}
                      >
                        System
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.segmentTab,
                        themeMode === 'light' && styles.segmentTabActive
                      ]}
                      onPress={() => setThemeModePreference('light')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="sunny-outline"
                        size={17}
                        color={themeMode === 'light' ? (isDarkMode ? '#38bdf8' : '#0284c7') : '#64748b'}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          themeMode === 'light' && styles.segmentTextActive
                        ]}
                      >
                        Light
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.segmentTab,
                        themeMode === 'dark' && styles.segmentTabActive
                      ]}
                      onPress={() => setThemeModePreference('dark')}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name="moon"
                        size={17}
                        color={themeMode === 'dark' ? (isDarkMode ? '#38bdf8' : '#0284c7') : '#64748b'}
                      />
                      <Text
                        style={[
                          styles.segmentText,
                          themeMode === 'dark' && styles.segmentTextActive
                        ]}
                      >
                        Dark
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Section: APP UPDATES */}
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="notifications" size={18} color="#38bdf8" />
                  <Text style={styles.sectionHeaderText}>APP UPDATES</Text>
                </View>

                <View style={styles.modernCard}>
                  <View style={styles.modernCardRow}>
                    <View style={styles.cardIconBox}>
                      <Ionicons name="cloud-download-outline" size={24} color="#38bdf8" />
                    </View>
                    <View style={styles.cardTextCol}>
                      <Text style={styles.modernCardTitle}>Notify App Updates</Text>
                      <Text style={styles.modernCardSubtitle}>
                        Check internet & notify when a newer version is released
                      </Text>
                    </View>
                    <Switch
                      value={checkUpdates}
                      onValueChange={toggleCheckUpdates}
                      trackColor={{ false: isDarkMode ? '#334155' : '#cbd5e1', true: '#38bdf8' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor={isDarkMode ? '#334155' : '#cbd5e1'}
                    />
                  </View>

                  <View style={styles.modernDivider} />

                  <View style={styles.updateBottomRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.installedVersionText}>Installed: v{appVersion}</Text>
                      <View style={[
                        styles.statusBadge,
                        updateStatus === 'available' ? styles.statusBadgeAvailable : styles.statusBadgeUpToDate
                      ]}>
                        <Ionicons
                          name={updateStatus === 'available' ? 'arrow-up-circle' : 'checkmark-circle'}
                          size={15}
                          color={updateStatus === 'available' ? '#f59e0b' : '#10b981'}
                          style={{ marginRight: 5 }}
                        />
                        <Text style={[
                          styles.statusBadgeText,
                          updateStatus === 'available' ? styles.statusBadgeTextAvailable : styles.statusBadgeTextUpToDate
                        ]}>
                          {updateStatus === 'available' ? `Update: v${availableVersion}` : 'Up to Date'}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.checkNowBtn}
                      onPress={handleCheckUpdateNow}
                      disabled={checkingUpdate}
                      activeOpacity={0.7}
                    >
                      {checkingUpdate ? (
                        <ActivityIndicator size="small" color={isDarkMode ? '#ffffff' : '#0f172a'} style={{ marginRight: 6 }} />
                      ) : (
                        <Ionicons name="sync" size={16} color={isDarkMode ? '#ffffff' : '#0f172a'} style={{ marginRight: 6 }} />
                      )}
                      <Text style={styles.checkNowBtnText}>
                        {checkingUpdate ? 'Checking...' : 'Check Now'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Section: APPLICATION LOGO & ADDRESS */}
                <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
                  <Ionicons name="images" size={18} color="#38bdf8" />
                  <Text style={styles.sectionHeaderText}>APPLICATION LOGO & REPORTS</Text>
                </View>

                <View style={styles.modernCard}>
                  <Text style={styles.preferenceLabel}>Application Logo</Text>
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                    <View style={styles.logoPreviewContainer}>
                      <Image source={{ uri: appLogo || DEFAULT_LOGO }} style={styles.logoPreview} />
                    </View>
                  </View>

                  {appLogo && (
                    <TouchableOpacity style={[styles.pickLogoBtn, { backgroundColor: '#ff3b30', marginBottom: 12 }]} onPress={removeLogo}>
                      <Ionicons name="trash" size={20} color="#fff" />
                      <Text style={styles.pickLogoBtnText}>Delete Custom Logo</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity style={styles.pickLogoBtn} onPress={pickImage}>
                    <Ionicons name="cloud-upload" size={20} color="#fff" />
                    <Text style={styles.pickLogoBtnText}>{appLogo ? 'Change Logo' : 'Select Logo'}</Text>
                  </TouchableOpacity>

                  <View style={styles.modernDivider} />

                  <View style={styles.modernCardRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.modernCardTitle}>Show Address on Reports</Text>
                      <Text style={styles.modernCardSubtitle}>If enabled, the address below will appear on all PDF exports.</Text>
                    </View>
                    <Switch
                      value={showAddress}
                      onValueChange={(val) => toggleAddress(val)}
                      trackColor={{ false: isDarkMode ? '#334155' : '#cbd5e1', true: '#38bdf8' }}
                      thumbColor="#ffffff"
                      ios_backgroundColor={isDarkMode ? '#334155' : '#cbd5e1'}
                    />
                  </View>

                  {showAddress && (
                    <View style={styles.addressContainer}>
                      <Text style={[styles.preferenceLabel, { marginTop: 12 }]}>Business Address</Text>
                      <TextInput
                        style={styles.addressInput}
                        value={appAddress}
                        onChangeText={saveAddress}
                        placeholder="Enter your business address, city, phone, etc."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        numberOfLines={3}
                      />
                    </View>
                  )}
                </View>
              </View>
            )}

            {selectedMaster === 'info' && (
              <View style={styles.masterDetailContainer}>
                <View style={styles.detailHeader}>
                  <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedMaster(null)}>
                    <Ionicons name="arrow-back" size={24} color="#2f95dc" />
                    <Text style={styles.backBtnText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.detailTitle}>App Info</Text>
                  <Ionicons name="information-circle" size={24} color={colors.primary} style={{ opacity: 0.5 }} />
                </View>

                <View style={styles.sectionCard}>
                  <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                    <View style={styles.infoIconBox}>
                      <Ionicons name="person-circle" size={80} color="#2f95dc" />
                    </View>
                    <Text style={styles.infoTitle}>MIK HUB Expense Tracker</Text>
                    <Text style={styles.infoVersion}>Version {appVersion}</Text>
                    
                    <View style={styles.infoDivider} />
                    
                    <Text style={styles.infoLabel}>Database Management</Text>

                    
                    <TouchableOpacity style={[styles.pickLogoBtn, { marginBottom: 12, backgroundColor: colors.primary }]} onPress={handleBackup}>
                      <Ionicons name="download" size={20} color="#fff" />
                      <Text style={styles.pickLogoBtnText}>Backup Database</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.pickLogoBtn, { marginBottom: 20, backgroundColor: '#ff9500' }]} onPress={handleRestore}>
                      <Ionicons name="refresh-circle" size={20} color="#fff" />
                      <Text style={styles.pickLogoBtnText}>Restore Database</Text>
                    </TouchableOpacity>

                    <View style={styles.infoDivider} />
                    
                    <Text style={styles.infoLabel}>Developer Contact</Text>
                    <TouchableOpacity 
                      style={styles.infoEmailBtn}
                      onPress={() => Alert.alert('Contact', 'You can reach us at: mik.hub.og@gmail.com')}
                    >
                      <Ionicons name="mail" size={20} color="#2f95dc" />
                      <Text style={styles.infoEmail}>mik.hub.og@gmail.com</Text>
                    </TouchableOpacity>

                    <View style={styles.infoLinksContainer}>
                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://t.me/+VDhcEvINemc5YWM1')}>
                        <Ionicons name="paper-plane" size={20} color="#0088cc" />
                        <Text style={styles.infoLinkText}>Telegram (For Get Latest Version)</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://discord.gg/EHhafUZxA')}>
                        <Ionicons name="logo-discord" size={20} color="#5865F2" />
                        <Text style={styles.infoLinkText}>Discord Group</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://mik-hub.vercel.app')}>
                        <Ionicons name="globe-outline" size={20} color="#666" />
                        <Text style={styles.infoLinkText}>mik-hub.vercel.app</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://instagram.com/mik__hub')}>
                        <Ionicons name="logo-instagram" size={20} color="#E1306C" />
                        <Text style={styles.infoLinkText}>@mik__hub</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://www.youtube.com/@MiK_HUB')}>
                        <Ionicons name="logo-youtube" size={20} color="#FF0000" />
                        <Text style={styles.infoLinkText}>MiK_HUB</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://mik-hub.vercel.app/ExpenseTrackerPrivacyPolicy.html')}>
                        <Ionicons name="shield-checkmark" size={20} color={colors.success} />
                        <Text style={styles.infoLinkText}>Privacy Policy</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity style={styles.infoLinkRow} onPress={() => Linking.openURL('https://mik-hub.vercel.app/ExpenseTrackerTermsAndCondition.html')}>
                        <Ionicons name="shield-checkmark" size={20} color={colors.success} />
                        <Text style={styles.infoLinkText}>Terms & Conditions</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 30, textAlign: 'center' }}>
                      © 2026 MIK HUB. All rights reserved.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* EDIT MODAL */}
      <Modal visible={editModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Master</Text>
            <TextInput
              style={styles.modalInput}
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder="Name or Code"
              autoCapitalize={editingItem?.type === 'currency' ? 'characters' : 'words'}
            />
            {(editingItem?.type === 'item' || editingItem?.type === 'currency') && (
              <TextInput
                style={styles.modalInput}
                value={editPriceValue}
                onChangeText={setEditPriceValue}
                placeholder={editingItem?.type === 'item' ? "Default Price" : "Decimals"}
                keyboardType="numeric"
                maxLength={editingItem?.type === 'currency' ? 1 : 10}
              />
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveEdit}>
                <Text style={styles.modalSaveBtnText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const getStyles = (colors, isDarkMode) => StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: colors.background },
  sectionCard: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBackground, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text },
  addButton: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, marginLeft: 12, shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },
  addButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  listContainer: { marginTop: 8 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight },
  listTextContainer: { flex: 1 },
  listName: { fontSize: 16, fontWeight: '600', color: colors.text },
  listSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  actionButtons: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 8, marginLeft: 4, backgroundColor: colors.iconBackground, borderRadius: 6 },
  emptyText: { color: colors.textSecondary, fontStyle: 'italic', fontSize: 14, textAlign: 'center', marginTop: 10 },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 10 },
  gridItem: { width: '46%', backgroundColor: colors.card, borderRadius: 20, padding: 20, marginBottom: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  gridLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  
  masterDetailContainer: { flex: 1 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 4 },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: colors.card },
  backBtnText: { marginLeft: 4, fontSize: 16, fontWeight: '600', color: colors.primary },
  detailTitle: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: colors.card, borderRadius: 16, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, textAlign: 'center', color: colors.text },
  modalInput: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  modalCancelBtn: { flex: 1, padding: 14, backgroundColor: colors.background, borderRadius: 8, marginRight: 8, alignItems: 'center' },
  modalCancelBtnText: { color: colors.danger, fontWeight: 'bold', fontSize: 16 },
  modalSaveBtn: { flex: 1, padding: 14, backgroundColor: colors.primary, borderRadius: 8, marginLeft: 8, alignItems: 'center' },
  modalSaveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  
  logoPreviewContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  logoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  pickLogoBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickLogoBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 10,
  },
  infoIconBox: {
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  infoVersion: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  infoDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 25,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  infoEmailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  infoEmail: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  infoLinksContainer: {
    width: '100%',
    marginTop: 20,
  },
  infoLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLinkText: {
    fontSize: 15,
    color: colors.text,
    marginLeft: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  settingToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  toggleBtn: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 2,
  },
  toggleBtnOn: {
    backgroundColor: colors.success,
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  toggleCircleOn: {
    transform: [{ translateX: 22 }],
  },
  addressContainer: {
    marginTop: 15,
  },
  addressInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    padding: 15,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
    minHeight: 80,
  },

  // Modern Section & Card Styles (matching screenshot)
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 1,
    marginLeft: 8,
  },
  modernCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: isDarkMode ? '#1e293b' : colors.borderLight,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDarkMode ? 0.25 : 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  modernCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: isDarkMode ? '#1e293b' : '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardTextCol: {
    flex: 1,
    marginRight: 8,
  },
  modernCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  modernCardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  modernDivider: {
    width: '100%',
    height: 1,
    backgroundColor: isDarkMode ? '#1e293b' : colors.borderLight,
    marginVertical: 16,
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: isDarkMode ? '#0d131d' : '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: isDarkMode ? '#1a2433' : '#e2e8f0',
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  segmentTabActive: {
    backgroundColor: isDarkMode ? '#1a273a' : '#ffffff',
    borderWidth: 1,
    borderColor: isDarkMode ? '#2f4463' : '#cbd5e1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
    color: isDarkMode ? '#64748b' : '#64748b',
    marginLeft: 6,
  },
  segmentTextActive: {
    fontWeight: '700',
    color: colors.text,
  },
  updateBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  installedVersionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeUpToDate: {
    backgroundColor: isDarkMode ? '#0d281e' : '#d1fae5',
    borderWidth: 1,
    borderColor: isDarkMode ? '#10b98144' : '#a7f3d0',
  },
  statusBadgeAvailable: {
    backgroundColor: isDarkMode ? '#2c1b0d' : '#fef3c7',
    borderWidth: 1,
    borderColor: isDarkMode ? '#f59e0b44' : '#fde68a',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeTextUpToDate: {
    color: isDarkMode ? '#34d399' : '#059669',
  },
  statusBadgeTextAvailable: {
    color: '#f59e0b',
  },
  checkNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDarkMode ? '#0e1622' : '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDarkMode ? '#2a3b52' : '#cbd5e1',
  },
  checkNowBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
});

