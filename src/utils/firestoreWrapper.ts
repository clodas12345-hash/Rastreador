
import { addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, CollectionReference, DocumentReference } from 'firebase/firestore';
import { isQuotaExceeded, setQuotaExceeded } from './firestoreQuota';

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

// Wrapper for operations
export const safeAddDoc = async (reference: CollectionReference, data: any) => {
    checkQuota();
    try {
        return await addDoc(reference, data);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeSetDoc = async (reference: DocumentReference, data: any, options?: any) => {
    checkQuota();
    try {
        return await setDoc(reference, data, options);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeUpdateDoc = async (reference: DocumentReference, data: any) => {
    checkQuota();
    try {
        return await updateDoc(reference, data);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeDeleteDoc = async (reference: DocumentReference) => {
    checkQuota();
    try {
        return await deleteDoc(reference);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

export const safeGetDoc = async (reference: DocumentReference) => {
    checkQuota();
    try {
        return await getDoc(reference);
    } catch (error: any) {
        if (error.code === 'resource-exhausted') setQuotaExceeded();
        throw error;
    }
}

// ... Additional wrappers can be added as needed
