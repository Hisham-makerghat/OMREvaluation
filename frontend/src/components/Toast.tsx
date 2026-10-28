// A short "done" message at the bottom of the screen, e.g. "Answer key saved".
// It is also read out by screen readers.
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IconCheck } from './Icons';

type ShowToast = (message: string) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<ShowToast>(msg => {
    window.clearTimeout(timer.current);
    setMessage(msg);
    timer.current = window.setTimeout(() => setMessage(''), 4500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" role="status"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
        {message && (
          // Taps go through to the button underneath: there is nothing to press in the message.
          <div className="flex max-w-[560px] items-center gap-3 rounded-full bg-heading px-5 py-3 text-[16px] font-semibold text-white shadow-lg">
            <IconCheck className="shrink-0 text-leaf" />
            <span>{message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
