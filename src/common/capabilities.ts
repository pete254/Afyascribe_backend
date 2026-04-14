// NEW FILE: src/common/capabilities.ts
// Central place for all "can this user do X?" logic.
// Replaces hardcoded role checks in guards and controllers.

export type ClinicMode = 'solo' | 'team' | 'multi';

export interface CapabilityContext {
  role:       string;
  isOwner:    boolean;
  clinicMode: ClinicMode;
}

function isSoloOrTeam(ctx: CapabilityContext): boolean {
  return ctx.clinicMode === 'solo' || ctx.clinicMode === 'team';
}

// ── Patient flow ──────────────────────────────────────────────────────────────

/** Who can check a patient in and create a visit */
export function canQueuePatients(ctx: CapabilityContext): boolean {
  if (ctx.role === 'receptionist' || ctx.role === 'facility_admin') return true;
  if (ctx.isOwner) return true;
  if (ctx.role === 'doctor' && isSoloOrTeam(ctx)) return true;
  return false;
}

/** Who can see the full Today's Queue */
export function canViewFullQueue(ctx: CapabilityContext): boolean {
  return canQueuePatients(ctx) || ctx.role === 'nurse';
}

/** Who can cancel visits */
export function canCancelVisit(ctx: CapabilityContext): boolean {
  return canQueuePatients(ctx);
}

/** Who can reassign a visit to another doctor */
export function canReassignVisit(ctx: CapabilityContext): boolean {
  return canQueuePatients(ctx);
}

// ── Triage ────────────────────────────────────────────────────────────────────

/** Who can record triage vitals */
export function canTriage(ctx: CapabilityContext): boolean {
  if (ctx.role === 'nurse' || ctx.role === 'doctor') return true;
  if (ctx.role === 'facility_admin' || ctx.isOwner) return true;
  // In solo/team mode, receptionists can triage too
  if (ctx.role === 'receptionist' && isSoloOrTeam(ctx)) return true;
  return false;
}

// ── Billing ───────────────────────────────────────────────────────────────────

/** Who can collect payments at the billing screen */
export function canCollectPayment(ctx: CapabilityContext): boolean {
  if (ctx.role === 'receptionist' || ctx.role === 'facility_admin') return true;
  if (ctx.isOwner) return true;
  // In solo/team mode, the doctor handles billing themselves
  if (ctx.role === 'doctor' && isSoloOrTeam(ctx)) return true;
  return false;
}

/** Who can add bills to a visit (doctors always can; reception in all modes) */
export function canAddBills(ctx: CapabilityContext): boolean {
  return ctx.role === 'doctor' || canCollectPayment(ctx);
}

// ── Staff management ──────────────────────────────────────────────────────────

/** Who can view and share the invite code */
export function canManageStaff(ctx: CapabilityContext): boolean {
  return ctx.isOwner || ctx.role === 'facility_admin';
}

/** Who can see the Reports screen */
export function canViewReports(ctx: CapabilityContext): boolean {
  return ctx.isOwner || ctx.role === 'facility_admin';
}

/** Who can edit the Service Catalog */
export function canEditCatalog(ctx: CapabilityContext): boolean {
  // In solo/team mode, the owner-doctor manages the catalog
  if (ctx.isOwner) return true;
  if (ctx.role === 'facility_admin') return true;
  // Team mode: any doctor can maintain the catalog
  if (ctx.role === 'doctor' && ctx.clinicMode === 'team') return true;
  return false;
}

// ── HomeScreen card visibility ────────────────────────────────────────────────

export interface HomeScreenCards {
  queuePatient:     boolean;
  todaysQueue:      boolean;
  myQueue:          boolean;
  triageQueue:      boolean;
  onboardPatient:   boolean;
  patientDirectory: boolean;
  newSoapNote:      boolean;
  reports:          boolean;
  serviceCatalog:   boolean;
  ownerCard:        boolean;   // the invite-code / clinic settings card
}

export function getHomeCards(ctx: CapabilityContext): HomeScreenCards {
  const solo = ctx.clinicMode === 'solo';
  const soloOrTeam = isSoloOrTeam(ctx);
  const isDoctor = ctx.role === 'doctor';
  const isNurse = ctx.role === 'nurse';
  const isReception = ctx.role === 'receptionist';

  return {
    // In solo mode the doctor sees everything
    queuePatient:     canQueuePatients(ctx),
    todaysQueue:      canViewFullQueue(ctx),
    myQueue:          isDoctor,
    triageQueue:      canTriage(ctx),
    onboardPatient:   isDoctor || isNurse || isReception || ctx.isOwner,
    patientDirectory: true,   // everyone can see the directory
    newSoapNote:      isDoctor || (isNurse && soloOrTeam),
    reports:          canViewReports(ctx),
    serviceCatalog:   canEditCatalog(ctx),
    ownerCard:        ctx.isOwner,
  };
}