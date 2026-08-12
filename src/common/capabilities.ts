/**
 * The functions ("capabilities") that can be granted or denied per user on top
 * of their roles. `defaultRoles` are the roles that grant the capability by
 * default — an owner/facility_admin always has everything. A per-user override
 * (allow/deny) wins over the default.
 *
 * Kept in step with the web's data/capabilities.ts by hand.
 */
export const CAPABILITY_DEFAULTS: Record<string, string[]> = {
  collect_payment: ['receptionist', 'cashier', 'doctor', 'nurse', 'pharmacist'],
  waive_bill: [], // admin/owner only
  view_unpaid_bills: ['receptionist', 'cashier'],
  view_reports: [], // admin/owner only
  write_notes: ['doctor', 'nurse'],
  order_lab: ['doctor', 'nurse'],
  run_lab: ['doctor', 'nurse', 'lab_technician'],
  manage_lab_catalog: ['lab_technician'],
  dispense_drugs: ['pharmacist'],
  triage: ['doctor', 'nurse'],
  complete_visit: ['doctor', 'nurse'],
  cancel_visit: ['receptionist'],
  book_appointment: ['doctor', 'nurse'],
  edit_patient: ['doctor', 'nurse', 'receptionist'],
  edit_catalog: ['doctor', 'nurse', 'receptionist'],
  manage_schemes: [],
  manage_stock: ['accountant', 'pharmacist'],
  manage_ledger: ['accountant'],
  do_procurement: ['procurement_officer', 'accountant'],
  run_payroll: ['hr_manager', 'accountant'],
};

interface CapUser {
  role?: string;
  roles?: string[];
  isOwner?: boolean;
  permissionOverrides?: Record<string, boolean> | null;
}

const rolesOf = (u: CapUser): string[] =>
  Array.isArray(u.roles) && u.roles.length ? u.roles : u.role ? [u.role] : [];

const isAdminOrOwner = (u: CapUser): boolean =>
  u.isOwner === true || rolesOf(u).some((r) => r === 'facility_admin' || r === 'super_admin');

/**
 * Whether a user may use a capability: owners/admins always may; otherwise a
 * per-user override wins, falling back to whether any of the user's roles
 * grants it by default.
 */
export function hasCapability(user: CapUser, key: string): boolean {
  if (isAdminOrOwner(user)) return true;
  const override = user.permissionOverrides?.[key];
  if (typeof override === 'boolean') return override;
  const defaults = CAPABILITY_DEFAULTS[key] ?? [];
  return rolesOf(user).some((r) => defaults.includes(r));
}
