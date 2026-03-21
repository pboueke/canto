import { renderHook, act } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useNavigationContainerRef: () => ({ canGoBack: mockCanGoBack }),
}));

import { useSafeBack } from '../useSafeBack';

describe('useSafeBack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls router.back() when canGoBack returns true', () => {
    mockCanGoBack.mockReturnValue(true);
    const { result } = renderHook(() => useSafeBack());

    act(() => {
      result.current();
    });

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('calls router.replace("/") when canGoBack returns false', () => {
    mockCanGoBack.mockReturnValue(false);
    const { result } = renderHook(() => useSafeBack());

    act(() => {
      result.current();
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
