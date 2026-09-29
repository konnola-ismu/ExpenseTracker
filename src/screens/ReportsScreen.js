import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, TextInput, Platform, Modal, Image, Switch } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { 
  getBillReport, getDayWiseReport, getMemberPeriodReport, 
  getMemberDetailedBills, getOutstandingReport, getAllCurrencies, 
  getSettlementReport, getAllMembers, getDefaultCurrency, getSetting,
  getMembersOpeningBalances
} from '../database/db';
import { formatDate, formatAmount } from '../utils/formatters';
import { useTheme } from '../theme/ThemeContext';

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [activeTab, setActiveTab] = useState('bill'); // 'bill', 'day', 'member'
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedMember, setSelectedMember] = useState(null);
  const [allMembersSummary, setAllMembersSummary] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState('');
  
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [currencies, setCurrencies] = useState([]);
  const [isMemberModalVisible, setIsMemberModalVisible] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [appLogo, setAppLogo] = useState(null);
  const [showAddress, setShowAddress] = useState(false);
  const [appAddress, setAppAddress] = useState('');
  const DEFAULT_LOGO = Image.resolveAssetSource(require('../../assets/mik_hub_logo.png')).uri;
  const [includeOpeningBalance, setIncludeOpeningBalance] = useState(false);
  const [openingBalances, setOpeningBalances] = useState([]);

  const loadReport = useCallback(async () => {
    try {
      const currs = await getAllCurrencies(db);
      setCurrencies(currs);
      
      const [logo, showAddr, addr] = await Promise.all([
        getSetting(db, 'app_logo'),
        getSetting(db, 'show_address'),
        getSetting(db, 'app_address')
      ]);
      setAppLogo(logo);
      setShowAddress(showAddr === 'true');
      setAppAddress(addr || '');
      
      let currToUse = activeCurrency;
      if (!activeCurrency) {
        currToUse = await getDefaultCurrency(db);
        setActiveCurrency(currToUse);
      }

      let result = [];
      if (activeTab === 'bill') {
        result = await getBillReport(db, fromDate, toDate, currToUse);
        setTotal(result.reduce((sum, item) => sum + (item.total_amount || 0), 0));
      } else if (activeTab === 'day') {
        result = await getDayWiseReport(db, fromDate, toDate, currToUse);
        setTotal(result.reduce((sum, item) => sum + (item.total || 0), 0));
      } else if (activeTab === 'member') {
        const summary = await getMemberPeriodReport(db, fromDate, toDate, currToUse);
        setAllMembersSummary(summary);
        
        let opBalances = [];
        if (includeOpeningBalance && fromDate) {
          opBalances = await getMembersOpeningBalances(db, fromDate, currToUse);
        }
        setOpeningBalances(opBalances);
        
        if (selectedMember) {
          result = await getMemberDetailedBills(db, selectedMember, fromDate, toDate, currToUse);
          setTotal(result.reduce((sum, item) => sum + (item.amount || 0), 0));
        } else {
          result = summary;
          setTotal(result.reduce((sum, item) => sum + (item.total_share || 0), 0));
        }
      } else if (activeTab === 'outstanding') {
        result = await getOutstandingReport(db, currToUse);
        setTotal(result.reduce((sum, item) => sum + (item.balance || 0), 0));
      } else if (activeTab === 'settlement') {
        result = await getSettlementReport(db, fromDate, toDate, selectedMember, currToUse);
        setTotal(result.reduce((sum, item) => sum + (item.amount || 0), 0));
        const membersList = await getAllMembers(db);
        setAllMembersSummary(membersList.map(m => ({ member_name: m.name })));
      }
      setData(result || []);
    } catch (e) {
      console.log('Error loading report:', e);
      Alert.alert('Report Error', 'Failed to load report data. ' + e.message);
    }
  }, [db, activeTab, fromDate, toDate, selectedMember, activeCurrency, includeOpeningBalance]);


  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport])
  );

  const setPeriod = (type) => {
    const today = new Date();
    const to = today.toISOString().split('T')[0];
    let from = '';
    
    if (type === 'today') {
      from = to;
    } else if (type === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      from = d.toISOString().split('T')[0];
    } else if (type === 'month') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      from = d.toISOString().split('T')[0];
    } else {
      from = '';
    }
    
    setFromDate(from);
    setToDate(to);
  };

  const onDateChange = (event, selectedDate, type) => {
    const showSetter = type === 'from' ? setShowFromPicker : setShowToPicker;
    const dateSetter = type === 'from' ? setFromDate : setToDate;
    
    showSetter(Platform.OS === 'ios'); // iOS stays open
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      dateSetter(dateStr);
    }
  };



  const renderItem = ({ item }) => {
    if (activeTab === 'bill' && item.total_amount !== undefined) {
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>{item.shop_name || 'Generic Shop'}</Text>
            <Text style={styles.cardAmount}>{formatAmount(item.total_amount, item.currency, currencies)} {item.currency}</Text>
          </View>
          <Text style={styles.cardSubtitle}>{item.description || 'No description'}</Text>
          <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
        </View>
      );
    } else if (activeTab === 'day' && item.total !== undefined) {
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>{formatDate(item.day)}</Text>
            <Text style={styles.cardAmount}>{formatAmount(item.total, activeCurrency, currencies)} {activeCurrency}</Text>
          </View>
          <Text style={styles.cardSubtitle}>{item.count} bills recorded</Text>
        </View>
      );
    } else if (activeTab === 'member') {
      if (selectedMember && item.amount !== undefined) {
        const isCredit = item.amount < -0.001;
        const isDebit = item.amount > 0.001;
        const statusColor = isCredit ? colors.success : isDebit ? colors.danger : colors.textSecondary;
        
        return (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{item.shop_name || 'Generic Shop'}</Text>
              <Text style={[styles.cardAmount, { color: statusColor }]}>
                {formatAmount(Math.abs(item.amount), activeCurrency, currencies)} {activeCurrency}
              </Text>
            </View>
            <Text style={[styles.cardSubtitle, { color: statusColor, fontWeight: '500' }]}>
              {item.type} {isCredit ? '(Credit)' : isDebit ? '(Debit)' : '(Settled)'}
            </Text>
            <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
          </View>
        );
      } else if (!selectedMember && item.total_share !== undefined) {
        const netBalance = item.balance !== undefined ? item.balance : (item.total_share || 0) - (item.total_paid || 0);
        const statusColor = netBalance < -0.001 ? colors.success : netBalance > 0.001 ? colors.danger : colors.textSecondary;
        const statusLabel = netBalance < -0.001 ? 'Net Credit (Owed)' : netBalance > 0.001 ? 'Net Debit (Owes)' : 'Settled';
        
        return (
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{item.member_name}</Text>
              <Text style={[styles.cardAmount, { color: statusColor }]}>
                {formatAmount(Math.abs(netBalance), activeCurrency, currencies)} {activeCurrency}
              </Text>
            </View>
            <Text style={[styles.cardSubtitle, { fontWeight: '600', color: statusColor }]}>{statusLabel}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: 8 }}>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Consumption: {formatAmount(item.total_share, activeCurrency, currencies)}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Paid: {formatAmount(item.total_paid, activeCurrency, currencies)}</Text>
            </View>
          </View>
        );
      }
    } else if (activeTab === 'outstanding') {
      const isOwed = item.balance < 0;
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>{item.member_name}</Text>
            <Text style={[styles.cardAmount, { color: isOwed ? '#28a745' : '#dc3545' }]}>
              {formatAmount(Math.abs(item.balance), activeCurrency, currencies)} {activeCurrency}
            </Text>
          </View>
          <Text style={styles.cardSubtitle}>
            {isOwed ? 'Is Owed (Credit)' : 'Owes Group (Debit)'}
          </Text>
        </View>
      );
    } else if (activeTab === 'settlement') {
      return (
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>{item.payer_name} → {item.receiver_name}</Text>
            <Text style={styles.cardAmount}>{formatAmount(item.amount, activeCurrency, currencies)} {activeCurrency}</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            {item.description ? `${item.description}` : 'Settlement recorded'}
          </Text>
          <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
        </View>
      );
    }
    return null;
  };

  const exportPDF = async () => {
    try {
      const isMemberDetail = activeTab === 'member' && selectedMember;
      const isMemberSummary = activeTab === 'member' && !selectedMember;
      const isOutstanding = activeTab === 'outstanding';
      const isSettlement = activeTab === 'settlement';
      const title = isMemberDetail ? `Member Ledger - ${selectedMember}` : isOutstanding ? 'Outstanding Balances' : isSettlement ? 'Settlement Report' : `Expense Report - ${activeTab.toUpperCase()}`;
      
      let html = `
        <html>
          <body style="font-family: sans-serif; padding: 20px;">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="${appLogo || DEFAULT_LOGO}" style="max-height: 80px; max-width: 200px; object-fit: contain;" />
              ${showAddress && appAddress ? `
                <div style="margin-top: 10px; color: #666; font-size: 14px; line-height: 1.4; text-align: center;">
                  <p style="margin: 0; white-space: pre-line;">${appAddress}</p>
                </div>
              ` : ''}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2f95dc; padding-bottom: 10px;">
              <h1 style="color: #2f95dc; margin: 0;">${title}</h1>
              <div style="text-align: right;">
                <p style="margin: 0; font-size: 12px; color: #666;">Date Range: ${isOutstanding ? 'Cumulative' : (formatDate(fromDate) || 'All Time') + ' to ' + (formatDate(toDate) || 'Today')}</p>
              </div>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  ${activeTab === 'bill' ? '<th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Bill No</th>' : ''}
                  ${isMemberSummary ? `
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Member Name</th>
                    ${includeOpeningBalance ? '<th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Opening Bal</th>' : ''}
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Total Consumption</th>
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Total Paid</th>
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">${includeOpeningBalance ? 'Closing Balance' : 'Net Balance'}</th>
                  ` : `
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">${isOutstanding ? 'Member Name' : 'Date'}</th>
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">${isOutstanding || isSettlement ? 'Info' : 'Description'}</th>
                    ${isMemberDetail ? '<th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Qty</th>' : ''}
                    <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Amount</th>
                  `}
                </tr>
              </thead>
              <tbody>
      `;
      
      const exportData = [...data].sort((a, b) => {
        const dateA = a.date || a.day;
        const dateB = b.date || b.day;
        if (dateA && dateB) {
          return new Date(dateA).getTime() - new Date(dateB).getTime();
        }
        return 0;
      });
      
      let memberOpeningBalance = 0;
      if (isMemberDetail && includeOpeningBalance && fromDate) {
        const memberOb = openingBalances.find(ob => ob.member_name === selectedMember);
        if (memberOb) {
          memberOpeningBalance = memberOb.balance || 0;
        }
        
        if (memberOpeningBalance !== 0) {
          const isCredit = memberOpeningBalance < -0.001;
          const isDebit = memberOpeningBalance > 0.001;
          const textColor = isCredit ? '#28a745' : isDebit ? '#dc3545' : '#333';
          const prefix = isCredit ? '-' : '';
          const displayAmt = formatAmount(Math.abs(memberOpeningBalance), activeCurrency, currencies);
          
          html += `
            <tr style="background-color: #fcfcfc; font-style: italic;">
              <td style="border: 1px solid #ddd; padding: 10px;">${formatDate(fromDate)}</td>
              <td style="border: 1px solid #ddd; padding: 10px;">Opening Balance</td>
              ${isMemberDetail ? '<td style="border: 1px solid #ddd; padding: 10px; text-align: center;">-</td>' : ''}
              <td style="border: 1px solid #ddd; padding: 10px; text-align: right; color: ${textColor}; font-weight: bold;">${prefix}${displayAmt}</td>
            </tr>
          `;
        }
      }

      exportData.forEach(item => {
        if (isMemberSummary) {
          const bal = item.balance !== undefined ? item.balance : (item.total_share || 0) - (item.total_paid || 0);
          let obAmount = 0;
          if (includeOpeningBalance && fromDate) {
            const obItem = openingBalances.find(ob => ob.member_name === item.member_name);
            if (obItem) obAmount = obItem.balance || 0;
          }
          const closingBal = bal + obAmount;
          
          const balColor = closingBal < -0.001 ? '#28a745' : closingBal > 0.001 ? '#dc3545' : '#333';
          const obColor = obAmount < -0.001 ? '#28a745' : obAmount > 0.001 ? '#dc3545' : '#333';
          
          html += `
            <tr>
              <td style="border: 1px solid #ddd; padding: 10px;">${item.member_name}</td>
              ${includeOpeningBalance ? `
                <td style="border: 1px solid #ddd; padding: 10px; text-align: right; color: ${obColor};">
                  ${obAmount < -0.001 ? '-' : ''}${formatAmount(Math.abs(obAmount), activeCurrency, currencies)}
                </td>
              ` : ''}
              <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${formatAmount(item.total_share, activeCurrency, currencies)}</td>
              <td style="border: 1px solid #ddd; padding: 10px; text-align: right;">${formatAmount(item.total_paid, activeCurrency, currencies)}</td>
              <td style="border: 1px solid #ddd; padding: 10px; text-align: right; color: ${balColor}; font-weight: bold;">
                ${closingBal < -0.001 ? '-' : ''}${formatAmount(Math.abs(closingBal), activeCurrency, currencies)}
              </td>
            </tr>
          `;
          return;
        }

        let dateVal = '';
        let desc = '';
        let qty = isMemberDetail ? '1' : '';
        let amt = 0;
        let isCredit = false;
        let isDebit = false;
        
        if (activeTab === 'bill' && item.total_amount !== undefined) {
          dateVal = formatDate(item.date);
          desc = `${item.shop_name || 'Generic Shop'}${item.description ? ' - ' + item.description : ''}`;
          amt = item.total_amount;
        } else if (activeTab === 'day' && item.total !== undefined) {
          dateVal = formatDate(item.day);
          desc = `${item.count} bills recorded`;
          amt = item.total;
        } else if (activeTab === 'member') {
          if (selectedMember && item.amount !== undefined) {
             dateVal = formatDate(item.date);
             isCredit = item.amount < -0.001;
             isDebit = item.amount > 0.001;
             const statusStr = isCredit ? '(Credit)' : isDebit ? '(Debit)' : '(Settled)';
             desc = `${item.type} ${statusStr} (${item.shop_name || 'Generic Shop'})${item.description ? ' - ' + item.description : ''}`;
             amt = item.amount;
          }
        } else if (activeTab === 'outstanding') {
          dateVal = item.member_name;
          isCredit = item.balance < -0.001;
          isDebit = item.balance > 0.001;
          desc = isCredit ? 'Is Owed (Credit)' : isDebit ? 'Owes Group (Debit)' : 'Settled';
          amt = Math.abs(item.balance);
        } else if (activeTab === 'settlement') {
          dateVal = formatDate(item.date);
          desc = `${item.payer_name} paid to ${item.receiver_name}${item.description ? ' - ' + item.description : ''}`;
          amt = item.amount;
        }
        
        if (desc) {
          const textColor = isCredit ? '#28a745' : isDebit ? '#dc3545' : '#2f95dc';
          const prefix = (isCredit && activeTab !== 'outstanding') ? '-' : '';
          const displayAmt = formatAmount(Math.abs(amt), item.currency || activeCurrency, currencies);
          html += `
            <tr>
              ${activeTab === 'bill' ? `<td style="border: 1px solid #ddd; padding: 10px; text-align: center;">#${item.id || ''}</td>` : ''}
              <td style="border: 1px solid #ddd; padding: 10px;">${dateVal}</td>
              <td style="border: 1px solid #ddd; padding: 10px;">${desc}</td>
              ${isMemberDetail ? `<td style="border: 1px solid #ddd; padding: 10px; text-align: center;">${qty}</td>` : ''}
              <td style="border: 1px solid #ddd; padding: 10px; text-align: right; color: ${textColor}; font-weight: bold;">${prefix}${displayAmt}</td>
            </tr>
          `;
        }
      });
      
      if (isMemberSummary) {
        const totalPaidSum = exportData.reduce((sum, item) => sum + (item.total_paid || 0), 0);
        const totalOb = includeOpeningBalance ? openingBalances.reduce((sum, item) => sum + (item.balance || 0), 0) : 0;
        const totalBalSum = total + totalOb - totalPaidSum;
        const balColor = totalBalSum < -0.001 ? '#28a745' : totalBalSum > 0.001 ? '#dc3545' : '#333';
        html += `
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: right; font-size: 16px;">Total Sum:</td>
                  ${includeOpeningBalance ? `
                    <td style="border: 1px solid #ddd; padding: 12px; text-align: right; color: ${totalOb < -0.001 ? '#28a745' : totalOb > 0.001 ? '#dc3545' : '#333'}; font-size: 16px;">
                      ${totalOb < -0.001 ? '-' : ''}${formatAmount(Math.abs(totalOb), activeCurrency, currencies)}
                    </td>
                  ` : ''}
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: right; color: #2f95dc; font-size: 16px;">${formatAmount(total, activeCurrency, currencies)}</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: right; color: #2f95dc; font-size: 16px;">${formatAmount(totalPaidSum, activeCurrency, currencies)}</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: right; color: ${balColor}; font-size: 18px;">
                    ${totalBalSum < -0.001 ? '-' : ''}${formatAmount(Math.abs(totalBalSum), activeCurrency, currencies)} ${activeCurrency}
                  </td>
                </tr>
              </tbody>
            </table>
        `;
      } else {
        let finalTotal = total;
        if (isMemberDetail && includeOpeningBalance) {
          finalTotal += memberOpeningBalance;
        }
        const isTotalCredit = finalTotal < -0.001;
        const totalColor = (activeTab === 'member' && selectedMember) ? (isTotalCredit ? '#28a745' : finalTotal > 0.001 ? '#dc3545' : '#333') : '#2f95dc';
        const displayTotal = formatAmount(Math.abs(finalTotal), activeCurrency, currencies);
        const totalPrefix = (activeTab === 'member' && selectedMember && isTotalCredit) ? '-' : '';
        html += `
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                  <td colspan="${isMemberDetail ? 3 : (activeTab === 'bill' ? 3 : 2)}" style="border: 1px solid #ddd; padding: 12px; text-align: right; font-size: 16px;">Total Sum:</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: right; color: ${totalColor}; font-size: 18px;">${totalPrefix}${displayTotal} ${activeCurrency}</td>
                </tr>
              </tbody>
            </table>
        `;
      }
      
      html += `
            <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px; font-size: 11px; color: #aaa; text-align: center;">
              This is a computer generated report for Expense Tracker. Generated on ${new Date().toLocaleString()}
            </div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      
      let customFileName = `Expense_Report_${activeTab}_${formatDate(new Date()).replace(/\//g, '-')}`;
      if (activeTab === 'bill' && data.length > 0) {
        const shops = [...new Set(data.map(d => (d.shop_name || 'Shop').replace(/[^a-zA-Z0-9]/g, '')))].slice(0, 2).join('_');
        const billNos = data.map(d => d.id).slice(0, 2).join('_');
        const dateStr = formatDate(data[0].date).replace(/\//g, '-');
        customFileName = `${shops}_${billNos}_${dateStr}`;
        if (data.length > 2) customFileName += `_etc`;
      }
      
      const newUri = `${FileSystem.documentDirectory}${customFileName}_${Date.now()}.pdf`;
      await FileSystem.moveAsync({
        from: uri,
        to: newUri,
      });
      
      await Sharing.shareAsync(newUri);
    } catch (e) {
      console.log('Export error:', e);
      Alert.alert('Export Error', `Failed to generate PDF: ${e.message}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with Logo */}
      <View style={styles.headerWithLogo}>
        <Image source={{ uri: appLogo || DEFAULT_LOGO }} style={styles.logoImage} />
        <Text style={styles.headerTitle}>Reports & Analytics</Text>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{flexGrow: 1}}>
          {['bill', 'day', 'member', 'outstanding', 'settlement'].map(tab => (
            <TouchableOpacity 
              key={tab}
              style={[styles.tabItem, activeTab === tab && styles.activeTabItem, {minWidth: 100}]}
              onPress={() => { setActiveTab(tab); setSelectedMember(null); }}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === 'bill' ? 'Bill-wise' : tab === 'day' ? 'Day-wise' : tab === 'member' ? 'Members' : tab === 'outstanding' ? 'Outstanding' : 'Settlements'}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Period Selectors */}
      {activeTab !== 'outstanding' && (
        <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodRow}>
          <TouchableOpacity style={styles.periodBtn} onPress={() => setPeriod('today')}>
            <Text style={styles.periodBtnText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.periodBtn} onPress={() => setPeriod('week')}>
            <Text style={styles.periodBtnText}>7 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.periodBtn} onPress={() => setPeriod('month')}>
            <Text style={styles.periodBtnText}>30 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.periodBtn} onPress={() => { setFromDate(''); setToDate(''); }}>
            <Text style={styles.periodBtnText}>All Time</Text>
          </TouchableOpacity>
        </ScrollView>
        
        <View style={styles.dateInputRow}>
          <View style={styles.dateInputContainer}>
            <Text style={styles.dateLabel}>From:</Text>
            <TouchableOpacity style={styles.dateBox} onPress={() => setShowFromPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color="#2f95dc" />
              <Text style={styles.dateBoxText}>{formatDate(fromDate)}</Text>
            </TouchableOpacity>
            {showFromPicker && (
              <DateTimePicker
                value={fromDate ? new Date(fromDate) : new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => onDateChange(e, d, 'from')}
              />
            )}
          </View>
          <View style={styles.dateInputContainer}>
            <Text style={styles.dateLabel}>To:</Text>
            <TouchableOpacity style={styles.dateBox} onPress={() => setShowToPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color="#2f95dc" />
              <Text style={styles.dateBoxText}>{formatDate(toDate)}</Text>
            </TouchableOpacity>
            {showToPicker && (
              <DateTimePicker
                value={toDate ? new Date(toDate) : new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => onDateChange(e, d, 'to')}
              />
            )}
            </View>
          </View>
        </View>
      )}

      {/* Member Filter (only in Member and Settlement tab) */}
      {(activeTab === 'member' || activeTab === 'settlement') && (
        <View style={styles.memberFilterSection}>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
            <Text style={{flex: 1, fontSize: 14, fontWeight: 'bold', color: colors.text}}>Filter by Member:</Text>
            <TouchableOpacity 
              style={styles.searchBtn}
              onPress={() => setIsMemberModalVisible(true)}
            >
              <Ionicons name="search" size={18} color="#2f95dc" />
              <Text style={styles.searchBtnText}>Find Member</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberChipScroll}>
            <TouchableOpacity 
              style={[styles.memberChip, !selectedMember && styles.activeMemberChip]}
              onPress={() => setSelectedMember(null)}
            >
              <Text style={[styles.memberChipText, !selectedMember && styles.activeMemberChipText]}>All Members</Text>
            </TouchableOpacity>
            {allMembersSummary.slice(0, 10).map(m => (
              <TouchableOpacity 
                key={m.member_name}
                style={[styles.memberChip, selectedMember === m.member_name && styles.activeMemberChip]}
                onPress={() => setSelectedMember(m.member_name)}
              >
                <Text style={[styles.memberChipText, selectedMember === m.member_name && styles.activeMemberChipText]}>
                  {m.member_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {activeTab === 'member' && (
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingHorizontal: 5}}>
              <Switch 
                value={includeOpeningBalance} 
                onValueChange={setIncludeOpeningBalance} 
                trackColor={{ false: '#767577', true: colors.primary }}
                thumbColor={includeOpeningBalance ? '#f4f3f4' : '#f4f3f4'}
              />
              <Text style={{marginLeft: 10, color: colors.text, fontSize: 13, fontWeight: '500'}}>
                Include Opening Balance (as of {formatDate(fromDate)})
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Member Search Modal */}
      <Modal visible={isMemberModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Find Member</Text>
              <TouchableOpacity onPress={() => setIsMemberModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Search member name..."
              value={memberSearchQuery}
              onChangeText={setMemberSearchQuery}
            />
            <ScrollView style={{maxHeight: 400}}>
              {allMembersSummary
                .filter(m => m.member_name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                .map(m => (
                  <TouchableOpacity 
                    key={m.member_name}
                    style={styles.modalItem}
                    onPress={() => {
                      setSelectedMember(m.member_name);
                      setIsMemberModalVisible(false);
                      setMemberSearchQuery('');
                    }}
                  >
                    <Text style={styles.modalItemText}>{m.member_name}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#ccc" />
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Currency Filter */}
      <View style={styles.currencySection}>
        <Text style={styles.currencyTitle}>Report Currency</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberChipScroll}>
          {currencies.map(c => (
            <TouchableOpacity 
              key={c.code} 
              style={[styles.currencyChip, activeCurrency === c.code && styles.activeCurrencyChip]}
              onPress={() => setActiveCurrency(c.code)}
            >
              <Ionicons 
                name={activeCurrency === c.code ? "checkmark-circle" : "ellipse-outline"} 
                size={14} 
                color={activeCurrency === c.code ? "#fff" : "#999"} 
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.currencyChipText, activeCurrency === c.code && styles.activeCurrencyChipText]}>{c.code}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Summary Header */}
      {(() => {
        let headerLabel = 'Total Amount';
        let headerValueColor = '#2f95dc';
        let displayVal = formatAmount(total, activeCurrency, currencies);
        
        if (activeTab === 'outstanding') {
          headerLabel = 'Net Group Balance';
        } else if (activeTab === 'member' && selectedMember) {
          let displayTotalNum = total;
          if (includeOpeningBalance && fromDate) {
            const memberOb = openingBalances.find(ob => ob.member_name === selectedMember);
            if (memberOb) {
              displayTotalNum += (memberOb.balance || 0);
            }
          }
          const isCredit = displayTotalNum < -0.001;
          const isDebit = displayTotalNum > 0.001;
          headerLabel = isCredit ? `${selectedMember} is Owed (Credit)` : isDebit ? `${selectedMember} Owes (Debit)` : `${selectedMember}'s Balance`;
          headerValueColor = isCredit ? colors.success : isDebit ? colors.danger : colors.textSecondary;
          displayVal = (isCredit ? '-' : '') + formatAmount(Math.abs(displayTotalNum), activeCurrency, currencies);
        }

        return (
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryLabel}>{headerLabel}</Text>
            <Text style={[styles.summaryValue, { color: headerValueColor }]}>{displayVal} {activeCurrency}</Text>
            <TouchableOpacity style={styles.exportBtn} onPress={exportPDF}>
              <Text style={styles.exportBtnText}>Export PDF</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Report List */}
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item, index) => index.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <Text style={styles.emptyText}>No data found for this period.</Text>
          </View>
        }
      />
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWithLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  logoImage: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 12,
    resizeMode: 'contain',
  },
  logoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTabItem: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.primary,
  },
  filterSection: {
    padding: 15,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  periodRow: {
    marginBottom: 15,
  },
  periodBtn: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  periodBtnText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
  },
  dateInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dateInputContainer: {
    flex: 0.48,
  },
  dateLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 4,
    marginLeft: 4,
  },
  dateInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.text,
  },
  dateBox: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBoxText: {
    marginLeft: 8,
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  summaryHeader: {
    backgroundColor: colors.card,
    padding: 20,
    alignItems: 'center',
    marginVertical: 10,
    marginHorizontal: 15,
    borderRadius: 15,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 15,
  },
  exportBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
  },
  exportBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  currencySection: {
    marginHorizontal: 15,
    marginBottom: 10,
    marginTop: 5,
  },
  currencyTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: 5,
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  activeCurrencyChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  currencyChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  activeCurrencyChipText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  memberFilterSection: {
    marginHorizontal: 15,
    marginBottom: 10,
  },
  memberChipScroll: {
    paddingVertical: 5,
  },
  memberChip: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  activeMemberChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  memberChipText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  activeMemberChipText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    flex: 1,
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.success,
    marginLeft: 10,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  cardDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyView: {
    marginTop: 50,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  searchBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    color: colors.text,
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBackground,
  },
  modalItemText: {
    fontSize: 16,
    color: colors.text,
  }
});
