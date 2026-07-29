/**
 * AFYAHMIS STANDARD CHART OF ACCOUNTS
 *
 * The seed every facility starts from. It is a flat list of [code, name, parent]
 * rows; the account type and normal balance are derived from the leading digit,
 * and any code ending in "000" is a non-postable header (a rollup node you
 * cannot post directly to). Accumulated-depreciation accounts (16xxx) are the
 * one contra-asset exception — asset type, credit normal balance.
 */

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'cost_of_sales'
  | 'operating_expense'
  | 'other_income'
  | 'other_expense';

export type NormalBalance = 'debit' | 'credit';

export interface CoaRow {
  code: string;
  name: string;
  parent: string | null;
  type: AccountType;
  normalBalance: NormalBalance;
  isPostable: boolean;
}

/** Account type from the leading digit of the code. */
export function accountTypeForCode(code: string): AccountType {
  switch (code[0]) {
    case '1':
      return 'asset';
    case '2':
      return 'liability';
    case '3':
      return 'equity';
    case '4':
      return 'revenue';
    case '5':
      return 'cost_of_sales';
    case '6':
      return 'operating_expense';
    case '7':
      return 'other_income';
    case '8':
      return 'other_expense';
    default:
      return 'asset';
  }
}

/** Debit-normal families vs credit-normal families. */
export function normalBalanceForCode(code: string): NormalBalance {
  // Accumulated depreciation (16xxx) is a contra-asset: credit normal balance.
  if (code.startsWith('16')) return 'credit';
  const type = accountTypeForCode(code);
  const debitNormal: AccountType[] = [
    'asset',
    'cost_of_sales',
    'operating_expense',
    'other_expense',
  ];
  return debitNormal.includes(type) ? 'debit' : 'credit';
}

/** A code ending in 000 is a header (rollup) node; everything else is postable. */
export const isHeaderCode = (code: string) => code.endsWith('000');

