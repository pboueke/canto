import { useCallback } from 'react';
import { useRouter, useNavigationContainerRef } from 'expo-router';

/**
 * Returns a back function that falls back to navigating home
 * when there is no navigation history (e.g. after a page refresh on web).
 */
export function useSafeBack() {
  const router = useRouter();
  const navRef = useNavigationContainerRef();

  return useCallback(() => {
    if (navRef.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router, navRef]);
}
