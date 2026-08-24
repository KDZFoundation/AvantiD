import { initializeApp, getApps, getApp, App, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'avanti-2adfd';

  if (credentialsJson && credentialsJson.trim().length > 0) {
    try {
      const serviceAccount = JSON.parse(credentialsJson);
      return initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    } catch (err: any) {
      console.warn(
        `[FirebaseAdmin] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON (${err.message}). Falling back to applicationDefault.`
      );
    }
  }

  // Fallback to Application Default Credentials (e.g. in Cloud Run / GCP runtime)
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

export { adminApp, adminDb };
