import { AsyncLocalStorage } from 'async_hooks';

/**
 * Who is behind the current request.
 *
 * A TypeORM subscriber sees the row changing but not the person changing it —
 * it runs below the HTTP layer, where there is no request to ask. Async local
 * storage carries the actor down to it, so a version can say who wrote it
 * without every service having to pass a user through to the repository.
 */
export interface RequestActor {
  id: string | null;
  name: string | null;
  role: string | null;
  facilityId: string | null;
  /** Why the change was made, where the caller gave a reason. */
  reason?: string | null;
}

const storage = new AsyncLocalStorage<RequestActor>();

export const runWithActor = <T>(actor: RequestActor, fn: () => T): T => storage.run(actor, fn);

export const currentActor = (): RequestActor | null => storage.getStore() ?? null;
