import { ImpositionJob } from '@/types/imposition';
import { adminDb } from './firebase-admin';
import firebaseConfig from '../firebase-applet-config.json';
import { PRESETS } from './presets';

// Global in-memory fallback and caching store (preserved across module reloads in Node process)
const globalJobStore = globalThis as unknown as {
  __POD_IMPOSITION_MEMORY_JOBS__?: Map<string, ImpositionJob>;
  __POD_FIRESTORE_QUOTA_EXCEEDED__?: boolean;
};

if (!globalJobStore.__POD_IMPOSITION_MEMORY_JOBS__) {
  globalJobStore.__POD_IMPOSITION_MEMORY_JOBS__ = new Map<string, ImpositionJob>();
}

const memoryJobs = globalJobStore.__POD_IMPOSITION_MEMORY_JOBS__;
let isFirestoreQuotaExceeded = globalJobStore.__POD_FIRESTORE_QUOTA_EXCEEDED__ || false;
let lastQuotaCheckTime = 0;
let isStoreInitialized = false;
const isNodeTestRuntime = process.env.NODE_TEST_CONTEXT !== undefined;

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'avanti-2adfd';
export const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || 'ai-studio-podimpositionapi-cd763197-25ef-4268-a1c7-f11afc442ec5';
export const FIREBASE_UPGRADE_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

async function seedInitialJobsIfEmpty() {
  if (memoryJobs.size > 0) return;

  try {
    const { runInternalLayoutEngine } = await import('./imposition-engine');
    const baseTime = Date.now();
    PRESETS.forEach((preset, idx) => {
      const jobId = `job_preset_${preset.id.replace(/-/g, '_')}`;
      if (!memoryJobs.has(jobId)) {
        const createdAt = new Date(baseTime - (idx + 1) * 3600000).toISOString();
        const result = runInternalLayoutEngine(jobId, preset.payload, baseTime);
        const job: ImpositionJob = {
          id: jobId,
          name: preset.payload.name || preset.name,
          workflow: preset.payload.workflow,
          device_type: preset.payload.device_type,
          sheet: preset.payload.sheet,
          orders: preset.payload.orders,
          pdf_standard: preset.payload.pdf_standard,
          status: 'COMPLETED',
          created_at: createdAt,
          started_at: createdAt,
          completed_at: createdAt,
          updated_at: createdAt,
          result: result,
        };
        memoryJobs.set(jobId, job);
      }
    });
  } catch (seedErr) {
    console.warn('[JobStore] Error seeding default jobs:', seedErr);
  }
}

// Pre-seed asynchronously on module load
seedInitialJobsIfEmpty();

function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = err.code;
  return (
    code === 8 ||
    code === 'RESOURCE_EXHAUSTED' ||
    msg.includes('resource_exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily read units')
  );
}

function markQuotaExceeded(exceeded: boolean) {
  isFirestoreQuotaExceeded = exceeded;
  if (globalJobStore) {
    globalJobStore.__POD_FIRESTORE_QUOTA_EXCEEDED__ = exceeded;
  }
}

export function isQuotaCurrentlyExceeded(): boolean {
  return isFirestoreQuotaExceeded || Boolean(globalJobStore.__POD_FIRESTORE_QUOTA_EXCEEDED__);
}

export function getQuotaDetails() {
  return {
    isExceeded: isFirestoreQuotaExceeded,
    projectId: FIREBASE_PROJECT_ID,
    databaseId: FIRESTORE_DATABASE_ID,
    upgradeUrl: FIREBASE_UPGRADE_URL,
    message: isFirestoreQuotaExceeded
      ? "Przekroczono darmowy dzienny limit odczytów Firestore (Free daily read units). System automatycznie przełączył się na bufor pamięciowy (In-Memory Fallback Engine). Możesz zaktualizować plan bazy w konsoli Firebase."
      : null,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Firestore operation timed out')), timeoutMs)),
  ]);
}

/**
 * Saves or updates a job in memory and attempts to persist to Firestore.
 */
export async function saveJobToStore(job: ImpositionJob): Promise<void> {
  memoryJobs.set(job.id, { ...job });

  if (isNodeTestRuntime || isFirestoreQuotaExceeded || Boolean(globalJobStore.__POD_FIRESTORE_QUOTA_EXCEEDED__)) {
    return;
  }

  try {
    const docRef = adminDb.collection('imposition_jobs').doc(job.id);
    await withTimeout(docRef.set(job), 2000);
    markQuotaExceeded(false);
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded(true);
      console.warn(`[JobStore] Firestore Quota Exceeded on set (${job.id}). Persisted in memory store.`);
    } else {
      console.error(`[JobStore] Firestore set error for ${job.id}:`, err?.message || err);
    }
  }
}

/**
 * Updates partial fields for a job in memory and attempts update in Firestore.
 */
