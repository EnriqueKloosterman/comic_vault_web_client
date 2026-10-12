import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/Auth';
import { ThemeProvider } from './components/Theme';
import { ToastProvider } from './components/Toast';
import History from './pages/History';
import Library from './pages/Library';
import Reader from './pages/Reader';
import Series from './pages/Series';
import './theme.css';
import './styles.css';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/series/:s" element={<Series />} />
              <Route path="/read/:id" element={<Reader />} />
              <Route path="/history" element={<History />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
