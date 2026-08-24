import { initializeApp, getApps, getApp, App, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import * as fs from 'fs';
import * as path from 'path';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'avanti-2adfd';

  if (credentialsJson && credentialsJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(credentialsJson);

      // 1. Tradycyjny klucz konta usługi (Service Account Key JSON)
      if (parsed.type === 'service_account' && parsed.client_email && parsed.private_key) {
        return initializeApp({
          credential: cert(parsed),
          projectId: parsed.project_id || projectId,
        });
      }

      // 2. Federacja tożsamości obciążeń (Workload Identity Federation / external_account)
      // W przypadku external_account zapisujemy plik konfiguracyjny tymczasowo dla Google ADC
      if (parsed.type === 'external_account') {
        const tempCredPath = path.join('/tmp', 'gcp-workload-identity-cred.json');
        try {
          fs.writeFileSync(tempCredPath, credentialsJson, { encoding: 'utf8', mode: 0o600 });
          process.env.GOOGLE_APPLICATION_CREDENTIALS = tempCredPath;
          return initializeApp({
            credential: applicationDefault(),
            projectId: parsed.project_id || projectId,
          });
        } catch (fileErr: any) {
          console.warn('[FirebaseAdmin] Failed to write temporary WIF credentials file:', fileErr.message);
        }
      }
    } catch (err: any) {
      console.warn(
        `[FirebaseAdmin] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON (${err.message}). Falling back to applicationDefault.`
      );
    }
  }

  // 3. Fallback to Application Default Credentials (Cloud Run runtime / GCE metadata / standard path)
  return initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

const adminApp = getAdminApp();

// Get Firestore instance for the specified database
const dbId = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId;
let adminDb: Firestore;

if (dbId && dbId !== '(default)') {
  try {
    adminDb = getFirestore(adminApp, dbId);
  } catch {
    adminDb = getFirestore(adminApp);
  }
} else {
  adminDb = getFirestore(adminApp);
}

try {
  adminDb.settings({ ignoreUndefinedProperties: true });
} catch {
  // Settings might already be frozen if called earlier
}

export { adminApp, adminDb };