export async function updateJobInStore(jobId: string, updates: Partial<ImpositionJob>): Promise<void> {
  const existing = memoryJobs.get(jobId);
  if (existing) {
    memoryJobs.set(jobId, { ...existing, ...updates });
  } else {
    memoryJobs.set(jobId, { id: jobId, ...updates } as ImpositionJob);
  }

  if (isNodeTestRuntime || isFirestoreQuotaExceeded || Boolean(globalJobStore.__POD_FIRESTORE_QUOTA_EXCEEDED__)) {
    return;
  }

  try {
    const docRef = adminDb.collection('imposition_jobs').doc(jobId);
    await withTimeout(docRef.set(updates, { merge: true }), 2000);
    markQuotaExceeded(false);
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded(true);
      console.warn(`[JobStore] Firestore Quota Exceeded on update (${jobId}). Updated in memory store.`);
    } else {
      console.error(`[JobStore] Firestore update error for ${jobId}:`, err?.message || err);
    }
  }
}

/**
 * Retrieves a single job by ID (from memory or Firestore).
 */
export async function getJobFromStore(jobId: string): Promise<ImpositionJob | null> {
  const memJob = memoryJobs.get(jobId);
  if (memJob && (memJob.status === 'COMPLETED' || memJob.result)) {
    return memJob;
  }

  // If memory has the job, return it first if quota exceeded or to avoid stale overwrite
  if (memJob && (isFirestoreQuotaExceeded || Boolean(globalJobStore.__POD_FIRESTORE_QUOTA_EXCEEDED__))) {
    return memJob;
  }

  try {
    const docRef = adminDb.collection('imposition_jobs').doc(jobId);
    const doc = await withTimeout(docRef.get(), 2000);
    if (doc.exists) {
      const data = doc.data() as ImpositionJob;
      // Never overwrite memory if memory has a more advanced state or has result
      if (!memJob || (!memJob.result && data.result)) {
        memoryJobs.set(jobId, data);
        return data;
      }
      return memJob || data;
    }
  } catch (err: any) {
    if (isQuotaError(err)) {
      markQuotaExceeded(true);
      console.warn(`[JobStore] Firestore Quota Exceeded on get (${jobId}). Returning from memory store.`);
    } else {
      console.error(`[JobStore] Firestore get error for ${jobId}:`, err?.message || err);
    }
  }

  return memoryJobs.get(jobId) || null;
}

/**
 * Lists jobs with filtering, using Firestore with instant fallback to In-Memory store.
 */
export async function listJobsFromStore(filters: {
  status?: string | null;
  workflow?: string | null;
  limit?: number;
}): Promise<{ jobs: ImpositionJob[]; total: number; isQuotaExceeded: boolean; quotaInfo: ReturnType<typeof getQuotaDetails> }> {
  const limitParam = filters.limit || 50;
  const now = Date.now();

  // Retry Firestore query at most once every 60 seconds if quota was exceeded
  const shouldTryFirestore = !isFirestoreQuotaExceeded || (now - lastQuotaCheckTime > 60000);

  if (shouldTryFirestore) {
    lastQuotaCheckTime = now;
    try {
      let query: FirebaseFirestore.Query = adminDb.collection('imposition_jobs');

      if (filters.status && filters.status !== 'ALL') {
        query = query.where('status', '==', filters.status);
      }
      if (filters.workflow && filters.workflow !== 'ALL') {
        query = query.where('workflow', '==', filters.workflow);
      }

      try {
        query = query.orderBy('created_at', 'desc').limit(limitParam);
      } catch {
        query = query.limit(limitParam);
      }

      let snapshot: FirebaseFirestore.QuerySnapshot;
      try {
        snapshot = await query.get();
      } catch {
        snapshot = await adminDb.collection('imposition_jobs').limit(limitParam).get();
      }

      const firestoreJobs: ImpositionJob[] = [];
      snapshot.forEach((doc) => {
        const item = doc.data() as ImpositionJob;
        firestoreJobs.push(item);
        memoryJobs.set(item.id, item);
      });

      firestoreJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      isFirestoreQuotaExceeded = false;

      return {
        jobs: firestoreJobs,
        total: firestoreJobs.length,
        isQuotaExceeded: false,
        quotaInfo: getQuotaDetails(),
      };
    } catch (err: any) {
      if (isQuotaError(err)) {
        isFirestoreQuotaExceeded = true;
        console.warn('[JobStore] Firestore quota exceeded during list query. Falling back seamlessly to memory store.');
      } else {
        console.error('[JobStore] Firestore list error:', err);
      }
    }
  }

  if (memoryJobs.size === 0) {
    await seedInitialJobsIfEmpty();
  }

  // Fallback: return from in-memory store
  let allMemJobs = Array.from(memoryJobs.values());

  if (filters.status && filters.status !== 'ALL') {
    allMemJobs = allMemJobs.filter((j) => j.status === filters.status);
  }
  if (filters.workflow && filters.workflow !== 'ALL') {
    allMemJobs = allMemJobs.filter((j) => j.workflow === filters.workflow);
  }

  allMemJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const sliced = allMemJobs.slice(0, limitParam);

  return {
    jobs: sliced,
    total: sliced.length,
    isQuotaExceeded: isFirestoreQuotaExceeded,
    quotaInfo: getQuotaDetails(),
  };
}
