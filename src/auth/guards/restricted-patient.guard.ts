import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { EmergencyAccessService } from '../emergency-access.service';

/**
 * Keeps a restricted record shut until someone says why they need it.
 *
 * Applied globally and keyed off the patient named in the route, so a module
 * added later is covered without anyone remembering to protect it. Routes that
 * name no patient are not the concern here — reading a whole list is governed
 * by role, and the audit ledger records it either way.
 */
@Injectable()
export class RestrictedPatientGuard implements CanActivate {
  constructor(private readonly emergency: EmergencyAccessService) {}

  private patientOf(req: {
    params?: Record<string, string>;
    route?: { path?: string };
  }): string | null {
    const params = req.params ?? {};
    if (params.patientId) return params.patientId;
    // `/patients/:id/...` — the id is the patient.
    if (/^\/patients\/:id\b/.test(String(req.route?.path ?? '')) && params.id) return params.id;
    return null;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.facilityId) return true;

    const patientId = this.patientOf(req);
    if (!patientId) return true;

    // Administrators manage the flag itself, and the break-glass endpoints
    // must stay reachable or the lock could never be opened.
    const path = String(req.route?.path ?? '');
    if (path.includes('emergency-access')) return true;

    if (!(await this.emergency.isRestricted(user.facilityId, patientId))) return true;

    const grant = await this.emergency.activeGrant(user.facilityId, patientId, user.id);
    if (grant) {
      // Carry it on the request so the audit line can say the record was
      // reached under break-glass rather than in the ordinary way.
      req.emergencyAccess = grant;
      return true;
    }

    this.emergency.refuse(patientId);
  }
}
