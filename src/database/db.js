import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export const DATABASE_NAME = 'expenses.db';

export async function initDatabase(db) {
  if (Platform.OS !== 'web') {
    try {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
      `);
    } catch (e) {
      console.warn('Pragma setup failed', e);
    }
  }

  // Migrations for existing tables
  try {
    await db.runAsync('ALTER TABLE currencies ADD COLUMN decimals INTEGER DEFAULT 2');
    await db.runAsync("UPDATE currencies SET decimals = 3 WHERE code = 'OMR'");
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }

  try {
    await db.runAsync('ALTER TABLE master_items ADD COLUMN default_price REAL DEFAULT 0');
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }

  try {
    await db.runAsync('ALTER TABLE settlements ADD COLUMN description TEXT');
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }

  try {
    await db.runAsync("ALTER TABLE settlements ADD COLUMN currency TEXT DEFAULT 'OMR'");
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }

  try {
    await db.runAsync("ALTER TABLE settlements ADD COLUMN settled_up_to_date TEXT");
  } catch (e) {
    // Column already exists or table doesn't exist yet
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS master_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      default_price REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS currencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      decimals INTEGER DEFAULT 2,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT
    );

    -- Migration: Add decimals column if it doesn't exist
    -- Since SQLite doesn't support IF NOT EXISTS in ALTER TABLE, we use a try-catch pattern in the next block or just try it.
    
    INSERT OR IGNORE INTO currencies (code, decimals) VALUES ('OMR', 3), ('INR', 2);
 
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT
    );
 
    INSERT OR IGNORE INTO categories (name, icon, color) VALUES 
      ('Food', 'fast-food', '#FF9500'),
      ('Transport', 'car', '#5856D6'),
      ('Shopping', 'cart', '#FF2D55'),
      ('Health', 'medical', '#34C759'),
      ('Bills', 'flash', '#AF52DE'),
      ('Entertainment', 'game-controller', '#007AFF'),
      ('Others', 'ellipsis-horizontal', '#8E8E93');

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER,
      category_id INTEGER,
      description TEXT,
      total_amount REAL NOT NULL,
      currency TEXT DEFAULT 'OMR',
      date TEXT NOT NULL,
      split_mode TEXT CHECK(split_mode IN ('bill', 'item')) DEFAULT 'bill',
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE SET NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL DEFAULT 1,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS item_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );
 
    INSERT OR IGNORE INTO settings (key, value) VALUES ('default_currency', 'OMR');
    DELETE FROM members WHERE LOWER(name) = 'all';
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payer_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      currency TEXT DEFAULT 'OMR',
      settled_up_to_date TEXT,
      FOREIGN KEY (payer_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expense_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settlement_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL,
      expense_id INTEGER NOT NULL,
      settled_amount REAL NOT NULL DEFAULT 0,
      item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
    );
  `);

  // End migrations block
 
  try {
    await db.execAsync('ALTER TABLE expenses ADD COLUMN category_id INTEGER;');
  } catch (e) {}
}

// Helper methods for fetching and inserting

async function addOrUpdateEntity(db, table, nameField, nameValue, dateIso, extraUpdates = {}, extraInserts = {}) {
  const existing = await db.getFirstAsync(`SELECT * FROM ${table} WHERE ${nameField} = ?`, [nameValue]);
  if (existing) {
    const updateKeys = Object.keys(extraUpdates);
    const updateValues = Object.values(extraUpdates);
    let sql = `UPDATE ${table} SET usage_count = usage_count + 1, last_used_at = ?`;
    if (updateKeys.length > 0) sql += `, ${updateKeys.map(k => `${k} = ?`).join(', ')}`;
    sql += ` WHERE id = ?`;
    await db.runAsync(sql, [dateIso, ...updateValues, existing.id]);
    return existing.id;
  } else {
    const insertKeys = Object.keys(extraInserts);
    const insertValues = Object.values(extraInserts);
    let sql = `INSERT INTO ${table} (${nameField}, usage_count, last_used_at`;
    if (insertKeys.length > 0) sql += `, ${insertKeys.join(', ')}`;
    sql += `) VALUES (?, 1, ?`;
    if (insertKeys.length > 0) sql += `, ${insertKeys.map(() => '?').join(', ')}`;
    sql += `)`;
    const result = await db.runAsync(sql, [nameValue, dateIso, ...insertValues]);
    return result.lastInsertRowId;
  }
}

export async function getRecentShops(db, limit = 10) {
  return await db.getAllAsync('SELECT * FROM shops ORDER BY last_used_at DESC, usage_count DESC LIMIT ?', [limit]);
}

export async function addOrUpdateShop(db, name, dateIso) {
  return await addOrUpdateEntity(db, 'shops', 'name', name, dateIso);
}

export async function getAllMembers(db) {
  return await db.getAllAsync('SELECT * FROM members ORDER BY usage_count DESC, name ASC');
}

export async function addOrUpdateMember(db, name, dateIso) {
  return await addOrUpdateEntity(db, 'members', 'name', name, dateIso);
}

export async function getAllMasterItems(db) {
  return await db.getAllAsync('SELECT * FROM master_items ORDER BY usage_count DESC, name ASC');
}

export async function addOrUpdateMasterItem(db, name, price, dateIso) {
  return await addOrUpdateEntity(db, 'master_items', 'name', name, dateIso, { default_price: price }, { default_price: price });
}

export async function getAllShops(db) {
  return await db.getAllAsync('SELECT * FROM shops ORDER BY name ASC');
}

export async function getAllCurrencies(db) {
  return await db.getAllAsync('SELECT * FROM currencies ORDER BY usage_count DESC, code ASC');
}
 
export async function getAllCategories(db) {
  return await db.getAllAsync('SELECT * FROM categories ORDER BY name ASC');
}

export async function addOrUpdateCurrency(db, code, decimals, dateIso) {
  return await addOrUpdateEntity(db, 'currencies', 'code', code, dateIso, { decimals }, { decimals });
}

export async function updateMaster(db, type, id, name, price = 0) {
  if (type === 'member') {
    await db.runAsync('UPDATE members SET name = ? WHERE id = ?', [name, id]);
  } else if (type === 'shop') {
    await db.runAsync('UPDATE shops SET name = ? WHERE id = ?', [name, id]);
  } else if (type === 'item') {
    await db.runAsync('UPDATE master_items SET name = ?, default_price = ? WHERE id = ?', [name, price, id]);
  } else if (type === 'currency') {
    await db.runAsync('UPDATE currencies SET code = ?, decimals = ? WHERE id = ?', [name, price, id]);
  }
}

export async function deleteMaster(db, type, id) {
  if (type === 'member') {
    const used = await db.getFirstAsync('SELECT 1 FROM expense_splits WHERE member_id = ? UNION SELECT 1 FROM item_splits WHERE member_id = ?', [id, id]);
    if (used) throw new Error('Cannot delete member: It is used in existing expenses.');
    await db.runAsync('DELETE FROM members WHERE id = ?', [id]);
  } else if (type === 'shop') {
    const used = await db.getFirstAsync('SELECT 1 FROM expenses WHERE shop_id = ?', [id]);
    if (used) throw new Error('Cannot delete shop: It is used in existing expenses.');
    await db.runAsync('DELETE FROM shops WHERE id = ?', [id]);
  } else if (type === 'item') {
    const item = await db.getFirstAsync('SELECT name FROM master_items WHERE id = ?', [id]);
    if (item) {
      const used = await db.getFirstAsync('SELECT 1 FROM items WHERE name = ?', [item.name]);
      if (used) throw new Error('Cannot delete item: It is used in existing expenses.');
    }
    await db.runAsync('DELETE FROM master_items WHERE id = ?', [id]);
  } else if (type === 'currency') {
    const curr = await db.getFirstAsync('SELECT code FROM currencies WHERE id = ?', [id]);
    if (curr) {
      const used = await db.getFirstAsync('SELECT 1 FROM expenses WHERE currency = ?', [curr.code]);
      if (used) throw new Error('Cannot delete currency: It is used in existing expenses.');
    }
    await db.runAsync('DELETE FROM currencies WHERE id = ?', [id]);
  }
}

// Advanced functions
export async function addExpense(db, payload) {
  const { shopName, categoryId, description, totalAmount, currency, date, splitMode, splits, items, payers } = payload;
  
  // payload is expected to have:
  // shopName (string)
  // description (string) - new
  // totalAmount (number)
  // currency (string)
  // date (ISO string)
  // splitMode ('bill' | 'item')
  // splits: { memberName: amount }[]  // for bill mode
  // items: { name: string, price: number, splits: { memberName: amount }[] }[] // for item mode

  let shopId = null;
  if (shopName) {
    shopId = await addOrUpdateShop(db, shopName, date);
  }

  // Insert expense
  const expRes = await db.runAsync(
    'INSERT INTO expenses (shop_id, category_id, description, total_amount, currency, date, split_mode) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [shopId, categoryId || null, description || null, totalAmount, currency, date, splitMode]
  );
  const expenseId = expRes.lastInsertRowId;

  if (splitMode === 'bill') {
    for (const split of splits) {
      const memberId = await addOrUpdateMember(db, split.memberName, date);
      await db.runAsync('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)', [
        expenseId, memberId, split.amount
      ]);
    }
  } else if (splitMode === 'item') {
    for (const item of items) {
      const itemRes = await db.runAsync('INSERT INTO items (expense_id, name, price, qty) VALUES (?, ?, ?, ?)', [
        expenseId, item.name, item.price, item.qty || 1
      ]);
      const itemId = itemRes.lastInsertRowId;
      for (const split of item.splits) {
        const memberId = await addOrUpdateMember(db, split.memberName, date);
        await db.runAsync('INSERT INTO item_splits (item_id, member_id, amount) VALUES (?, ?, ?)', [
          itemId, memberId, split.amount
        ]);
      }
    }
  }

  // Insert payers/payments
  if (payers && payers.length > 0) {
    for (const p of payers) {
      const pId = await addOrUpdateMember(db, p.memberName, date);
      await db.runAsync('INSERT INTO expense_payments (expense_id, member_id, amount) VALUES (?, ?, ?)', [
        expenseId, pId, p.amount
      ]);
    }
  }

  return expenseId;
}

export async function deleteExpense(db, id) {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

export async function updateExpense(db, id, payload) {
  const { shopName, description, totalAmount, currency, date, splitMode, splits, items, payers } = payload;
  
  let shopId = null;
  if (shopName) {
    shopId = await addOrUpdateShop(db, shopName, date);
  }

  await db.runAsync(
    'UPDATE expenses SET shop_id = ?, description = ?, total_amount = ?, currency = ?, date = ?, split_mode = ? WHERE id = ?',
    [shopId, description || null, totalAmount, currency, date, splitMode, id]
  );

  await db.runAsync('DELETE FROM expense_splits WHERE expense_id = ?', [id]);
  await db.runAsync('DELETE FROM expense_payments WHERE expense_id = ?', [id]);
  await db.runAsync('DELETE FROM items WHERE expense_id = ?', [id]);

  if (splitMode === 'bill') {
    for (const split of splits) {
      const memberId = await addOrUpdateMember(db, split.memberName, date);
      await db.runAsync('INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (?, ?, ?)', [
        id, memberId, split.amount
      ]);
    }
  } else if (splitMode === 'item') {
    for (const item of items) {
      const itemRes = await db.runAsync('INSERT INTO items (expense_id, name, price, qty) VALUES (?, ?, ?, ?)', [
        id, item.name, item.price, item.qty || 1
      ]);
      const itemId = itemRes.lastInsertRowId;
      for (const split of item.splits) {
        const memberId = await addOrUpdateMember(db, split.memberName, date);
        await db.runAsync('INSERT INTO item_splits (item_id, member_id, amount) VALUES (?, ?, ?)', [
          itemId, memberId, split.amount
        ]);
      }
    }
  }

  // 4. Re-insert payers
  if (payers && payers.length > 0) {
    for (const p of payers) {
      const pId = await addOrUpdateMember(db, p.memberName, date);
      await db.runAsync('INSERT INTO expense_payments (expense_id, member_id, amount) VALUES (?, ?, ?)', [
        id, pId, p.amount
      ]);
    }
  }
}

export async function getExpensesWithDetails(db, currencyCode) {
  const query = `
    SELECT e.*, s.name as shop_name, c.name as category_name, c.icon as category_icon, c.color as category_color
    FROM expenses e
    LEFT JOIN shops s ON e.shop_id = s.id
    LEFT JOIN categories c ON e.category_id = c.id
    WHERE e.currency = ?
    ORDER BY e.date DESC
  `;
  const expenses = await db.getAllAsync(query, [currencyCode]);
  
  // for simplicity, load splits separately or we could use GROUP_CONCAT
  for (let exp of expenses) {
    if (exp.split_mode === 'bill') {
      exp.splits = await db.getAllAsync(`
        SELECT es.amount, m.name as member_name 
        FROM expense_splits es
        JOIN members m ON es.member_id = m.id
        WHERE es.expense_id = ?
      `, [exp.id]);
    } else {
      const items = await db.getAllAsync(`SELECT * FROM items WHERE expense_id = ?`, [exp.id]);
      for (let item of items) {
        item.splits = await db.getAllAsync(`
          SELECT ispl.amount, m.name as member_name 
          FROM item_splits ispl
          JOIN members m ON ispl.member_id = m.id
          WHERE ispl.item_id = ?
        `, [item.id]);
      }
      exp.items = items;
    }
    
    exp.payers = await db.getAllAsync(`
      SELECT ep.amount, m.name as memberName 
      FROM expense_payments ep
      JOIN members m ON ep.member_id = m.id
      WHERE ep.expense_id = ?
    `, [exp.id]);
  }
  return expenses;
}

export async function getBillReport(db, fromDate, toDate, currencyCode) {
  let query = `
    SELECT e.*, s.name as shop_name 
    FROM expenses e
    LEFT JOIN shops s ON e.shop_id = s.id
    WHERE e.currency = ?
  `;
  let params = [currencyCode];
  if (fromDate && toDate) {
    query += ` AND date(e."date") BETWEEN date(?) AND date(?) `;
    params.push(fromDate, toDate);
  }
  query += ` ORDER BY e."date" DESC `;
  return await db.getAllAsync(query, params);
}

export async function getDayWiseReport(db, fromDate, toDate, currencyCode) {
  let query = `
    SELECT date("date") as day, SUM(total_amount) as total, COUNT(*) as count, currency
    FROM expenses
    WHERE currency = ?
  `;
  let params = [currencyCode];
  if (fromDate && toDate) {
    query += ` AND date("date") BETWEEN date(?) AND date(?) `;
    params.push(fromDate, toDate);
  }
  query += ` GROUP BY day, currency ORDER BY day DESC `;
  return await db.getAllAsync(query, params);
}

export async function getMemberPeriodReport(db, fromDate, toDate, currencyCode) {
  let params = [currencyCode, currencyCode, currencyCode];
  let dateFilter = 'WHERE e.currency = ?';
  if (fromDate && toDate) {
    dateFilter = ` WHERE e.currency = ? AND date(e."date") BETWEEN date(?) AND date(?) `;
    params = [currencyCode, fromDate, toDate, currencyCode, fromDate, toDate, currencyCode, fromDate, toDate];
  }

  const query = `
    SELECT member_name, 
           SUM(share_amount) as total_share,
           SUM(paid_amount) as total_paid,
           (SUM(share_amount) - SUM(paid_amount)) as balance
    FROM (
      SELECT m.name as member_name, es.amount as share_amount, 0 as paid_amount
      FROM expense_splits es
      JOIN members m ON es.member_id = m.id
      JOIN expenses e ON es.expense_id = e.id
      ${dateFilter}
      
      UNION ALL
      
      SELECT m.name as member_name, ispl.amount as share_amount, 0 as paid_amount
      FROM item_splits ispl
      JOIN members m ON ispl.member_id = m.id
      JOIN items i ON ispl.item_id = i.id
      JOIN expenses e ON i.expense_id = e.id
      ${dateFilter}

      UNION ALL

      SELECT m.name as member_name, 0 as share_amount, ep.amount as paid_amount
      FROM expense_payments ep
      JOIN members m ON ep.member_id = m.id
      JOIN expenses e ON ep.expense_id = e.id
      ${dateFilter}
    ) AS subquery_alias GROUP BY member_name ORDER BY balance DESC
  `;
  return await db.getAllAsync(query, params);
}

export async function getOutstandingReport(db, currencyCode) {
  const params = [currencyCode, currencyCode, currencyCode, currencyCode, currencyCode];
  const query = `
    SELECT member_name, 
           SUM(share_amount) as total_share,
           SUM(paid_amount) as total_paid,
           (SUM(share_amount) - SUM(paid_amount)) as balance
    FROM (
      -- Consumption
      SELECT m.name as member_name, es.amount as share_amount, 0 as paid_amount
      FROM expense_splits es
      JOIN members m ON es.member_id = m.id
      JOIN expenses e ON es.expense_id = e.id
      WHERE e.currency = ?
      
      UNION ALL
      
      SELECT m.name as member_name, ispl.amount as share_amount, 0 as paid_amount
      FROM item_splits ispl
      JOIN members m ON ispl.member_id = m.id
      JOIN items i ON ispl.item_id = i.id
      JOIN expenses e ON i.expense_id = e.id
      WHERE e.currency = ?

      UNION ALL
      
      -- Settlements Received (Increases debt)
      SELECT m.name as member_name, s.amount as share_amount, 0 as paid_amount
      FROM settlements s
      JOIN members m ON s.receiver_id = m.id
      WHERE s.currency = ?

      UNION ALL

      -- Payments at shop (Decreases debt)
      SELECT m.name as member_name, 0 as share_amount, ep.amount as paid_amount
      FROM expense_payments ep
      JOIN members m ON ep.member_id = m.id
      JOIN expenses e ON ep.expense_id = e.id
      WHERE e.currency = ?

      UNION ALL
      
      -- Settlements Paid (Decreases debt)
      SELECT m.name as member_name, 0 as share_amount, s.amount as paid_amount
      FROM settlements s
      JOIN members m ON s.payer_id = m.id
      WHERE s.currency = ?
    ) AS subquery_alias 
    GROUP BY member_name 
    ORDER BY balance DESC
  `;
  return await db.getAllAsync(query, params);
}

export async function getMembersOpeningBalances(db, beforeDate, currencyCode) {
  if (!beforeDate) return [];
  const params = [currencyCode, beforeDate, currencyCode, beforeDate, currencyCode, beforeDate, currencyCode, beforeDate, currencyCode, beforeDate];
  const query = `
    SELECT member_name, 
           (SUM(share_amount) - SUM(paid_amount)) as balance
    FROM (
      -- Consumption
      SELECT m.name as member_name, es.amount as share_amount, 0 as paid_amount
      FROM expense_splits es
      JOIN members m ON es.member_id = m.id
      JOIN expenses e ON es.expense_id = e.id
      WHERE e.currency = ? AND date(e."date") < date(?)
      
      UNION ALL
      
      SELECT m.name as member_name, ispl.amount as share_amount, 0 as paid_amount
      FROM item_splits ispl
      JOIN members m ON ispl.member_id = m.id
      JOIN items i ON ispl.item_id = i.id
      JOIN expenses e ON i.expense_id = e.id
      WHERE e.currency = ? AND date(e."date") < date(?)

      UNION ALL
      
      -- Settlements Received (Increases debt)
      SELECT m.name as member_name, s.amount as share_amount, 0 as paid_amount
      FROM settlements s
      JOIN members m ON s.receiver_id = m.id
      WHERE s.currency = ? AND date(s."date") < date(?)

      UNION ALL

      -- Payments at shop (Decreases debt)
      SELECT m.name as member_name, 0 as share_amount, ep.amount as paid_amount
      FROM expense_payments ep
      JOIN members m ON ep.member_id = m.id
      JOIN expenses e ON ep.expense_id = e.id
      WHERE e.currency = ? AND date(e."date") < date(?)

      UNION ALL
      
      -- Settlements Paid (Decreases debt)
      SELECT m.name as member_name, 0 as share_amount, s.amount as paid_amount
      FROM settlements s
      JOIN members m ON s.payer_id = m.id
      WHERE s.currency = ? AND date(s."date") < date(?)
    ) AS subquery_alias 
    GROUP BY member_name 
  `;
  return await db.getAllAsync(query, params);
}

export async function getTopItems(db, period, currencyCode) {
  let days = '-7 days';
  if (period === 'monthly') days = '-30 days';
  else if (period === 'yearly') days = '-1 year';

  const query = `
    SELECT i.name, COUNT(*) as count, SUM(i.price) as total_spent
    FROM items i
    JOIN expenses e ON i.expense_id = e.id
    WHERE date(e."date") >= date('now', ?) AND e.currency = ?
    GROUP BY i.name
    ORDER BY count DESC
    LIMIT 3
  `;
  return await db.getAllAsync(query, [days, currencyCode]);
}

export async function getMemberDetailedBills(db, memberName, fromDate, toDate, currencyCode) {
  let params = [];
  let dateFilter = '';
  let sDateFilter = '';
  if (fromDate && toDate) {
    dateFilter = ` AND date(e."date") BETWEEN date(?) AND date(?) `;
    sDateFilter = ` AND date(s."date") BETWEEN date(?) AND date(?) `;
    params = [
      memberName, currencyCode, fromDate, toDate, 
      memberName, currencyCode, fromDate, toDate,
      memberName, currencyCode, fromDate, toDate
    ];
  } else {
    params = [
      memberName, currencyCode, 
      memberName, currencyCode,
      memberName, currencyCode
    ];
  }

  const query = `
    SELECT * FROM (
      SELECT 
        e.id, 
        s.name as shop_name, 
        e.date, 
        (
          COALESCE((SELECT SUM(es.amount) FROM expense_splits es WHERE es.expense_id = e.id AND es.member_id = m.id), 0) +
          COALESCE((SELECT SUM(ispl.amount) FROM item_splits ispl JOIN items i ON ispl.item_id = i.id WHERE i.expense_id = e.id AND ispl.member_id = m.id), 0) -
          COALESCE((SELECT SUM(ep.amount) FROM expense_payments ep WHERE ep.expense_id = e.id AND ep.member_id = m.id), 0)
        ) as amount, 
        e.currency, 
        CASE WHEN e.split_mode = 'bill' THEN 'Bill' ELSE 'Item Split' END as type, 
        e.description
      FROM expenses e
      JOIN members m ON m.name = ?
      LEFT JOIN shops s ON e.shop_id = s.id
      WHERE e.currency = ? ${dateFilter}
        AND (
          EXISTS(SELECT 1 FROM expense_splits es WHERE es.expense_id = e.id AND es.member_id = m.id) OR
          EXISTS(SELECT 1 FROM item_splits ispl JOIN items i ON ispl.item_id = i.id WHERE i.expense_id = e.id AND ispl.member_id = m.id) OR
          EXISTS(SELECT 1 FROM expense_payments ep WHERE ep.expense_id = e.id AND ep.member_id = m.id)
        )
      
      UNION ALL

      SELECT s.id, 'Settlement Paid' as shop_name, s.date, -s.amount as amount, s.currency, 'Paid to ' || r.name as type, s.description
      FROM settlements s
      JOIN members p ON s.payer_id = p.id
      JOIN members r ON s.receiver_id = r.id
      WHERE p.name = ? AND s.currency = ? ${sDateFilter}

      UNION ALL

      SELECT s.id, 'Settlement Rcvd' as shop_name, s.date, s.amount as amount, s.currency, 'Rcvd from ' || p.name as type, s.description
      FROM settlements s
      JOIN members p ON s.payer_id = p.id
      JOIN members r ON s.receiver_id = r.id
      WHERE r.name = ? AND s.currency = ? ${sDateFilter}
    ) AS subquery_alias ORDER BY date DESC
  `;
  return await db.getAllAsync(query, params);
}

export async function getMemberBills(db, memberName, currencyCode, excludeSettlementId = null) {
  let settlementFilter = '';
  const params1 = [memberName];
  if (excludeSettlementId) params1.push(excludeSettlementId);
  params1.push(memberName, currencyCode);
  
  const params2 = [memberName];
  if (excludeSettlementId) params2.push(excludeSettlementId);
  params2.push(memberName, currencyCode);

  if (excludeSettlementId) {
    settlementFilter = ' AND st.id != ? ';
  }

  // Get max settled_up_to_date for this member
  const maxDateRes = await db.getFirstAsync(
    'SELECT MAX(settled_up_to_date) as max_date FROM settlements JOIN members p ON payer_id = p.id WHERE p.name = ?',
    [memberName]
  );
  const cutoffDateStr = maxDateRes && maxDateRes.max_date ? maxDateRes.max_date.substring(0, 10) : null;
  const dateFilter = cutoffDateStr ? ` AND substr(e.date, 1, 10) > '${cutoffDateStr}' ` : '';

  const query = `
    SELECT * FROM (
      SELECT 
        'expense' as split_type,
        e.id as entity_id, 
        e.id as expense_id,
        s.name as shop_name, 
        e.date, 
        e.description as item_name,
        es.amount as member_share,
        (SELECT COALESCE(SUM(sb.settled_amount), 0) 
         FROM settlement_bills sb 
         JOIN settlements st ON sb.settlement_id = st.id 
         JOIN members st_m ON st.payer_id = st_m.id
         WHERE sb.expense_id = e.id AND sb.item_id IS NULL AND st_m.name = ? ${settlementFilter}) as settled_amount
      FROM expense_splits es
      JOIN expenses e ON es.expense_id = e.id
      JOIN members m ON es.member_id = m.id
      LEFT JOIN shops s ON e.shop_id = s.id
      WHERE m.name = ? AND e.currency = ? ${dateFilter}
      
      UNION ALL
      
      SELECT 
        'item' as split_type,
        i.id as entity_id, 
        e.id as expense_id,
        s.name as shop_name, 
        e.date, 
        i.name as item_name,
        ispl.amount as member_share,
        (SELECT COALESCE(SUM(sb.settled_amount), 0) 
         FROM settlement_bills sb 
         JOIN settlements st ON sb.settlement_id = st.id 
         JOIN members st_m ON st.payer_id = st_m.id
         WHERE sb.item_id = i.id AND st_m.name = ? ${settlementFilter}) as settled_amount
      FROM item_splits ispl
      JOIN items i ON ispl.item_id = i.id
      JOIN expenses e ON i.expense_id = e.id
      JOIN members m ON ispl.member_id = m.id
      LEFT JOIN shops s ON e.shop_id = s.id
      WHERE m.name = ? AND e.currency = ? ${dateFilter}
    ) as all_bills
    WHERE (member_share - settled_amount) > 0.01
    ORDER BY date DESC
  `;
  const results = await db.getAllAsync(query, [...params1, ...params2]);
  return results.map(r => ({
    ...r,
    type: r.split_type,
    id: r.entity_id,
    member_share: r.member_share - r.settled_amount
  }));
}

export async function getDefaultCurrency(db) {
  const res = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', ['default_currency']);
  return res ? res.value : 'OMR';
}

export async function setDefaultCurrency(db, code) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['default_currency', code]);
}

