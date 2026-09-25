import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Routes we deliberately don't audit: auth (would log sign-in noise) and public
// self-registration. Matched against the first path segment.
const SKIP_PREFIXES = new Set(['auth', 'self-registration']);

/**
 * Resources that hold identifiable patient data. Reading any of these is
 * itself an auditable event: Kenya's Digital Health (Health Information
 * Management Procedures) Regulations, 2025 require "all user actions and data
 * access" to be logged, and who looked at a record is usually the first
 * question an investigation asks.
 *
 * Deliberately a list of what *is* clinical rather than a list of what to
 * skip: a new module added later is not silently exempt — it simply is not
 * logged for reads until someone puts it here, which is a visible omission
 * rather than an invisible one.
 */
const PHI_PREFIXES = new Set([
  'patients',
  'patient-visits',
  'patient-documents',
  'soap-notes',
  'prescriptions',
  'lab',
  'radiology',
  'dental',
  'optical',
  'maternity',
  'immunisation',
  'problems',
  'allergies',
  'family-history',
  'growth',
  'service-orders',
  'inpatient',
  'kardex',
  'transcription',
  'fhir',
  'appointments',
  'billing',
]);

/** Reads of a whole list are logged too, but described as a search. */
const READ_VERB = 'Viewed';

const VERB: Record<string, string> = {
  POST: 'Created',
  PUT: 'Updated',
  PATCH: 'Updated',
  DELETE: 'Deleted',
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const humanize = (s: string) => s.replace(/[-_]/g, ' ');
const isParam = (seg: string) => seg.startsWith(':');
const looksLikeId = (seg: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg) || /^\d+$/.test(seg);

/**
 * Derive a human action label + the entity type/id from the matched route.
 * e.g. PATCH /patient-visits/:id/reopen  → { action: 'Reopen patient visits', ... }
 *      POST  /billing                    → { action: 'Created billing', ... }
 *      DELETE /assets/:id                → { action: 'Deleted assets', ... }
 */
function describe(
  method: string,
  routePath: string,
  params: Record<string, string>,
): { action: string; entityType: string | null } {
  const segs = routePath.split('/').filter(Boolean);
  const entityType = segs[0] ? humanize(segs[0]) : null;
  const last = segs[segs.length - 1];

  // A trailing non-param, non-id segment that isn't the resource itself is an
  // explicit action verb (reopen, collect, waive, seed, complete…).
  if (last && !isParam(last) && segs.length > 1 && last !== segs[0]) {
    return { action: `${cap(humanize(last))}${entityType ? ` ${entityType}` : ''}`, entityType };
  }
  return { action: `${VERB[method] ?? method} ${entityType ?? ''}`.trim(), entityType };
}

/** The patient a route is about, where it names one. */
function patientOf(params: Record<string, string>, routePath: string): string | null {
  if (params.patientId) return params.patientId;
  // `/patients/:id/...` — the id *is* the patient.
  if (/^\/patients\/:id\b/.test(routePath) && params.id) return params.id;
  return null;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    const user = req.user;
    const firstSeg = String(req.route?.path ?? req.path ?? '')
      .split('/')
      .filter(Boolean)[0];

    if (!user || (firstSeg && SKIP_PREFIXES.has(firstSeg))) return next.handle();

    const isWrite = WRITE_METHODS.has(method);
    // A read is auditable when it reaches patient data. Reads of catalogues,
    // price lists and reference data are not, and logging them would bury the
    // lines that matter.
    const isPhiRead = method === 'GET' && !!firstSeg && PHI_PREFIXES.has(firstSeg);
    if (!isWrite && !isPhiRead) return next.handle();

    return next.handle().pipe(
      tap({
        next: () => this.record(context, req, user, method, isWrite ? 'write' : 'read'),
        // Only successful actions are recorded; failures fall through untouched.
      }),
    );
  }

  private record(context: ExecutionContext, req: any, user: any, method: string, category: string) {
    try {
      const res = context.switchToHttp().getResponse();
      const routePath: string = req.route?.path ?? req.path ?? '';
      const params: Record<string, string> = req.params ?? {};
      const { action, entityType } =
        category === 'read'
          ? { action: `${READ_VERB} ${humanize(routePath.split('/').filter(Boolean)[0] ?? '')}`.trim(), entityType: humanize(routePath.split('/').filter(Boolean)[0] ?? '') }
          : describe(method, routePath, params);

      const entityId =
        params.id ??
        params.visitId ??
        params.patientId ??
        Object.values(params).find((v) => typeof v === 'string' && looksLikeId(v)) ??
        null;

      const path = String(req.originalUrl ?? req.url ?? routePath).split('?')[0];
      const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || null;

      void this.audit.log({
        facilityId: user.facilityId ?? null,
        actorId: user.id ?? null,
        actorName: name,
        actorRole: Array.isArray(user.roles) && user.roles.length ? user.roles[0] : user.role ?? null,
        method,
        path,
        action,
        entityType,
        entityId: entityId ?? null,
        statusCode: res?.statusCode ?? null,
        ip: (req.headers?.['x-forwarded-for'] || req.ip || '').toString().split(',')[0] || null,
        category,
        patientId: patientOf(params, routePath),
      });
    } catch {
      // Never let auditing disrupt the response.
    }
  }
}
