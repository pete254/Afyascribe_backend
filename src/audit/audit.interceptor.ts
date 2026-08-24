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

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    // Only mutating, authenticated requests are worth a ledger line.
    const user = req.user;
    const firstSeg = String(req.route?.path ?? req.path ?? '')
      .split('/')
      .filter(Boolean)[0];
    if (!WRITE_METHODS.has(method) || !user || (firstSeg && SKIP_PREFIXES.has(firstSeg))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.record(context, req, user, method),
        // Only successful writes are recorded; failures fall through untouched.
      }),
    );
  }

  private record(context: ExecutionContext, req: any, user: any, method: string) {
    try {
      const res = context.switchToHttp().getResponse();
      const routePath: string = req.route?.path ?? req.path ?? '';
      const params: Record<string, string> = req.params ?? {};
      const { action, entityType } = describe(method, routePath, params);

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
      });
    } catch {
      // Never let auditing disrupt the response.
    }
  }
}