/** [code, name, parentCode] — headers first, then their children. */
const RAW: [string, string, string | null][] = [
  // ── 10000 ASSETS ──────────────────────────────────────────────────────────
  ['10000', 'ASSETS', null],
  ['11000', 'Current Assets', '10000'],
  ['11001', 'Cash on Hand', '11000'],
  ['11002', 'Petty Cash', '11000'],
  ['11003', 'Bank - Current Account', '11000'],
  ['11004', 'Bank - Savings Account', '11000'],
  ['11005', 'Mobile Money Account', '11000'],
  ['11006', 'Cash in Transit', '11000'],
  ['11007', 'Short-term Investments', '11000'],
  ['12000', 'Accounts Receivable', '10000'],
  ['12001', 'Patient Receivables', '12000'],
  ['12002', 'Corporate Debtors', '12000'],
  ['12003', 'Insurance Receivables', '12000'],
  ['12004', 'SHA Receivables', '12000'],
  ['12005', 'NHIF Legacy Receivables', '12000'],
  ['12006', 'Doctor Receivables', '12000'],
  ['12007', 'Staff Receivables', '12000'],
  ['12008', 'Other Debtors', '12000'],
  ['13000', 'Inventory', '10000'],
  ['13001', 'Pharmacy Stock', '13000'],
  ['13002', 'Laboratory Reagents', '13000'],
  ['13003', 'Medical Consumables', '13000'],
  ['13004', 'Surgical Supplies', '13000'],
  ['13005', 'Radiology Consumables', '13000'],
  ['13006', 'Dental Supplies', '13000'],
  ['13007', 'Vaccines', '13000'],
  ['13008', 'Blood Bank Inventory', '13000'],
  ['13009', 'Stationery', '13000'],
  ['13010', 'Cleaning Materials', '13000'],
  ['14000', 'Prepayments', '10000'],
  ['14001', 'Rent Prepaid', '14000'],
  ['14002', 'Insurance Prepaid', '14000'],
  ['14003', 'Licenses Prepaid', '14000'],
  ['14004', 'Software Subscriptions', '14000'],
  ['15000', 'Fixed Assets', '10000'],
  ['15001', 'Land', '15000'],
  ['15002', 'Buildings', '15000'],
  ['15003', 'Medical Equipment', '15000'],
  ['15004', 'Laboratory Equipment', '15000'],
  ['15005', 'Radiology Equipment', '15000'],
  ['15006', 'Dental Equipment', '15000'],
  ['15007', 'Furniture', '15000'],
  ['15008', 'Computers', '15000'],
  ['15009', 'Servers', '15000'],
  ['15010', 'Motor Vehicles', '15000'],
  ['15011', 'Ambulances', '15000'],
  ['16000', 'Accumulated Depreciation', '10000'],
  ['16002', 'Accumulated Depreciation - Buildings', '16000'],
  ['16003', 'Accumulated Depreciation - Medical Equipment', '16000'],
  ['16004', 'Accumulated Depreciation - Laboratory Equipment', '16000'],
  ['16005', 'Accumulated Depreciation - Radiology Equipment', '16000'],
  ['16006', 'Accumulated Depreciation - Dental Equipment', '16000'],
  ['16007', 'Accumulated Depreciation - Furniture', '16000'],
  ['16008', 'Accumulated Depreciation - Computers', '16000'],
  ['16010', 'Accumulated Depreciation - Motor Vehicles', '16000'],
  ['16011', 'Accumulated Depreciation - Ambulances', '16000'],

  // ── 20000 LIABILITIES ─────────────────────────────────────────────────────
  ['20000', 'LIABILITIES', null],
  ['21000', 'Current Liabilities', '20000'],
  ['21001', 'Trade Creditors', '21000'],
  ['21002', 'Glenmark Payable', '21000'],
  ['21003', 'Supplier Advances', '21000'],
  ['21004', 'Accrued Expenses', '21000'],
  ['21005', 'Salaries Payable', '21000'],
  ['21006', 'PAYE Payable', '21000'],
  ['21007', 'NSSF Payable', '21000'],
  ['21008', 'SHIF Payable', '21000'],
  ['21009', 'Housing Levy Payable', '21000'],
  ['21010', 'VAT Payable', '21000'],
  ['21011', 'Withholding Tax Payable', '21000'],
  ['22000', 'Loans', '20000'],
  ['22001', 'Bank Loan', '22000'],
  ['22002', 'Director Loan', '22000'],
  ['22003', 'Asset Finance', '22000'],
  ['22004', 'Hire Purchase', '22000'],

  // ── 30000 EQUITY ──────────────────────────────────────────────────────────
  ['30000', 'EQUITY', null],
  ['31000', 'Capital', '30000'],
  ['31001', 'Share Capital', '31000'],
  ['31002', 'Capital Contributions', '31000'],
  ['32000', 'Retained Earnings', '30000'],
  ['32001', 'Retained Earnings', '32000'],
  ['32002', 'Current Year Profit', '32000'],

  // ── 40000 REVENUE ─────────────────────────────────────────────────────────
  ['40000', 'REVENUE', null],
  ['41000', 'Patient Services', '40000'],
  ['41001', 'Consultation Income', '41000'],
  ['41002', 'Emergency Services', '41000'],
  ['41003', 'Inpatient Revenue', '41000'],
  ['41004', 'Outpatient Revenue', '41000'],
  ['42000', 'Pharmacy', '40000'],
  ['42001', 'Pharmacy Sales', '42000'],
  ['42002', 'Oncology Drug Sales', '42000'],
  ['42003', 'OTC Drug Sales', '42000'],
  ['43000', 'Laboratory', '40000'],
  ['43001', 'Laboratory Income', '43000'],
  ['43002', 'Pathology Income', '43000'],
  ['44000', 'Radiology', '40000'],
  ['44001', 'X-ray Income', '44000'],
  ['44002', 'CT Scan Income', '44000'],
  ['44003', 'MRI Income', '44000'],
  ['44004', 'Ultrasound Income', '44000'],
  ['45000', 'Theatre', '40000'],
  ['45001', 'Theatre Charges', '45000'],
  ['45002', 'Anaesthesia Income', '45000'],
  ['46000', 'Maternity', '40000'],
  ['46001', 'Delivery Charges', '46000'],
  ['46002', 'Antenatal Clinic', '46000'],
  ['46003', 'Postnatal Clinic', '46000'],
  ['47000', 'Dental', '40000'],
  ['47001', 'Dental Procedures', '47000'],
  ['48000', 'Physiotherapy', '40000'],
  ['48001', 'Physiotherapy Income', '48000'],
  ['49000', 'Payer Mix', '40000'],
  ['49001', 'SHA Revenue', '49000'],
  ['49002', 'Insurance Revenue', '49000'],
  ['49003', 'Corporate Revenue', '49000'],
  ['49004', 'Cash Patients', '49000'],

  // ── 50000 COST OF SALES ───────────────────────────────────────────────────
  ['50000', 'COST OF SALES', null],
  ['51001', 'Drugs Consumed', '50000'],
  ['51002', 'Medical Consumables', '50000'],
  ['51003', 'Laboratory Reagents', '50000'],
  ['51004', 'Blood Products', '50000'],
  ['51005', 'Surgical Supplies', '50000'],
  ['51006', 'Vaccines', '50000'],
  ['51007', 'Radiology Consumables', '50000'],

  // ── 60000 OPERATING EXPENSES ──────────────────────────────────────────────
  ['60000', 'OPERATING EXPENSES', null],
  ['61000', 'Human Resource', '60000'],
  ['61001', 'Salaries', '61000'],
  ['61002', 'Overtime', '61000'],
  ['61003', 'Leave Pay', '61000'],
  ['61004', 'Staff Welfare', '61000'],
  ['61005', 'Medical Staff Training', '61000'],
  ['62000', 'Administration', '60000'],
  ['62001', 'Rent', '62000'],
  ['62002', 'Electricity', '62000'],
  ['62003', 'Water', '62000'],
  ['62004', 'Internet', '62000'],
  ['62005', 'Telephone', '62000'],
  ['62006', 'Security', '62000'],
  ['62007', 'Cleaning', '62000'],
  ['62008', 'Repairs & Maintenance', '62000'],
  ['63000', 'Marketing', '60000'],
  ['63001', 'Advertising', '63000'],
  ['63002', 'Community Outreach', '63000'],
  ['63003', 'Digital Marketing', '63000'],
  ['64000', 'IT', '60000'],
  ['64001', 'HMIS Maintenance', '64000'],
  ['64002', 'Software Licenses', '64000'],
  ['64003', 'Cloud Hosting', '64000'],
  ['64004', 'Cybersecurity', '64000'],
  ['64005', 'AI Services', '64000'],
  ['65000', 'Compliance', '60000'],
  ['65001', 'Medical Licenses', '65000'],
  ['65002', 'KMPDC Fees', '65000'],
  ['65003', 'Pharmacy Board Fees', '65000'],
  ['65004', 'NEMA Fees', '65000'],
  ['65005', 'Fire Inspection', '65000'],
  ['66000', 'Vehicles', '60000'],
  ['66001', 'Fuel', '66000'],
  ['66002', 'Vehicle Repairs', '66000'],
  ['66003', 'Insurance', '66000'],
  ['67000', 'Financial', '60000'],
  ['67001', 'Bank Charges', '67000'],
  ['67002', 'Audit Fees', '67000'],
  ['67003', 'Legal Fees', '67000'],
  ['67004', 'Consultancy', '67000'],
  ['68000', 'Depreciation', '60000'],
  ['68001', 'Building Depreciation', '68000'],
  ['68002', 'Equipment Depreciation', '68000'],
  ['68003', 'Vehicle Depreciation', '68000'],

  // ── 70000 OTHER INCOME ────────────────────────────────────────────────────
  ['70000', 'OTHER INCOME', null],
  ['71001', 'Interest Income', '70000'],
  ['71002', 'Rental Income', '70000'],
  ['71003', 'Grants', '70000'],
  ['71004', 'Donations', '70000'],
  ['71005', 'Foreign Exchange Gain', '70000'],

  // ── 80000 OTHER EXPENSES ──────────────────────────────────────────────────
  ['80000', 'OTHER EXPENSES', null],
  ['81001', 'Interest Expense', '80000'],
  ['81002', 'Bad Debts', '80000'],
  ['81003', 'Foreign Exchange Loss', '80000'],
  ['81004', 'Asset Disposal Loss', '80000'],
  ['81005', 'Penalties & Fines', '80000'],
];

