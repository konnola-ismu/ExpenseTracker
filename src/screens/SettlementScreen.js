import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, Alert, Modal, Switch } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addSettlement, getAllMembers, getDefaultCurrency, getMemberBills, getRecentSettlements, updateSettlement, deleteSettlement, getAllCurrencies, getSettlementBills } from '../database/db';
import { formatDate, formatAmount, getCurrencyDecimals } from '../utils/formatters';
import { useTheme } from '../theme/ThemeContext';

export default function SettlementScreen({ navigation }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [payer, setPayer] = useState('');
  const [receiver, setReceiver] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [currency, setCurrency] = useState('OMR');
  const [memberBills, setMemberBills] = useState([]);
  const [selectedBills, setSelectedBills] = useState([]); // List of {id, amount}
  const [editingId, setEditingId] = useState(null);
  const [findModalVisible, setFindModalVisible] = useState(false);
  const [recentSettlements, setRecentSettlements] = useState([]);
  const [initialPayer, setInitialPayer] = useState('');
  const [settleUpToDate, setSettleUpToDate] = useState(null);
  const [showUpToDatePicker, setShowUpToDatePicker] = useState(false);
  const [isSettleUpToDateEnabled, setIsSettleUpToDateEnabled] = useState(false);

  useEffect(() => {
    async function loadData() {
      const members = await getAllMembers(db);
      setAllMembers(members);
      const currs = await getAllCurrencies(db);
      setCurrencies(currs);
      const defCurr = await getDefaultCurrency(db);
      setCurrency(defCurr);
    }
    loadData();
  }, [db]);

  useEffect(() => {
    async function loadBills() {
      if (payer && currency) {
        const bills = await getMemberBills(db, payer, currency, editingId);
        setMemberBills(bills);
        
        if (editingId && payer === initialPayer) {
          const sBills = await getSettlementBills(db, editingId);
          const mappedSBills = sBills.map(sb => {
             const mb = bills.find(b => b.split_type === sb.type && b.entity_id === sb.id);
             return {
               ...sb, 
               amountToSettle: sb.amountToSettle.toString(),
               maxAmount: mb ? mb.member_share : sb.maxAmount
             };
          });
          setSelectedBills(mappedSBills);
        } else {
          setSelectedBills([]);
          if (!editingId) setAmount('0');
          setSettleUpToDate(null);
          setIsSettleUpToDateEnabled(false);
        }
      } else {
        setMemberBills([]);
        setSelectedBills([]);
      }
    }
    loadBills();
  }, [db, payer, currency, editingId, initialPayer]);

  const handleSave = async () => {
    if (!payer || !receiver || !amount) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    if (payer === receiver) {
      Alert.alert('Error', 'Payer and receiver cannot be the same');
      return;
    }

    try {
      const settledUpToDateStr = (isSettleUpToDateEnabled && settleUpToDate) ? settleUpToDate.toISOString() : null;
      if (editingId) {
        await updateSettlement(db, editingId, payer, receiver, parseFloat(amount), date.toISOString(), description, currency, selectedBills, settledUpToDateStr);
        Alert.alert('Success', 'Settlement updated successfully');
      } else {
        await addSettlement(db, payer, receiver, parseFloat(amount), date.toISOString(), description, currency, selectedBills, settledUpToDateStr);
        Alert.alert('Success', 'Settlement recorded successfully');
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to save settlement');
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Settlement',
      'Are you sure you want to delete this settlement?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSettlement(db, editingId);
              Alert.alert('Deleted', 'Settlement removed successfully');
              navigation.goBack();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete settlement');
            }
          }
        }
      ]
    );
  };

  const fetchRecentSettlements = async () => {
    try {
      const data = await getRecentSettlements(db);
      setRecentSettlements(data);
      setFindModalVisible(true);
    } catch (e) {
      console.log('Error fetching recent settlements:', e);
      Alert.alert('Error', 'Failed to fetch previous settlements');
    }
  };

  const loadSettlementForEdit = async (s) => {
    setEditingId(s.id);
    setInitialPayer(s.payer_name);
    setPayer(s.payer_name);
    setReceiver(s.receiver_name);
    setAmount(s.amount.toString());
    setDescription(s.description || '');
    setCurrency(s.currency || 'OMR');
    setDate(new Date(s.date));
    setFindModalVisible(false);
  };

  const getBillKey = (bill) => `${bill.type}_${bill.id}`;

  const toggleBill = (bill) => {
    setSelectedBills(prevSelected => {
      const billKey = getBillKey(bill);
      const isSelected = prevSelected.find(b => getBillKey(b) === billKey);
      
      let newSelected;
      if (isSelected) {
        newSelected = prevSelected.filter(b => getBillKey(b) !== billKey);
      } else {
        newSelected = [...prevSelected, { 
          type: bill.type, 
          id: bill.id, 
          expense_id: bill.expense_id,
          maxAmount: bill.member_share, 
          amountToSettle: bill.member_share.toString() 
        }];
      }
      
      const total = newSelected.reduce((sum, b) => sum + (parseFloat(b.amountToSettle) || 0), 0);
      setAmount(total.toFixed(getCurrencyDecimals(currency, currencies)));
      
      return newSelected;
    });
  };

  const handleBillAmountChange = (billKey, val) => {
    setSelectedBills(prevSelected => {
      const newSelected = prevSelected.map(b => {
        if (getBillKey(b) === billKey) {
          const num = parseFloat(val);
          if (!isNaN(num) && num > b.maxAmount) {
             return { ...b, amountToSettle: b.maxAmount.toString() };
          }
          return { ...b, amountToSettle: val };
        }
        return b;
      });
      
      const total = newSelected.reduce((sum, b) => sum + (parseFloat(b.amountToSettle) || 0), 0);
      setAmount(total.toFixed(getCurrencyDecimals(currency, currencies)));
      
      return newSelected;
    });
  };

  const handleAmountChange = (val) => {
    setAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num)) {
      setSelectedBills(prevSelected => {
        let remaining = num;
        return prevSelected.map(b => {
          const amt = Math.min(b.maxAmount, Math.max(0, remaining));
          remaining -= amt;
          return { ...b, amountToSettle: amt.toString() };
        });
      });
    }
  };

  const autoSelectBills = (cutoffDate) => {
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    const billsToSelect = memberBills.filter(b => b.date && b.date.substring(0, 10) <= cutoffStr);
    const hiddenBillKeys = billsToSelect.map(getBillKey);
    
    setSelectedBills(prevSelected => {
      const visibleSelected = prevSelected.filter(b => !hiddenBillKeys.includes(getBillKey(b)));
      const newHiddenSelected = billsToSelect.map(bill => ({
        type: bill.type, 
        id: bill.id, 
        expense_id: bill.expense_id,
        maxAmount: bill.member_share, 
        amountToSettle: bill.member_share.toString() 
      }));
      const finalSelected = [...visibleSelected, ...newHiddenSelected];
      const total = finalSelected.reduce((sum, b) => sum + (parseFloat(b.amountToSettle) || 0), 0);
      setAmount(total.toFixed(getCurrencyDecimals(currency, currencies)));
      return finalSelected;
    });
  };

  const handleSettleUpToDateChange = (event, selectedDate) => {
    setShowUpToDatePicker(false);
    if (selectedDate) {
      setSettleUpToDate(selectedDate);
      setIsSettleUpToDateEnabled(true);
      autoSelectBills(selectedDate);
    } else {
      if (!settleUpToDate) {
        setIsSettleUpToDateEnabled(false);
      }
    }
  };

  const clearSettleUpToDate = () => {
    setSettleUpToDate(null);
    setIsSettleUpToDateEnabled(false);
    setSelectedBills([]);
    setAmount('0');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{editingId ? 'Edit Settlement' : 'New Settlement'}</Text>
        <TouchableOpacity style={styles.findBtn} onPress={fetchRecentSettlements}>
          <Ionicons name="search" size={20} color={colors.primary} />
          <Text style={styles.findBtnText}>Find</Text>
        </TouchableOpacity>
      </View>

      {editingId && (
        <View style={styles.editBadge}>
          <Ionicons name="create" size={14} color="#fff" />
          <Text style={styles.editBadgeText}>Editing Settlement #{editingId}</Text>
          <TouchableOpacity onPress={() => {
            setEditingId(null); 
            setInitialPayer('');
            setPayer(''); 
            setReceiver(''); 
            setAmount(''); 
            setDescription(''); 
            setDate(new Date());
          }}>
            <Ionicons name="close-circle" size={18} color="#fff" style={{marginLeft: 10}} />
          </TouchableOpacity>
        </View>
      )}
      <Text style={styles.label}>Payer (Who Paid)</Text>
      <View style={styles.memberContainer}>
        {allMembers.map(m => (
          <TouchableOpacity 
            key={m.id} 
            style={[styles.memberChip, payer === m.name && styles.activeChip]}
            onPress={() => setPayer(m.name)}
          >
            <Text style={[styles.chipText, payer === m.name && styles.activeChipText]}>{m.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Receiver (Who Received)</Text>
      <View style={styles.memberContainer}>
        {allMembers.map(m => (
          <TouchableOpacity 
            key={m.id} 
            style={[styles.memberChip, receiver === m.name && styles.activeChip]}
            onPress={() => setReceiver(m.name)}
          >
            <Text style={[styles.chipText, receiver === m.name && styles.activeChipText]}>{m.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <Text style={styles.label}>Currency</Text>
      <View style={styles.memberContainer}>
        {currencies.map(c => (
          <TouchableOpacity 
            key={c.id} 
            style={[styles.memberChip, currency === c.code && styles.activeChip]}
            onPress={() => setCurrency(c.code)}
          >
            <Text style={[styles.chipText, currency === c.code && styles.activeChipText]}>{c.code}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Amount ({currency})</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={handleAmountChange}
        placeholder="0.000"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Description (Optional)</Text>
      <TextInput
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="e.g. November rent balance"
      />

      {memberBills.length > 0 && (
        <>
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.borderLight}}>
            <Switch 
              value={isSettleUpToDateEnabled} 
              onValueChange={(val) => {
                if (val) {
                  setShowUpToDatePicker(true);
                } else {
                  clearSettleUpToDate();
                }
              }}
              trackColor={{ false: '#767577', true: colors.primary }}
              thumbColor={isSettleUpToDateEnabled ? '#f4f3f4' : '#f4f3f4'}
            />
            <Text style={{fontSize: 15, fontWeight: '600', color: colors.text, marginLeft: 10}}>
              {isSettleUpToDateEnabled ? 'Settled up to selected date' : 'Choose Date to Settle up to'}
            </Text>
          </View>

          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 10}}>
            <Text style={{fontSize: 16, fontWeight: 'bold', color: colors.text}}>Select Bills to Settle</Text>
            <TouchableOpacity 
              onPress={() => {
                const visibleBills = memberBills.filter(bill => {
                  if (isSettleUpToDateEnabled && settleUpToDate) {
                    const cutoffStr = settleUpToDate.toISOString().split('T')[0];
                    if (bill.date && bill.date.substring(0, 10) <= cutoffStr) return false;
                  }
                  return true;
                });
                
                const visibleSelectedCount = visibleBills.filter(bill => selectedBills.some(sb => getBillKey(sb) === getBillKey(bill))).length;
                
                if (visibleSelectedCount === visibleBills.length && visibleBills.length > 0) {
                  const visibleKeys = visibleBills.map(getBillKey);
                  const newSelected = selectedBills.filter(sb => !visibleKeys.includes(getBillKey(sb)));
                  setSelectedBills(newSelected);
                  const total = newSelected.reduce((sum, b) => sum + (parseFloat(b.amountToSettle) || 0), 0);
                  setAmount(total.toFixed(getCurrencyDecimals(currency, currencies)));
                } else {
                  const visibleKeys = visibleBills.map(getBillKey);
                  const existingSelectedKeys = selectedBills.map(getBillKey);
                  
                  const newlySelected = visibleBills.filter(b => !existingSelectedKeys.includes(getBillKey(b))).map(bill => ({
                    type: bill.type, 
                    id: bill.id, 
                    expense_id: bill.expense_id,
                    maxAmount: bill.member_share, 
                    amountToSettle: bill.member_share.toString() 
                  }));
                  
                  const newSelected = [...selectedBills, ...newlySelected];
                  setSelectedBills(newSelected);
                  const total = newSelected.reduce((sum, b) => sum + (parseFloat(b.amountToSettle) || 0), 0);
                  setAmount(total.toFixed(getCurrencyDecimals(currency, currencies)));
                }
              }}
            >
              <Text style={{color: colors.primary, fontWeight: 'bold'}}>
                {(() => {
                  const visibleBills = memberBills.filter(bill => {
                    if (isSettleUpToDateEnabled && settleUpToDate) {
                      const cutoffStr = settleUpToDate.toISOString().split('T')[0];
                      if (bill.date && bill.date.substring(0, 10) <= cutoffStr) return false;
                    }
                    return true;
                  });
                  const visibleSelectedCount = visibleBills.filter(bill => selectedBills.some(sb => getBillKey(sb) === getBillKey(bill))).length;
                  return visibleSelectedCount === visibleBills.length && visibleBills.length > 0 ? 'Deselect All' : 'Select All';
                })()}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.billsList}>
            {memberBills.filter(bill => {
              if (isSettleUpToDateEnabled && settleUpToDate) {
                const cutoffStr = settleUpToDate.toISOString().split('T')[0];
                if (bill.date && bill.date.substring(0, 10) <= cutoffStr) return false;
              }
              return true;
            }).map(bill => {
              const billKey = getBillKey(bill);
              const selectedItem = selectedBills.find(b => getBillKey(b) === billKey);
              const isSelected = !!selectedItem;
              return (
                <View key={billKey} style={[styles.billItem, isSelected && styles.activeBillItem]}>
                  <TouchableOpacity style={{flexDirection: 'row', alignItems: 'center', flex: 1}} onPress={() => toggleBill(bill)}>
                    <Ionicons 
                      name={isSelected ? 'checkbox' : 'square-outline'} 
                      size={24} 
                      color={isSelected ? colors.primary : colors.borderLight} 
                    />
                    <View style={styles.billInfo}>
                      <Text style={styles.billDesc}>{bill.item_name || bill.shop_name || 'Expense'}</Text>
                      <Text style={styles.billDate}>{new Date(bill.date).toLocaleDateString()} • {bill.shop_name}</Text>
                    </View>
                    {!isSelected && (
                      <Text style={styles.billAmount}>{formatAmount(bill.member_share, currency, currencies)}</Text>
                    )}
                  </TouchableOpacity>
                  {isSelected && (
                    <TextInput
                      style={{borderWidth: 1, borderColor: colors.borderLight, borderRadius: 5, padding: 8, minWidth: 80, textAlign: 'right', backgroundColor: colors.inputBackground}}
                      keyboardType="numeric"
                      value={selectedItem.amountToSettle}
                      onChangeText={(val) => handleBillAmountChange(billKey, val)}
                    />
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.label}>Date</Text>
      <TouchableOpacity style={styles.dateBox} onPress={() => setShowDatePicker(true)}>
        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
        <Text style={styles.dateBoxText}>{formatDate(date)}</Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) setDate(selectedDate);
          }}
        />
      )}

      {showUpToDatePicker && (
        <DateTimePicker
          value={settleUpToDate || new Date()}
          mode="date"
          display="default"
          onChange={handleSettleUpToDateChange}
        />
      )}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{editingId ? 'Update Settlement' : 'Record Settlement'}</Text>
      </TouchableOpacity>

      {editingId && (
        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.danger, marginTop: 15 }]} onPress={handleDelete}>
          <Text style={styles.saveButtonText}>Delete Settlement</Text>
        </TouchableOpacity>
      )}

      {/* Find Modal */}
      <Modal visible={findModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recent Settlements</Text>
              <TouchableOpacity onPress={() => setFindModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {recentSettlements.map(s => (
                <TouchableOpacity 
                  key={s.id} 
                  style={styles.findItem}
                  onPress={() => loadSettlementForEdit(s)}
                >
                  <View style={{flex: 1}}>
                    <Text style={styles.findItemTitle}>{s.payer_name} → {s.receiver_name}</Text>
                    <Text style={styles.findItemDate}>{new Date(s.date).toDateString()}</Text>
                  </View>
                  <Text style={styles.findItemAmount}>{formatAmount(s.amount, s.currency || currency, currencies)}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.borderLight} />
                </TouchableOpacity>
              ))}
              {recentSettlements.length === 0 && <Text style={{textAlign: 'center', padding: 20, color: colors.textSecondary}}>No recent settlements found.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      
      <View style={{height: 40}} />
    </ScrollView>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: colors.background },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 20, marginBottom: 10, color: colors.text },
  memberContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  memberChip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.borderLight, marginRight: 10, marginBottom: 10 },
  activeChip: { backgroundColor: colors.primary },
  chipText: { color: colors.textSecondary },
  activeChipText: { color: '#fff', fontWeight: 'bold' },
  input: { borderWidth: 1, borderColor: colors.borderLight, borderRadius: 10, padding: 15, fontSize: 18, color: colors.text, backgroundColor: colors.inputBackground },
  dateBox: { flexDirection: 'row', alignItems: 'center', padding: 15, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 10, marginTop: 5, backgroundColor: colors.inputBackground },
  dateBoxText: { marginLeft: 10, fontSize: 16, color: colors.text },
  saveButton: { backgroundColor: colors.success, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 40 },
  saveButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  billsList: {
    marginTop: 5,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    overflow: 'hidden'
  },
  billItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  activeBillItem: {
    backgroundColor: colors.primaryLight
  },
  billInfo: {
    flex: 1,
    marginLeft: 12
  },
  billDesc: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text
  },
  billDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  billAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.primary
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text
  },
  findBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  findBtnText: {
    color: colors.primary,
    marginLeft: 4,
    fontWeight: '600'
  },
  editBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: 8,
    marginBottom: 20
  },
  editBadgeText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: 'bold',
    flex: 1
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text
  },
  findItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight
  },
  findItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text
  },
  findItemDate: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2
  },
  findItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginRight: 10
  }
});