export async function getSetting(db, key) {
  const res = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return res ? res.value : null;
}

export async function setSetting(db, key, value) {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}
export async function getSettlementBills(db, settlementId) {
  return await db.getAllAsync(`
    SELECT 
      CASE WHEN item_id IS NOT NULL THEN 'item' ELSE 'expense' END as type,
      COALESCE(item_id, expense_id) as id, 
      expense_id,
      settled_amount as amountToSettle,
      settled_amount as maxAmount
    FROM settlement_bills WHERE settlement_id = ?
  `, [settlementId]);
}

export async function addSettlement(db, payerName, receiverName, amount, date, description = '', currency = 'OMR', selectedBills = [], settledUpToDate = null) {
  const payerId = await addOrUpdateMember(db, payerName, date);
  const receiverId = await addOrUpdateMember(db, receiverName, date);
  
  const result = await db.runAsync(
    'INSERT INTO settlements (payer_id, receiver_id, amount, date, description, currency, settled_up_to_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [payerId, receiverId, amount, date, description, currency, settledUpToDate]
  );
  
  const settlementId = result.lastInsertRowId;
  
  for (const bill of selectedBills) {
    if (bill.amountToSettle > 0) {
      const item_id = bill.type === 'item' ? bill.id : null;
      await db.runAsync('INSERT INTO settlement_bills (settlement_id, expense_id, item_id, settled_amount) VALUES (?, ?, ?, ?)', 
        [settlementId, bill.expense_id, item_id, bill.amountToSettle]);
    }
  }
  
  return settlementId;
}

