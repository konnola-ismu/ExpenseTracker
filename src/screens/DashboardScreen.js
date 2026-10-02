import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Alert, Image, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { 
  getExpensesWithDetails, getTopItems, getMemberPeriodReport, 
  getOutstandingReport, getAllCurrencies, getDefaultCurrency, getSetting 
} from '../database/db';
import { formatAmount, formatDate } from '../utils/formatters';
import { useTheme } from '../theme/ThemeContext';

export default function DashboardScreen({ navigation }) {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [expenses, setExpenses] = useState([]);
  const [topItems, setTopItems] = useState([]);
  const [topPeriod, setTopPeriod] = useState('weekly');
  const [outstandings, setOutstandings] = useState([]);
  const [consumption, setConsumption] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [activeCurrency, setActiveCurrency] = useState('OMR');
  const [outstandingFilter, setOutstandingFilter] = useState('all'); // 'all', 'pending', 'overpaid', 'zero'
  const [appLogo, setAppLogo] = useState(null);
  const [spendingTab, setSpendingTab] = useState('periodical');
  const [periodFromDate, setPeriodFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [periodToDate, setPeriodToDate] = useState(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [periodicalConsumption, setPeriodicalConsumption] = useState([]);
  const DEFAULT_LOGO = Image.resolveAssetSource(require('../../assets/mik_hub_logo.png')).uri;

  const loadData = useCallback(async () => {
    try {
      const currs = await getAllCurrencies(db);
      setCurrencies(currs);
      
      const logo = await getSetting(db, 'app_logo');
      setAppLogo(logo);
      
      let currToUse = activeCurrency;
      if (!activeCurrency) {
        currToUse = await getDefaultCurrency(db);
        setActiveCurrency(currToUse);
      }

      const data = await getExpensesWithDetails(db, currToUse);
      setExpenses(data);
      
      const top = await getTopItems(db, topPeriod, currToUse);
      setTopItems(top);

      const balances = await getOutstandingReport(db, currToUse);
      setOutstandings(balances);

      const consumptionData = await getMemberPeriodReport(db, null, null, currToUse);
      setConsumption(consumptionData);

      const periodicalData = await getMemberPeriodReport(db, periodFromDate.toISOString(), periodToDate.toISOString(), currToUse);
      setPeriodicalConsumption(periodicalData);

    } catch (e) {
      console.log('Error loading dashboard data:', e);
    }
  }, [db, topPeriod, activeCurrency, periodFromDate, periodToDate]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );



  const renderExpense = ({ item }) => (
    <View style={styles.expenseCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.shopName}>{item.shop_name || 'Generic Shop'}</Text>
        <Text style={styles.amount}>{formatAmount(item.total_amount, item.currency, currencies)} {item.currency}</Text>
      </View>
      <Text style={styles.description}>{item.description || 'No description'}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>{new Date(item.date).toLocaleDateString()}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.split_mode}</Text>
        </View>
      </View>
    </View>
  );

  const renderCurrencySelector = () => (
    <View style={styles.currencyContainer}>
      <Text style={styles.currencyTitle}>Active Currency</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
        {currencies.map(c => (
          <TouchableOpacity 
            key={c.code}
            style={[styles.currencyChip, activeCurrency === c.code && styles.activeCurrencyChip]}
            onPress={() => setActiveCurrency(c.code)}
          >
            <Ionicons 
              name={activeCurrency === c.code ? "checkmark-circle" : "ellipse-outline"} 
              size={16} 
              color={activeCurrency === c.code ? "#fff" : colors.textSecondary} 
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.currencyChipText, activeCurrency === c.code && styles.activeCurrencyChipText]}>{c.code}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContent}>
      <Text style={styles.sectionTitle}>Top 3 Buying Products</Text>
      <View style={styles.periodSelector}>
        {['weekly', 'monthly', 'yearly'].map((p) => (
          <TouchableOpacity 
            key={p} 
            style={[styles.periodTab, topPeriod === p && styles.activePeriodTab]}
            onPress={() => setTopPeriod(p)}
          >
            <Text style={[styles.periodTabText, topPeriod === p && styles.activePeriodTabText]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.topItemsContainer}>
        {topItems.length > 0 ? topItems.map((item, index) => (
          <View key={item.name} style={styles.topItemCard}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>{index + 1}</Text>
            </View>
            <View style={styles.topItemInfo}>
              <Text style={styles.topItemName}>{item.name}</Text>
              <Text style={styles.topItemSub}>{item.count} times bought</Text>
            </View>
            <Text style={styles.topItemPrice}>{formatAmount(item.total_spent, activeCurrency, currencies)} {activeCurrency}</Text>
          </View>
        )) : (
          <Text style={styles.noDataText}>No item data for this period.</Text>
        )}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Outstanding Balances</Text>
      
      <View style={styles.periodSelector}>
        {['all', 'pending', 'overpaid', 'zero'].map((f) => (
          <TouchableOpacity 
            key={f} 
            style={[styles.periodTab, outstandingFilter === f && styles.activePeriodTab]}
            onPress={() => setOutstandingFilter(f)}
          >
            <Text style={[styles.periodTabText, outstandingFilter === f && styles.activePeriodTabText]}>
              {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : f === 'overpaid' ? 'Over Paid' : 'Zero Balance'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.outstandingScroll}>
        {outstandings
          .filter(m => {
            const balance = parseFloat(m.balance.toFixed(3));
            if (outstandingFilter === 'all') return true;
            if (outstandingFilter === 'pending') return balance > 0.0001;
            if (outstandingFilter === 'overpaid') return balance < -0.0001;
            if (outstandingFilter === 'zero') return Math.abs(balance) <= 0.0001;
            return true;
          })
          .map((m) => {
            const balance = parseFloat(m.balance.toFixed(3));
            let statusColor = colors.primary; // Blue for Zero
            let statusLabel = 'Settled';
            if (balance > 0.0001) {
              statusColor = colors.danger; // Red for Pending
              statusLabel = 'Pending';
            } else if (balance < -0.0001) {
              statusColor = colors.success; // Green for Overpaid
              statusLabel = 'Over Paid';
            }

            return (
              <View key={m.member_name} style={[styles.outstandingCard, { borderBottomColor: statusColor }]}>
                <Text style={styles.outstandingName}>{m.member_name}</Text>
                <Text style={[styles.outstandingAmount, { color: statusColor }]}>
                  {formatAmount(Math.abs(balance), activeCurrency, currencies)} {activeCurrency}
                </Text>
                <Text style={styles.outstandingLabel}>{statusLabel}</Text>
              </View>
            );
          })}
        {outstandings.length === 0 && <Text style={styles.noDataText}>No members recorded.</Text>}
        {outstandings.length > 0 && outstandings.filter(m => {
          const balance = parseFloat(m.balance.toFixed(3));
          if (outstandingFilter === 'all') return true;
          if (outstandingFilter === 'pending') return balance > 0.0001;
          if (outstandingFilter === 'overpaid') return balance < -0.0001;
          if (outstandingFilter === 'zero') return Math.abs(balance) <= 0.0001;
          return true;
        }).length === 0 && <Text style={styles.noDataText}>No members in this category.</Text>}
      </ScrollView>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recent Expenses</Text>
    </View>
  );
 
  const renderSummary = () => {
    let chartData = [];
    let totalAmount = 0;
    let titleText = '';
    let maxValue = 0;
    let maxPositive = 0;
    let maxNegative = 0;

    if (spendingTab === 'total') {
      chartData = consumption.map(m => ({ ...m, value: m.total_share || 0 }));
      totalAmount = chartData.reduce((sum, m) => sum + m.value, 0);
      titleText = 'Total Consumption';
    } else if (spendingTab === 'periodical') {
      chartData = periodicalConsumption.map(m => ({ ...m, value: m.total_share || 0 }));
      totalAmount = chartData.reduce((sum, m) => sum + m.value, 0);
      titleText = 'Periodical Consumption';
    } else if (spendingTab === 'outstanding') {
      chartData = outstandings.map(m => ({
        member_name: m.member_name,
        value: m.balance,
        total_share: Math.abs(m.balance)
      }));
      totalAmount = chartData.reduce((sum, m) => sum + Math.abs(m.value), 0);
      maxValue = chartData.length > 0 ? Math.max(...chartData.map(m => Math.abs(m.value))) : 0;
      titleText = 'Outstanding Balance';
    }

    const chartColors = [colors.primary, colors.success, colors.warning, colors.danger, '#AF52DE', '#5856D6', '#FFCC00'];

    return (
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Member Spending Distribution</Text>

        <View style={styles.periodSelector}>
          {['outstanding', 'periodical', 'total'].map(tab => (
            <TouchableOpacity 
              key={tab} 
              style={[styles.periodTab, spendingTab === tab && styles.activePeriodTab]}
              onPress={() => setSpendingTab(tab)}
            >
              <Text style={[styles.periodTabText, spendingTab === tab && styles.activePeriodTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {spendingTab === 'periodical' && (
          <View style={styles.datePickerRow}>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowFromPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.datePickerText}>{formatDate(periodFromDate.toISOString())}</Text>
            </TouchableOpacity>
            <Text style={styles.datePickerDivider}>to</Text>
            <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowToPicker(true)}>
              <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.datePickerText}>{formatDate(periodToDate.toISOString())}</Text>
            </TouchableOpacity>

            {showFromPicker && (
              <DateTimePicker
                value={periodFromDate}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  setShowFromPicker(Platform.OS === 'ios');
                  if (d) setPeriodFromDate(d);
                }}
              />
            )}
            {showToPicker && (
              <DateTimePicker
                value={periodToDate}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  setShowToPicker(Platform.OS === 'ios');
                  if (d) setPeriodToDate(d);
                }}
              />
            )}
          </View>
        )}

        <Text style={styles.summaryTotal}>{formatAmount(totalAmount, activeCurrency, currencies)} {activeCurrency}</Text>
        <Text style={styles.summarySub}>{titleText}</Text>
        
        <View style={styles.chartContainer}>
          {chartData
            .filter(m => spendingTab === 'outstanding' ? Math.abs(m.value) > 0.0001 : m.value > 0)
            .sort((a, b) => spendingTab === 'outstanding' ? Math.abs(b.value) - Math.abs(a.value) : b.value - a.value)
            .map((m, index) => {
              const isOutstanding = spendingTab === 'outstanding';
              const value = m.value;
              const absValue = Math.abs(value);
              const isNegative = value < -0.0001;
              
              const percentage = isOutstanding 
                ? (maxValue > 0 ? (absValue / maxValue) * 100 : 0)
                : (totalAmount > 0 ? (absValue / totalAmount) * 100 : 0);
                
              const color = chartColors[index % chartColors.length];
              
              return (
                <View key={m.member_name} style={[styles.categorySummaryRow, { flexDirection: 'column', alignItems: 'stretch', marginBottom: 16 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <View style={[styles.catInfo, { width: 'auto', flex: 1 }]}>
                      <View style={[styles.avatarBox, { backgroundColor: isOutstanding ? (isNegative ? colors.success + '22' : colors.danger + '22') : color + '22' }]}>
                        <Text style={[styles.avatarText, { color: isOutstanding ? (isNegative ? colors.success : colors.danger) : color }]}>{m.member_name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.catName} numberOfLines={1}>{m.member_name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {!isOutstanding && <Text style={[styles.catPercent, { marginRight: 8 }]}>{percentage.toFixed(0)}%</Text>}
                      <Text style={[styles.catTotal, { width: 'auto', textAlign: 'right' }, isOutstanding && { color: isNegative ? colors.success : colors.danger }]}>
                        {isOutstanding ? (isNegative ? '-' : '+') : ''}{formatAmount(absValue, activeCurrency, currencies)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={[styles.barBackground, { marginHorizontal: 0, height: 8 }]}>
                    <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: isOutstanding ? (isNegative ? colors.success : colors.danger) : color }]} />
                  </View>
                </View>
              );
            })}
          {chartData.filter(m => spendingTab === 'outstanding' ? Math.abs(m.value) > 0.0001 : m.value > 0).length === 0 && (
            <Text style={styles.noDataText}>No data recorded for this selection.</Text>
          )}
        </View>
      </View>
    );
  };

  const handlePlusPress = () => {
    Alert.alert(
      'New Transaction',
      'Choose an action to perform:',
      [
        { text: 'New Bill (Expense)', onPress: () => navigation.navigate('AddExpense') },
        { text: 'Bill against Settlement', onPress: () => navigation.navigate('Settlement') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListHeaderComponent={() => (
          <>
            <View style={styles.dashboardHeader}>
              <View>
                <Text style={styles.welcomeText}>Welcome back,</Text>
                <Text style={styles.appName}>MIK HUB Expense Tracker</Text>
              </View>
              <Image source={{ uri: appLogo || DEFAULT_LOGO }} style={styles.dashboardLogo} />
            </View>
            {renderCurrencySelector()}
            {renderSummary()}
            {renderHeader()}
          </>
        )}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>No expenses yet. Add one!</Text>}
      />
      <TouchableOpacity 
        style={styles.fab} 
        onPress={handlePlusPress}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  welcomeText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  appName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
  },
  dashboardLogo: {
    width: 50,
    height: 50,
    borderRadius: 12,
    resizeMode: 'contain',
  },
  logoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  headerContent: {
    padding: 15,
  },
  currencyContainer: {
    padding: 15,
    paddingBottom: 5,
  },
  currencyTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  currencyScroll: {
    marginBottom: 10,
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: colors.card,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  activeCurrencyChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    elevation: 4,
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  currencyChipText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 15,
  },
  activeCurrencyChipText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 15,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderRadius: 10,
    padding: 4,
    marginBottom: 15,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  activePeriodTab: {
    backgroundColor: colors.card,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  periodTabText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activePeriodTabText: {
    color: colors.primary,
  },
  topItemsContainer: {
    backgroundColor: colors.card,
    borderRadius: 15,
    padding: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  topItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.primary,
  },
  topItemInfo: {
    flex: 1,
  },
  topItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  topItemSub: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  topItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.success,
  },
  outstandingScroll: {
    paddingBottom: 5,
  },
  outstandingCard: {
    backgroundColor: colors.card,
    width: 140,
    padding: 15,
    borderRadius: 15,
    marginRight: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
  },
  outstandingName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 5,
  },
  outstandingAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.primary,
  },
  outstandingLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  expenseCard: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 15,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  shopName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.text,
  },
  amount: {
    fontSize: 17,
    fontWeight: 'bold',
    color: colors.primary,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 10,
  },
  dateText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  fab: {
    position: 'absolute',
    right: 25,
    bottom: 25,
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: colors.textSecondary,
  },
  noDataText: {
    textAlign: 'center',
    paddingVertical: 20,
    color: colors.textSecondary,
    fontSize: 14,
  },
  
  summaryCard: { backgroundColor: colors.card, borderRadius: 20, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  summaryTitle: { fontSize: 16, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  summaryTotal: { fontSize: 32, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginTop: 5 },
  summarySub: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  chartContainer: { marginTop: 10 },
  categorySummaryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  catInfo: { width: 100, flexDirection: 'row', alignItems: 'center' },
  catColorBox: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  avatarBox: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 14, fontWeight: 'bold' },
  catName: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  catPercent: { fontSize: 11, color: colors.textSecondary, marginLeft: 4 },
  barBackground: { flex: 1, height: 8, backgroundColor: colors.borderLight, borderRadius: 4, marginHorizontal: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  catTotal: { fontSize: 13, fontWeight: '700', color: colors.text, width: 60, textAlign: 'right' },
  datePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, marginBottom: 15 },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.inputBackground, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.borderLight },
  datePickerText: { marginLeft: 6, fontSize: 13, color: colors.textSecondary },
  datePickerDivider: { marginHorizontal: 10, color: colors.textSecondary, fontSize: 13 },
});
