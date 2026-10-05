
import { addDoc, setDoc, updateDoc, deleteDoc, getDoc, onSnapshot, CollectionReference, DocumentReference } from 'firebase/firestore';
import { isQuotaExceeded, setQuotaExceeded } from './firestoreQuota';
import { isFirestoreEnabled } from '../lib/firebase';

// Operation types for handleFirestoreError
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

const checkQuota = () => {
    if (isQuotaExceeded()) {
        throw new Error('Quota limit exceeded. Please try again later.');
    }
}

export const safeOnSnapshot = (
    reference: any,
    onNext: (snapshot: any) => void,
    onError?: (error: any) => void
) => {
    if (!isFirestoreEnabled) {
        return () => {};
    }
    return onSnapshot(reference, onNext, onError);
}

// Wrapper for operations (Active only in APK; no-op in Web Preview)
export const safeAddDoc = async (reference: CollectionReference, data: any) => {
    if (!isFirestoreEnabled) {
        return { id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` } as any;
    }
    checkQuota();
    try {
        return await addDoc(reference, data);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeSetDoc = async (reference: DocumentReference, data: any, options?: any) => {
    if (!isFirestoreEnabled) {
        return;
    }
    checkQuota();
    try {
        return await setDoc(reference, data, options);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeUpdateDoc = async (reference: DocumentReference, data: any) => {
    if (!isFirestoreEnabled) {
        return;
    }
    checkQuota();
    try {
        return await updateDoc(reference, data);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeDeleteDoc = async (reference: DocumentReference) => {
    if (!isFirestoreEnabled) {
        return;
    }
    checkQuota();
    try {
        return await deleteDoc(reference);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeGetDoc = async (reference: DocumentReference) => {
    if (!isFirestoreEnabled) {
        return { exists: () => false, data: () => undefined } as any;
    }
    checkQuota();
    try {
        return await getDoc(reference);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}