export async function updateSettlement(db, id, payerName, receiverName, amount, date, description = '', currency = 'OMR', selectedBills = [], settledUpToDate = null) {
  const payerId = await addOrUpdateMember(db, payerName, date);
  const receiverId = await addOrUpdateMember(db, receiverName, date);
  
  await db.runAsync(
    'UPDATE settlements SET payer_id = ?, receiver_id = ?, amount = ?, date = ?, description = ?, currency = ?, settled_up_to_date = ? WHERE id = ?',
    [payerId, receiverId, amount, date, description, currency, settledUpToDate, id]
  );
  
  await db.runAsync('DELETE FROM settlement_bills WHERE settlement_id = ?', [id]);
  
  for (const bill of selectedBills) {
    if (bill.amountToSettle > 0) {
      const item_id = bill.type === 'item' ? bill.id : null;
      await db.runAsync('INSERT INTO settlement_bills (settlement_id, expense_id, item_id, settled_amount) VALUES (?, ?, ?, ?)', 
        [id, bill.expense_id, item_id, bill.amountToSettle]);
    }
  }
  
  return id;
}

export async function deleteSettlement(db, id) {
  return await db.runAsync('DELETE FROM settlements WHERE id = ?', [id]);
}

export async function getRecentSettlements(db, limit = 20) {
  return await db.getAllAsync(`
    SELECT s.*, p.name as payer_name, r.name as receiver_name, s.currency
    FROM settlements s
    JOIN members p ON s.payer_id = p.id
    JOIN members r ON s.receiver_id = r.id
    ORDER BY s.date DESC
    LIMIT ?
  `, [limit]);
}

export async function getSettlementReport(db, fromDate, toDate, memberName = null, currencyCode = 'OMR') {
  let query = `
    SELECT s.*, p.name as payer_name, r.name as receiver_name 
    FROM settlements s
    JOIN members p ON s.payer_id = p.id
    JOIN members r ON s.receiver_id = r.id
    WHERE s.currency = ?
  `;
  const params = [currencyCode];

  if (fromDate && toDate) {
    query += ` AND date(s.date) BETWEEN date(?) AND date(?)`;
    params.push(fromDate, toDate);
  }

  if (memberName) {
    query += ` AND (p.name = ? OR r.name = ?)`;
    params.push(memberName, memberName);
  }

  query += ` ORDER BY s.date DESC`;
  return await db.getAllAsync(query, params);
}
export async function getCategorySpending(db, currencyCode) {
  return await db.getAllAsync(`
    SELECT c.name, c.color, c.icon, SUM(e.total_amount) as total
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    WHERE e.currency = ?
    GROUP BY c.id
    ORDER BY total DESC
  `, [currencyCode]);
}
