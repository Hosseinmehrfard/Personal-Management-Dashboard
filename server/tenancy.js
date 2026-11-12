// Database access boundaries shared across the HTTP handlers.
export const OWNED_TABLES = Object.freeze(['tasks','servers','transactions','installments','holdings','classes','chapters','topics','resources','activities','personal_balances','bank_accounts']);
export function requireOwnedTable(kind){if(!OWNED_TABLES.includes(kind))throw Error('جدول نامعتبر است');return kind}
export function ownerClause(kind, userId, start=1){requireOwnedTable(kind);if(typeof userId!=='string'||!userId)throw Error('شناسه کاربر نامعتبر است');return {sql:`user_id=$${start}`,args:[userId]}}
export function canManageGlobal(role){return role==='admin'}
export function canAccessRow(row,userId){return Boolean(row&&row.user_id===userId)}
export function currencyVisible(preference){return preference!==false}