/** The standard chart, with type / normal balance / postable derived per row. */
export const STANDARD_COA: CoaRow[] = RAW.map(([code, name, parent]) => ({
  code,
  name,
  parent,
  type: accountTypeForCode(code),
  normalBalance: normalBalanceForCode(code),
  isPostable: !isHeaderCode(code),
}));

/**
 * Well-known account codes the auto-posting rules reference by role, so posting
 * logic doesn't hard-code magic strings all over the place.
 */
export const ACCOUNTS = {
  CASH_ON_HAND: '11001',
  BANK_CURRENT: '11003',
  MOBILE_MONEY: '11005',
  PATIENT_RECEIVABLE: '12001',
  INSURANCE_RECEIVABLE: '12003',
  SHA_RECEIVABLE: '12004',
  PHARMACY_STOCK: '13001',
  TRADE_CREDITORS: '21001',
  VAT_PAYABLE: '21010',
  SALARIES_PAYABLE: '21005',
  PAYE_PAYABLE: '21006',
  NSSF_PAYABLE: '21007',
  SHIF_PAYABLE: '21008',
  HOUSING_LEVY_PAYABLE: '21009',
  CONSULTATION_INCOME: '41001',
  PHARMACY_SALES: '42001',
  LAB_INCOME: '43001',
  DRUGS_CONSUMED: '51001',
  SALARIES_EXPENSE: '61001',
} as const;
