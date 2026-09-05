import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './features/auth/AuthProvider'
import { ThemeProvider } from './features/settings/ThemeProvider'
import { ToastProvider } from './components/common/ToastProvider'
import ErrorBoundary from './components/common/ErrorBoundary'
import GlobalErrorNotifier from './components/common/GlobalErrorNotifier'
import RealtimeSync from './features/realtime/RealtimeSync'
import AppRoutes from './routes/AppRoutes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider>
            <ToastProvider>
              <GlobalErrorNotifier />
              <AuthProvider>
                <RealtimeSync />
                <AppRoutes />
              </AuthProvider>
            </ToastProvider>
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
