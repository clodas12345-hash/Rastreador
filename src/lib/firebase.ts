import { initializeApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore, disableNetwork } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { setQuotaExceeded } from "../utils/firestoreQuota";
import firebaseAppletConfig from "../../firebase-applet-config.json";

export const isFirestoreEnabled = Capacitor.isNativePlatform();

let app: FirebaseApp | null = null;

const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
};

function getFirebase() {
  if (!app) {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error("Firebase configuration is missing");
    }
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export const db = getFirestore(getFirebase(), firebaseAppletConfig.firestoreDatabaseId || "(default)");
export const auth = getAuth(getFirebase());

// Disconnect Web Preview from Firestore database; keep only the native APK connected
if (!isFirestoreEnabled) {
  disableNetwork(db).catch(() => {});
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

let quotaExceededNotified = false;

export function isFirestoreQuotaExceeded(): boolean {
  return quotaExceededNotified;
}


export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isQuota = errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('quota metric');

  if (isQuota) {
    setQuotaExceeded();
    if (!quotaExceededNotified) {
      quotaExceededNotified = true;
      console.warn(
        '⚠️ Limite de cota diária do Firestore atingido. O aplicativo está operando em modo de cache/estado local contínuo.',
        'A cota será redefinida automaticamente nas próximas 24h pelo Firebase Spark Tier.'
      );
    }
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

/**
 * Recursively cleans an object or array for Firestore:
 * - Removes keys with `undefined` values (Firestore throws on undefined)
 * - Converts complex nested values safely
 */
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }
  if (Array.isArray(data)) {
    return data.map(item => cleanFirestoreData(item)).filter(item => item !== undefined) as any;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        res[key] = cleanFirestoreData(value);
      }
    }
    return res as any;
  }
  return data;
}

