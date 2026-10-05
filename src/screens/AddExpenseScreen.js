import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, ActivityIndicator, Platform } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addExpense, updateExpense, getRecentShops, getAllShops, getAllCurrencies, getAllMembers, getAllMasterItems, getExpensesWithDetails, getDefaultCurrency, setDefaultCurrency, addOrUpdateShop, addOrUpdateMember, addOrUpdateMasterItem } from '../database/db';
import { formatDate, formatAmount, getCurrencyDecimals } from '../utils/formatters';
import { useTheme } from '../theme/ThemeContext';


export default function AddExpenseScreen({ navigation }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [shopName, setShopName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('OMR');
  const [splitMode, setSplitMode] = useState('bill'); // 'bill' or 'item'
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [members, setMembers] = useState([]); // bill‑wise selected members
  const [newMemberName, setNewMemberName] = useState(''); // kept for compatibility (not used in UI)
  const [allMembers, setAllMembers] = useState([]);
  const [memberModalVisible, setMemberModalVisible] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [billSearchTerm, setBillSearchTerm] = useState('');
  const [allMasterItems, setAllMasterItems] = useState([]);
  const [itemSearchModalVisible, setItemSearchModalVisible] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [selectedCustomMembers, setSelectedCustomMembers] = useState([]);
  
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [findModalVisible, setFindModalVisible] = useState(false);
  const [allExpenses, setAllExpenses] = useState([]);
  const [findSearchTerm, setFindSearchTerm] = useState('');
  const [customSplitTarget, setCustomSplitTarget] = useState(null); // 'bill' or 'item'
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [currencyList, setCurrencyList] = useState([]);
  const [defaultCurrency, setDefaultCurrencyState] = useState('OMR');
  const [shopModalVisible, setShopModalVisible] = useState(false);
  const [allShops, setAllShops] = useState([]);
  const [shopSearchTerm, setShopSearchTerm] = useState('');
  const [expensePayers, setExpensePayers] = useState([]); // { memberName, amount }[]

  // Table items for item split mode
  const [items, setItems] = useState([{ id: Date.now().toString(), memberName: '', name: '', price: '', qty: '1' }]);

  // Just to show some recent autocomplete suggestions conceptually
  const [recentShops, setRecentShops] = useState([]);

  useEffect(() => {
    async function loadInitialData() {
      const shops = await getRecentShops(db, 5);
      setRecentShops(shops);

      const defCurr = await getDefaultCurrency(db);
      setDefaultCurrencyState(defCurr);
      setCurrency(defCurr);

      const dbCurrencies = await getAllCurrencies(db);
      setCurrencyList(dbCurrencies);

      const shopsList = await getAllShops(db);
      setAllShops(shopsList);

      const membersList = await getAllMembers(db);
      setAllMembers(membersList);

      const itemsList = await getAllMasterItems(db);
      setAllMasterItems(itemsList);
    }
    loadInitialData();
  }, [db]);

  // Removed legacy add‑member handler – UI now uses searchable member list
  // kept for potential future use
  const handleAddMember = () => {
    if (newMemberName.trim() !== '' && !members.includes(newMemberName.trim())) {
      setMembers([...members, newMemberName.trim()]);
    }
    setNewMemberName('');
  };

  const addItemRow = async () => {
    // Sync last row to master if name and price exist
    const lastRow = items[items.length - 1];
    if (lastRow && lastRow.name && lastRow.price) {
      const priceNum = parseFloat(lastRow.price) || 0;
      if (priceNum > 0) {
        const dateStr = new Date().toISOString();
        await addOrUpdateMasterItem(db, lastRow.name.trim(), priceNum, dateStr);
        const itemsList = await getAllMasterItems(db);
        setAllMasterItems(itemsList);
      }
    }
    setItems([...items, { id: Date.now().toString(), memberName: '', name: '', price: '', qty: '1' }]);
  };

  const removeItemRow = (id) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };




  const onDateChange = (selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleSave = async () => {
    if (!shopName.trim()) {
      Alert.alert('Validation Error', 'Please enter a shop name');
      return;
    }

    try {
      const payload = {
        shopName: shopName.trim(),
        description: description.trim(),
        totalAmount: 0,
        currency,
        date: date.toISOString(),
        splitMode,
        splits: [],
        items: []
      };

      if (splitMode === 'bill') {
        const amountNum = parseFloat(totalAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
          Alert.alert('Validation Error', 'Please enter a valid total amount');
          return;
        }
        if (members.length === 0) {
          Alert.alert('Validation Error', 'Please add at least one member to split');
          return;
        }
        const splitAmount = amountNum / members.length;
        payload.totalAmount = amountNum;
        payload.splits = members.map(m => ({ memberName: m, amount: splitAmount }));
      } else {
        // Item mode
        let calculatedTotal = 0;
        const validItems = items.filter(item => item.memberName.trim() !== '' && item.name.trim() !== '' && item.price.trim() !== '');
        
        if (validItems.length === 0) {
          Alert.alert('Validation Error', 'Please complete at least one item row');
          return;
        }

        payload.items = validItems.map(item => {
          const itemPrice = parseFloat(item.price);
          const itemQty = parseFloat(item.qty) || 1;
          calculatedTotal += itemPrice * itemQty;
          
          // Sync to master
          const dateStr = new Date().toISOString();
          addOrUpdateMasterItem(db, item.name.trim(), itemPrice, dateStr);

          let itemSplits = [];
          if (item.memberName === 'All') {
            const splitAmt = allMembers.length > 0 ? (itemPrice * itemQty) / allMembers.length : 0;
            itemSplits = allMembers.map(m => ({ memberName: m.name, amount: splitAmt }));
          } else if (item.memberName.startsWith('Custom(')) {
            const membersStr = item.memberName.substring(7, item.memberName.length - 1);
            const customMembers = membersStr.split(', ').filter(m => m.trim() !== '');
            const splitAmt = customMembers.length > 0 ? (itemPrice * itemQty) / customMembers.length : 0;
            itemSplits = customMembers.map(m => ({ memberName: m.trim(), amount: splitAmt }));
          } else {
            itemSplits = [{ memberName: item.memberName.trim(), amount: itemPrice * itemQty }];
          }
          
          return { name: item.name.trim(), price: itemPrice, qty: itemQty, splits: itemSplits };
        });
        payload.totalAmount = calculatedTotal;
      }

      // Validate Payers
      const totalPaid = expensePayers.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const billTotal = splitMode === 'bill' ? parseFloat(totalAmount) : payload.totalAmount;
      
      if (expensePayers.length === 0) {
        Alert.alert('Validation Error', 'Please select at least one person who paid the bill');
        return;
      }
      
      if (Math.abs(totalPaid - billTotal) > 0.001) {
        Alert.alert('Validation Error', `Total paid (${totalPaid.toFixed(getCurrencyDecimals(currency, currencyList))}) does not match bill total (${billTotal.toFixed(getCurrencyDecimals(currency, currencyList))})`);
        return;
      }

      payload.payers = expensePayers.map(p => ({ ...p, amount: parseFloat(p.amount) }));

      if (editingExpenseId) {
        await updateExpense(db, editingExpenseId, payload);
        Alert.alert('Success', 'Bill updated successfully');
      } else {
        await addExpense(db, payload);
      }

      navigation.goBack();
    } catch (e) {
      console.log('Error saving expense:', e);
      Alert.alert('Error', 'Could not save expense. ' + e.message);
    }
  };

  const fetchPreviousBills = async () => {
    try {
      const data = await getExpensesWithDetails(db, currency);
      setAllExpenses(data);
      setFindModalVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to fetch previous bills');
      console.log(e);
    }
  };

  const clearForm = () => {
    setEditingExpenseId(null);
    setIsViewOnly(false);
    setShopName('');
    setTotalAmount('');
    setDescription('');
    setDate(new Date());
    setMembers([]);
    setItems([{ id: Date.now().toString(), memberName: '', name: '', price: '', qty: '1' }]);
    setExpensePayers([]);
  };

  const loadExpenseIntoForm = (exp) => {
    setEditingExpenseId(exp.id);
    setIsViewOnly(true);
    setShopName(exp.shop_name || '');
    setTotalAmount(exp.total_amount.toString());
    setCurrency(exp.currency);
    setSplitMode(exp.split_mode);
    setDescription(exp.description || '');
    setDate(new Date(exp.date));
    
    if (exp.payers && exp.payers.length > 0) {
      setExpensePayers(exp.payers.map(p => ({ memberName: p.memberName, amount: p.amount.toString() })));
    } else {
      setExpensePayers([]);
    }
    
      if (exp.split_mode === 'bill') {
        // Map splits back to members list
        const memberList = exp.splits.map(s => s.member_name);
        setMembers(memberList);
      } else {
        // Map items back
        const mappedItems = exp.items.map(item => {
          let memberDisplay = '';
          if (item.splits.length === allMembers.length) {
            memberDisplay = 'All';
          } else if (item.splits.length > 1) {
            memberDisplay = `Custom(${item.splits.map(s => s.member_name).join(', ')})`;
          } else if (item.splits.length === 1) {
            memberDisplay = item.splits[0].member_name;
          }
          return {
            id: Date.now().toString() + Math.random(),
            name: item.name,
            price: item.price.toString(),
            qty: (item.qty || 1).toString(),
            memberName: memberDisplay
          };
        });
        setItems(mappedItems);
      }
      setFindModalVisible(false);
    };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerActionRow}>
        <Text style={styles.title} numberOfLines={1}>{editingExpenseId ? (isViewOnly ? 'View Bill' : 'Edit Bill') : 'New Bill'}</Text>
        
        <TouchableOpacity 
          style={styles.currencyHeaderBtn} 
          onPress={() => setCurrencyModalVisible(true)}
          disabled={isViewOnly}
        >
          <Text style={styles.currencyHeaderText}>{currency}</Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.findBtn} onPress={fetchPreviousBills}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <Text style={styles.findBtnText}>Find</Text>
        </TouchableOpacity>
      </View>
      
      {editingExpenseId && (
        <View style={styles.editBadge}>
          <Ionicons name={isViewOnly ? "eye" : "create"} size={14} color="#fff" />
          <Text style={styles.editBadgeText}>{isViewOnly ? 'Viewing' : 'Editing'} Bill #{editingExpenseId}</Text>
          <TouchableOpacity onPress={clearForm}>
            <Ionicons name="close-circle" size={18} color="#fff" style={{marginLeft: 10}} />
          </TouchableOpacity>
        </View>
      )}

      <View pointerEvents={isViewOnly ? 'none' : 'auto'}>
        <Text style={styles.label}>Shop Name</Text>
      <TouchableOpacity 
        style={styles.modalTrigger} 
        onPress={() => {
          setShopSearchTerm(shopName);
          setShopModalVisible(true);
        }}
      >
        <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
          <Text style={[styles.modalTriggerText, {flex: 1}]}>
            {shopName || 'Select shop or vendor'}
          </Text>
          {shopName ? (
            <TouchableOpacity onPress={() => setShopName('')} style={{padding: 5}}>
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Ionicons name="storefront-outline" size={20} color={colors.primary} />
      </TouchableOpacity>
 
      <Text style={styles.label}>Bill Date</Text>
      <TouchableOpacity style={styles.dateBox} onPress={() => setShowDatePicker(true)}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={styles.dateBoxText}>{formatDate(date)}</Text>
      </TouchableOpacity>
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onValueChange={onDateChange}
          onDismiss={() => setShowDatePicker(false)}
        />
      )}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, splitMode === 'bill' && styles.activeTab]} 
          onPress={() => setSplitMode('bill')}
        >
          <Text style={[styles.tabText, splitMode === 'bill' && styles.activeTabText]}>Bill-wise</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, splitMode === 'item' && styles.activeTab]} 
          onPress={() => setSplitMode('item')}
        >
          <Text style={[styles.tabText, splitMode === 'item' && styles.activeTabText]}>Item-wise</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Description</Text>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, { flex: 1, borderWidth: 0, marginBottom: 0, backgroundColor: 'transparent' }]}
          value={description}
          onChangeText={setDescription}
          placeholder="What was this for?"
        />
        {description ? (
          <TouchableOpacity onPress={() => setDescription('')} style={styles.clearInputBtn}>
            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {splitMode === 'bill' && (
        <>

          <Text style={styles.label}>Total Amount</Text>
          <TextInput
            style={styles.input}
            value={totalAmount}
            onChangeText={setTotalAmount}
            placeholder="0.000"
            keyboardType="numeric"
          />
          <Text style={styles.label}>Split Members</Text>
          <TouchableOpacity 
            style={styles.modalTrigger} 
            onPress={() => {
              setCustomSplitTarget('bill');
              setSelectedCustomMembers(members);
              setCustomModalVisible(true);
            }}
          >
            <View style={{flex: 1}}>
              <Text style={styles.modalTriggerText} numberOfLines={1}>
                {members.length > 0 ? members.join(', ') : 'Select members to split'}
              </Text>
            </View>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </>
      )}

      {splitMode === 'item' && (
        <View style={styles.tableContainer}>
          <Text style={styles.label}>Item Details:</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { flex: 0.5 }]}>Sl No.</Text>
            <Text style={[styles.headerCell, { flex: 1.5 }]}>Member</Text>
            <Text style={[styles.headerCell, { flex: 1.5 }]}>Item Name</Text>
            <Text style={[styles.headerCell, { flex: 0.8 }]}>Qty</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Amount</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Total</Text>
            <Text style={[styles.headerCell, { flex: 0.5 }]}></Text>
          </View>
          
          {items.map((item, index) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={[styles.cellText, { flex: 0.5, textAlign: 'center' }]}>{index + 1}</Text>
                <TouchableOpacity
                  style={[styles.inputCell, { flex: 1.5, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground }]}
                  onPress={() => {
                    setSelectedItemId(item.id);
                    setSearchTerm(item.memberName);
                    setMemberModalVisible(true);
                  }}
                >
                  <Text style={{ color: colors.textSecondary, flex: 1, fontSize: 11 }} numberOfLines={1}>{item.memberName || 'Member'}</Text>
                  {item.memberName ? (
                    <TouchableOpacity onPress={() => updateItem(item.id, 'memberName', '')} style={{padding: 2}}>
                      <Ionicons name="close-circle" size={14} color={colors.borderLight} />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inputCell, { flex: 1.5, flexDirection: 'row', alignItems: 'center' }]}
                onPress={() => {
                  setSelectedItemId(item.id);
                  setItemSearchTerm(item.name);
                  setItemSearchModalVisible(true);
                }}
              >
                <Text style={{ color: item.name ? colors.text : colors.textSecondary, fontSize: 11, flex: 1 }} numberOfLines={1}>{item.name || 'Item'}</Text>
                {item.name ? (
                  <TouchableOpacity onPress={() => updateItem(item.id, 'name', '')} style={{padding: 2}}>
                    <Ionicons name="close-circle" size={14} color={colors.borderLight} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
              <TextInput 
                style={[styles.inputCell, { flex: 0.8 }]} 
                value={item.qty}
                onChangeText={(val) => updateItem(item.id, 'qty', val)}
                placeholder="1"
                keyboardType="numeric"
              />
              <TextInput 
                style={[styles.inputCell, { flex: 1 }]} 
                value={item.price}
                onChangeText={(val) => updateItem(item.id, 'price', val)}
                placeholder="0.000"
                keyboardType="numeric"
              />
              <Text style={[styles.cellText, { flex: 1 }]}>{(parseFloat(item.qty || 0) * parseFloat(item.price || 0)).toFixed(getCurrencyDecimals(currency, currencyList))}</Text>
              <TouchableOpacity 
                style={[styles.actionBtn, { flex: 0.5 }]} 
                onPress={() => index === items.length - 1 ? addItemRow() : removeItemRow(item.id)}
              >
                <Text style={styles.actionBtnText}>{index === items.length - 1 ? '+' : '-'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Total Bill Amount Display */}
      <View style={styles.totalDisplayContainer}>
        <Text style={styles.totalDisplayLabel}>Total Bill Amount:</Text>
        <Text style={styles.totalDisplayValue}>
          {splitMode === 'bill' 
            ? (parseFloat(totalAmount) || 0).toFixed(getCurrencyDecimals(currency, currencyList)) 
            : items.reduce((sum, it) => sum + (parseFloat(it.price) || 0) * (parseFloat(it.qty) || 1), 0).toFixed(getCurrencyDecimals(currency, currencyList))
          } {currency}
        </Text>
      </View>

      <Text style={styles.label}>Paid By</Text>
      <View style={styles.payerSection}>
        {allMembers.map(member => {
          const payerEntry = expensePayers.find(p => p.memberName === member.name);
          const isSelected = !!payerEntry;
          return (
            <View key={member.id} style={styles.payerRow}>
              <TouchableOpacity 
                style={styles.payerCheck} 
                onPress={() => {
                  if (isSelected) {
                    setExpensePayers(expensePayers.filter(p => p.memberName !== member.name));
                  } else {
                    // Default to remaining amount if first payer, or 0
                    const currentTotal = expensePayers.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                    const billTotal = splitMode === 'bill' ? (parseFloat(totalAmount) || 0) : items.reduce((sum, it) => sum + (parseFloat(it.price) || 0) * (parseFloat(it.qty) || 1), 0);
                    const remaining = Math.max(0, billTotal - currentTotal);
                    setExpensePayers([...expensePayers, { memberName: member.name, amount: remaining.toFixed(getCurrencyDecimals(currency, currencyList)) }]);
                  }
                }}
              >
                <Ionicons 
                  name={isSelected ? 'checkbox' : 'square-outline'} 
                  size={24} 
                  color={isSelected ? colors.primary : colors.borderLight} 
                />
                <Text style={styles.payerName}>{member.name}</Text>
              </TouchableOpacity>
              {isSelected && (
                <TextInput
                  style={styles.payerAmountInput}
                  value={payerEntry.amount}
                  onChangeText={(val) => {
                    setExpensePayers(expensePayers.map(p => 
                      p.memberName === member.name ? { ...p, amount: val } : p
                    ));
                  }}
                  placeholder="0.000"
                  keyboardType="numeric"
                />
              )}
            </View>
          );
        })}
      </View>

      </View>
      {/* End of view-only wrapper */}

      <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 20}}>
        {isViewOnly ? (
          <TouchableOpacity style={[styles.saveButton, {flex: 1, marginRight: 5, marginTop: 0}]} onPress={() => setIsViewOnly(false)}>
            <Text style={styles.saveButtonText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.saveButton, {flex: 1, marginRight: 5, marginTop: 0}]} onPress={handleSave}>
            <Text style={styles.saveButtonText}>{editingExpenseId ? 'Update Bill' : 'Save Bill'}</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={[styles.saveButton, {backgroundColor: colors.danger, flex: 0.5, marginLeft: 5, marginTop: 0}]} onPress={clearForm}>
          <Text style={styles.saveButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Currency Selection Modal */}
      <Modal visible={currencyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '60%' }]}>
            <Text style={styles.modalTitle}>Select Currency</Text>
            <ScrollView>
              {currencyList.map(item => (
                <TouchableOpacity 
                  key={item.code} 
                  style={styles.currencyItem}
                  onPress={() => {
                    setCurrency(item.code);
                    setCurrencyModalVisible(false);
                  }}
                >
                  <View style={{flex: 1}}>
                    <Text style={[styles.currencyItemText, currency === item.code && styles.activeCurrencyText]}>{item.code}</Text>
                    <Text style={{fontSize: 10, color: colors.textSecondary}}>{item.decimals} decimals</Text>
                    {defaultCurrency === item.code && <Text style={styles.defaultBadge}>Default</Text>}
                  </View>
                  <TouchableOpacity 
                    style={styles.setDefaultBtn}
                    onPress={async () => {
                      await setDefaultCurrency(db, item.code);
                      setDefaultCurrencyState(item.code);
                      setCurrency(item.code);
                      Alert.alert('Default Set', `${item.code} is now your default currency`);
                    }}
                  >
                    <Text style={styles.setDefaultText}>Set Default</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity 
              style={styles.modalCloseBtn}
              onPress={() => setCurrencyModalVisible(false)}
            >
              <Text style={{ color: colors.text }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Shop Selection Modal */}
      <Modal visible={shopModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Shop</Text>
            <View style={styles.modalSearchWrapper}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                placeholder="Search shop..."
                value={shopSearchTerm}
                onChangeText={setShopSearchTerm}
              />
              {shopSearchTerm ? (
                <TouchableOpacity onPress={() => setShopSearchTerm('')} style={styles.clearInputBtn}>
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 300 }}>
              {allShops
                .filter(s => s.name.toLowerCase().includes(shopSearchTerm.toLowerCase()))
                .map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.modalItem}
                    onPress={() => {
                      setShopName(s.name);
                      setShopModalVisible(false);
                    }}
                  >
                    <Text style={{ color: colors.text }}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              {shopSearchTerm.trim() !== '' &&
                !allShops.some(s => s.name.toLowerCase() === shopSearchTerm.toLowerCase()) && (
                  <TouchableOpacity
                    style={styles.modalItemAdd}
                    onPress={async () => {
                      try {
                        const date = new Date().toISOString();
                        await addOrUpdateShop(db, shopSearchTerm.trim(), date);
                        setShopName(shopSearchTerm.trim());
                        const shopsList = await getAllShops(db);
                        setAllShops(shopsList);
                        setShopModalVisible(false);
                      } catch (e) {
                        Alert.alert('Error', 'Failed to add shop to masters');
                      }
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Add New Shop "{shopSearchTerm}"</Text>
                  </TouchableOpacity>
                )}
            </ScrollView>
            <TouchableOpacity 
              style={styles.modalCloseBtn}
              onPress={() => setShopModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Find Bill Modal */}
      <Modal visible={findModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Find Previous Bill</Text>
              <TouchableOpacity onPress={() => setFindModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.searchInput}
              placeholder="Search shop or description..."
              value={findSearchTerm}
              onChangeText={setFindSearchTerm}
            />
            
            <ScrollView style={{maxHeight: 400}}>
              {allExpenses
                .filter(exp => 
                  exp.shop_name?.toLowerCase().includes(findSearchTerm.toLowerCase()) || 
                  exp.description?.toLowerCase().includes(findSearchTerm.toLowerCase())
                )
                .map(exp => (
                <TouchableOpacity 
                  key={exp.id} 
                  style={styles.findItem}
                  onPress={() => loadExpenseIntoForm(exp)}
                >
                  <View style={{flex: 1}}>
                    <Text style={styles.findItemShop}>{exp.shop_name || 'Generic Shop'}</Text>
                    {exp.description ? <Text style={{fontSize: 12, color: colors.textSecondary}} numberOfLines={1}>{exp.description}</Text> : null}
                    <Text style={styles.findItemDate}>{new Date(exp.date).toLocaleDateString()} - {exp.split_mode}</Text>
                  </View>
                  <Text style={styles.findItemAmount}>{exp.total_amount.toFixed(getCurrencyDecimals(exp.currency, currencyList))}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.borderLight} />
                </TouchableOpacity>
              ))}
              {allExpenses.length === 0 && <Text style={styles.emptyText}>No previous bills found.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Member Selection Modal */}
      <Modal
        visible={memberModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMemberModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Member</Text>
            <View style={styles.modalSearchWrapper}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                placeholder="Search member..."
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
              {searchTerm ? (
                <TouchableOpacity onPress={() => setSearchTerm('')} style={styles.clearInputBtn}>
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 200 }}>
              <TouchableOpacity
                style={[styles.modalItem, { backgroundColor: colors.primaryLight }]}
                onPress={() => {
                  updateItem(selectedItemId, 'memberName', 'All');
                  setMemberModalVisible(false);
                }}
              >
                <Text style={{ fontWeight: 'bold', color: colors.primary }}>All Members</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalItem, { backgroundColor: colors.background }]}
                onPress={() => {
                  setMemberModalVisible(false);
                  setCustomSplitTarget('item');
                  const currentItem = items.find(it => it.id === selectedItemId);
                  if (currentItem && currentItem.memberName.startsWith('Custom(')) {
                    const membersStr = currentItem.memberName.substring(7, currentItem.memberName.length - 1);
                    setSelectedCustomMembers(membersStr.split(', ').filter(m => m.trim() !== ''));
                  } else {
                    setSelectedCustomMembers([]);
                  }
                  setCustomModalVisible(true);
                }}
              >
                <Text style={{ fontWeight: 'bold', color: colors.success }}>Custom Split...</Text>
              </TouchableOpacity>

              {allMembers
                .filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(m => (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.modalItem}
                    onPress={() => {
                      updateItem(selectedItemId, 'memberName', m.name);
                      setMemberModalVisible(false);
                    }}
                  >
                    <Text style={{ color: colors.text }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              {searchTerm.trim() !== '' &&
                searchTerm.toLowerCase() !== 'all' &&
                !searchTerm.startsWith('Custom(') &&
                !allMembers.some(m => m.name.toLowerCase() === searchTerm.toLowerCase()) && (
                  <TouchableOpacity
                    style={styles.modalItemAdd}
                    onPress={async () => {
                      try {
                        const date = new Date().toISOString();
                        await addOrUpdateMember(db, searchTerm.trim(), date);
                        if (selectedItemId) {
                          updateItem(selectedItemId, 'memberName', searchTerm.trim());
                        } else {
                          // If in bill mode or elsewhere
                          setMembers([...members, searchTerm.trim()]);
                        }
                        const membersList = await getAllMembers(db);
                        setAllMembers(membersList);
                        setMemberModalVisible(false);
                      } catch (e) {
                        Alert.alert('Error', 'Failed to add member to masters');
                      }
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Add "{searchTerm}"</Text>
                  </TouchableOpacity>
                )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setMemberModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Item Selection Modal */}
      <Modal
        visible={itemSearchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setItemSearchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Item</Text>
            <View style={styles.modalSearchWrapper}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                placeholder="Search item..."
                value={itemSearchTerm}
                onChangeText={setItemSearchTerm}
              />
              {itemSearchTerm ? (
                <TouchableOpacity onPress={() => setItemSearchTerm('')} style={styles.clearInputBtn}>
                  <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 200 }}>
              {allMasterItems
                .filter(i => i.name.toLowerCase().includes(itemSearchTerm.toLowerCase()))
                .map(i => (
                  <TouchableOpacity
                    key={i.id}
                    style={styles.modalItem}
                    onPress={async () => {
                      const currentItem = items.find(it => it.id === selectedItemId);
                      const updates = { name: i.name };
                      
                      // If price in row is empty, fill with master price
                      // If price in row is different from master, update master
                      const rowPrice = parseFloat(currentItem?.price) || 0;
                      if (currentItem && (!currentItem.price || currentItem.price === '')) {
                        updates.price = i.default_price ? i.default_price.toString() : '';
                      } else if (rowPrice > 0 && rowPrice !== i.default_price) {
                        // Update master price if different
                        const date = new Date().toISOString();
                        await addOrUpdateMasterItem(db, i.name, rowPrice, date);
                        const itemsList = await getAllMasterItems(db);
                        setAllMasterItems(itemsList);
                      }

                      setItems(items.map(it => it.id === selectedItemId ? { ...it, ...updates } : it));
                      setItemSearchModalVisible(false);
                    }}
                  >
                    <Text style={{ color: colors.text }}>{i.name} {i.default_price ? `(${i.default_price})` : ''}</Text>
                  </TouchableOpacity>
                ))}
              {itemSearchTerm.trim() !== '' &&
                !allMasterItems.some(i => i.name.toLowerCase() === itemSearchTerm.toLowerCase()) && (
                  <TouchableOpacity
                    style={styles.modalItemAdd}
                    onPress={async () => {
                      try {
                        const date = new Date().toISOString();
                        const currentItem = items.find(it => it.id === selectedItemId);
                        const priceNum = parseFloat(currentItem?.price) || 0;
                        await addOrUpdateMasterItem(db, itemSearchTerm.trim(), priceNum, date);
                        updateItem(selectedItemId, 'name', itemSearchTerm.trim());
                        const itemsList = await getAllMasterItems(db);
                        setAllMasterItems(itemsList);
                        setItemSearchModalVisible(false);
                      } catch (e) {
                        Alert.alert('Error', 'Failed to add item to masters');
                      }
                    }}
                  >
                    <Text style={{ color: colors.primary }}>Add "{itemSearchTerm}"</Text>
                  </TouchableOpacity>
                )}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setItemSearchModalVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Member Selection Modal */}
      <Modal
        visible={customModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Custom Split</Text>
            
            <View style={styles.modalSearchWrapper}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                placeholder="Search or add member..."
                value={searchTerm}
                onChangeText={setSearchTerm}
              />
              {searchTerm ? (
                <TouchableOpacity 
                  style={styles.modalItemAddSmall}
                  onPress={async () => {
                    const trimmed = searchTerm.trim();
                    if (!trimmed) return;
                    if (allMembers.some(m => m.name.toLowerCase() === trimmed.toLowerCase())) {
                      if (!selectedCustomMembers.includes(trimmed)) {
                        setSelectedCustomMembers([...selectedCustomMembers, trimmed]);
                      }
                      setSearchTerm('');
                      return;
                    }
                    try {
                      const dateStr = new Date().toISOString();
                      await addOrUpdateMember(db, trimmed, dateStr);
                      const membersList = await getAllMembers(db);
                      setAllMembers(membersList);
                      setSelectedCustomMembers([...selectedCustomMembers, trimmed]);
                      setSearchTerm('');
                    } catch (e) {
                      Alert.alert('Error', 'Failed to add member');
                    }
                  }}
                >
                  <Ionicons name="add-circle" size={24} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
            
            <TouchableOpacity 
              style={styles.selectAllContainer}
              onPress={() => {
                if (selectedCustomMembers.length === allMembers.length) {
                  setSelectedCustomMembers([]);
                } else {
                  setSelectedCustomMembers(allMembers.map(m => m.name));
                }
              }}
            >
              <View style={[styles.checkbox, selectedCustomMembers.length === allMembers.length && styles.checkboxSelected]}>
                {selectedCustomMembers.length === allMembers.length && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <Text style={styles.selectAllText}>Select All Members</Text>
            </TouchableOpacity>

            <ScrollView style={{ maxHeight: 300, marginVertical: 10 }}>
              {allMembers
                .filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(m => {
                const isSelected = selectedCustomMembers.includes(m.name);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={styles.customMemberItem}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedCustomMembers(selectedCustomMembers.filter(name => name !== m.name));
                      } else {
                        setSelectedCustomMembers([...selectedCustomMembers, m.name]);
                      }
                    }}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
                    </View>
                    <Text style={styles.customMemberName}>{m.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setCustomModalVisible(false)}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm]}
                onPress={() => {
                  if (selectedCustomMembers.length === 0) {
                    Alert.alert('Selection Required', 'Please select at least one member.');
                    return;
                  }
                  if (customSplitTarget === 'bill') {
                    setMembers(selectedCustomMembers);
                  } else {
                    const memberStr = `Custom(${selectedCustomMembers.join(', ')})`;
                    updateItem(selectedItemId, 'memberName', memberStr);
                  }
                  setCustomModalVisible(false);
                }}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    );
  }

  const getStyles = (colors) => StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
      backgroundColor: colors.background,
    },
    label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  chip: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  chipText: {
    marginRight: 8,
    color: colors.text,
  },
  chipClose: {
    color: colors.danger,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  activeTabText: {
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: colors.text,
  },
  headerActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  findBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dateBox: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  dateBoxText: {
    marginLeft: 10,
    fontSize: 16,
    color: colors.text,
  },
  editBadge: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  modalTrigger: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTriggerText: {
    fontSize: 15,
    color: colors.text,
  },
  modalItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalItemAdd: {
    paddingVertical: 10,
  },
  modalCloseBtn: {
    marginTop: 12,
    backgroundColor: colors.borderLight,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: colors.text,
    fontWeight: '600',
  },
  totalDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  totalDisplayLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  totalDisplayValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.primary,
  },
  saveButton: {
    backgroundColor: colors.success,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  suggestionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: -8,
  },
  suggestionBadge: {
    backgroundColor: colors.primaryLight,
    color: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    fontSize: 12,
  },
  tableContainer: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    overflow: 'hidden'
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingVertical: 10,
  },
  headerCell: {
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
    marginHorizontal: 2,
    paddingHorizontal: 2,
    color: colors.text,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  cellText: {
    fontSize: 12,
    color: colors.text
  },
  inputCell: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 4,
    padding: 6,
    marginHorizontal: 2,
    fontSize: 12,
    backgroundColor: colors.inputBackground,
    color: colors.text,
  },
  actionBtn: {
    backgroundColor: colors.danger,
    padding: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  actionBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  selectAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: 8,
  },
  findItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  selectAllText: {
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 12,
  },
  customMemberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBackground,
  },
  customMemberName: {
    marginLeft: 12,
    fontSize: 15,
    color: colors.text,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
  },
  checkboxTick: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  modalBtn: {
    flex: 0.48,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: colors.borderLight,
  },
  modalBtnConfirm: {
    backgroundColor: colors.primary,
  },
  modalItemAddSmall: {
    padding: 5,
  },
  findBtnText: {
    color: colors.primary,
    marginLeft: 4,
    fontWeight: '600',
    fontSize: 13,
  },
  editBadgeText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: 'bold',
    flex: 1,
  },
  findItemShop: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  findItemDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  currencyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  currencyHeaderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary,
    marginRight: 4,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  currencyItemText: {
    fontSize: 16,
    color: colors.text,
  },
  activeCurrencyText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  setDefaultBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  setDefaultText: {
    fontSize: 12,
    color: colors.primary,
  },
  defaultBadge: {
    fontSize: 10,
    color: colors.success,
    fontWeight: 'bold',
    marginTop: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  payerSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 20,
  },
  payerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBackground,
  },
  payerCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  payerName: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 10,
  },
  payerAmountInput: {
    width: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 15,
    textAlign: 'right',
    backgroundColor: colors.inputBackground,
    color: colors.text,
  },
  findItemAmount: { fontSize: 16, fontWeight: 'bold', color: colors.primary, marginRight: 10 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingRight: 10,
    marginBottom: 15,
  },
  clearInputBtn: {
    padding: 5,
  },
  modalSearchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingRight: 8,
    marginBottom: 15,
  },
});
