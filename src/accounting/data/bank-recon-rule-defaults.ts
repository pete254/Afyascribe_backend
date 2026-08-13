/**
 * Starter categorisation rules for bank reconciliation, seeded on demand so a
 * facility can then edit/extend them. Account codes reference the standard chart
 * of accounts; the seeder only inserts a rule whose account actually exists.
 */
export const DEFAULT_RECON_RULES: {
  pattern: string;
  accountCode: string;
  accountName: string;
  priority: number;
}[] = [
  { pattern: 'bank charge', accountCode: '67001', accountName: 'Bank Charges', priority: 90 },
  { pattern: 'ledger fee', accountCode: '67001', accountName: 'Bank Charges', priority: 85 },
  { pattern: 'commission', accountCode: '67001', accountName: 'Bank Charges', priority: 80 },
  { pattern: 'interest', accountCode: '71001', accountName: 'Interest Income', priority: 80 },
  { pattern: 'kplc', accountCode: '62002', accountName: 'Electricity', priority: 80 },
  { pattern: 'kenya power', accountCode: '62002', accountName: 'Electricity', priority: 80 },
  { pattern: 'safaricom', accountCode: '62004', accountName: 'Internet', priority: 70 },
  { pattern: 'airtel', accountCode: '62004', accountName: 'Internet', priority: 70 },
  { pattern: 'internet', accountCode: '62004', accountName: 'Internet', priority: 60 },
  { pattern: 'telephone', accountCode: '62005', accountName: 'Telephone', priority: 60 },
  { pattern: 'water', accountCode: '62003', accountName: 'Water', priority: 70 },
  { pattern: 'rent', accountCode: '62001', accountName: 'Rent', priority: 70 },
  { pattern: 'fuel', accountCode: '66001', accountName: 'Fuel', priority: 60 },
  { pattern: 'paye', accountCode: '21006', accountName: 'PAYE Payable', priority: 70 },
  { pattern: 'nssf', accountCode: '21007', accountName: 'NSSF Payable', priority: 70 },
  { pattern: 'shif', accountCode: '21008', accountName: 'SHIF Payable', priority: 70 },
  { pattern: 'nhif', accountCode: '21008', accountName: 'SHIF Payable', priority: 65 },
];
