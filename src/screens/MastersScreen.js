import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform, Modal, Linking } from 'react-native';
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
  getSetting, setSetting
} from '../database/db';
import { Image } from 'react-native';
import { formatDate, formatAmount, getCurrencyDecimals } from '../utils/formatters';
import { useTheme } from '../theme/ThemeContext';
import { version as appVersion } from '../../package.json';

export default function MastersScreen() {
  const db = useSQLiteContext();
  const { isDarkMode, toggleDarkMode, colors } = useTheme();
  const styles = getStyles(colors);
  
  const [members, setMembers] = useState([]);
  const [shops, setShops] = useState([]);
  const [items, setItems] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [defaultCurrency, setDefaultCurrencyState] = useState('');
  const [appLogo, setAppLogo] = useState(null);
  const [showAddress, setShowAddress] = useState(false);
  const [appAddress, setAppAddress] = useState('');
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
      const [m, s, i, c, defCurr] = await Promise.all([
        getAllMembers(db),
        getAllShops(db),
        getAllMasterItems(db),
        getAllCurrencies(db),
        getDefaultCurrency(db),
        getSetting(db, 'app_logo'),
        getSetting(db, 'show_address'),
        getSetting(db, 'app_address')
      ]);
      setMembers(m);
      setShops(s);
      setItems(i);
      setCurrencies(c);
      setDefaultCurrencyState(defCurr);
      setAppLogo(logo);
      setShowAddress(showAddr === 'true');
      setAppAddress(addr || '');
    } catch (e) {
      console.log('Error loading masters:', e);
    }
  }, [db]);

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

                <View style={styles.sectionCard}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 20 }}>
                    Configure your application preferences and branding here.
                  </Text>

                  <Text style={[styles.label, { marginTop: 0 }]}>Application Logo</Text>
                  <View style={{ alignItems: 'center', marginBottom: 30 }}>
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

                  <View style={styles.infoDivider} />

                  <View style={styles.settingToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Dark Mode</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>Enable dark theme across the app.</Text>
                    </View>
                    <TouchableOpacity 
                      style={[styles.toggleBtn, isDarkMode && styles.toggleBtnOn]}
                      onPress={toggleDarkMode}
                    >
                      <View style={[styles.toggleCircle, isDarkMode && styles.toggleCircleOn]} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.infoDivider} />

                  <View style={styles.settingToggleRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>Show Address on Reports</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>If enabled, the address below will appear on all PDF exports.</Text>
                    </View>
                    <TouchableOpacity 
                      style={[styles.toggleBtn, showAddress && styles.toggleBtnOn]}
                      onPress={() => toggleAddress(!showAddress)}
                    >
                      <View style={[styles.toggleCircle, showAddress && styles.toggleCircleOn]} />
                    </TouchableOpacity>
                  </View>

                  {showAddress && (
                    <View style={styles.addressContainer}>
                      <Text style={styles.label}>Business Address</Text>
                      <TextInput
                        style={styles.addressInput}
                        value={appAddress}
                        onChangeText={saveAddress}
                        placeholder="Enter your business address, city, phone, etc."
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

const getStyles = (colors) => StyleSheet.create({
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
  }
});
