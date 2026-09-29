
const QUOTA_EXCEEDED_KEY = 'firestoreQuotaExceeded';
const QUOTA_EXCEEDED_TIMESTAMP_KEY = 'firestoreQuotaExceededTimestamp';

export const isQuotaExceeded = (): boolean => {
  const exceeded = localStorage.getItem(QUOTA_EXCEEDED_KEY);
  const timestamp = localStorage.getItem(QUOTA_EXCEEDED_TIMESTAMP_KEY);
  
  if (exceeded === 'true' && timestamp) {
    const now = Date.now();
    const expiry = parseInt(timestamp, 10) + 24 * 60 * 60 * 1000;
    if (now < expiry) {
      return true;
    } else {
      // Quota limit reset after 24h
      localStorage.removeItem(QUOTA_EXCEEDED_KEY);
      localStorage.removeItem(QUOTA_EXCEEDED_TIMESTAMP_KEY);
    }
  }
  return false;
};

export const setQuotaExceeded = () => {
  localStorage.setItem(QUOTA_EXCEEDED_KEY, 'true');
  localStorage.setItem(QUOTA_EXCEEDED_TIMESTAMP_KEY, Date.now().toString());
};
