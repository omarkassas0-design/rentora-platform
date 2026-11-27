import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './overrides.css';

// Apply the persisted language before React's first render to avoid a flash
// of the wrong language or text direction on reload.
try {
  const savedLanguage = localStorage.getItem('motara.language') ?? localStorage.getItem('rentora.language');
  const language = savedLanguage ? JSON.parse(savedLanguage) : 'en';
  const activeLanguage = language === 'ar' ? 'ar' : 'en';
  document.documentElement.lang = activeLanguage;
  document.documentElement.dir = activeLanguage === 'ar' ? 'rtl' : 'ltr';
} catch {
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
}

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></React.StrictMode>,
);
