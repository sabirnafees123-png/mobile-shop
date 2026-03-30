import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';

// Import all your existing pages
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Sales from './pages/Sales';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Expenses from './pages/Expenses';
// Add any other pages you have

// ── Protected Route wrapper ──────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Role-based access control
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0f0f1a', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ fontSize: '48px' }}>🚫</div>
        <h2 style={{ color: '#ffffff', margin: 0 }}>Access Denied</h2>
        <p style={{ color: '#8888aa', margin: 0 }}>
          Your role (<strong style={{ color: '#4f8ef7' }}>{user.role}</strong>) 
          doesn't have permission to view this page.
        </p>
        <button
          onClick={() => window.history.back()}
          style={{
            background: '#4f8ef7', color: '#fff', border: 'none',
            borderRadius: '8px', padding: '10px 24px', cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return children;
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On app load, check if user is already logged in
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#0f0f1a'
      }}>
        <div style={{ color: '#4f8ef7', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1a1a2e', color: '#fff', border: '1px solid #2a2a4a' },
          success: { iconTheme: { primary: '#4f8ef7', secondary: '#fff' } },
        }}
      />
      <Routes>
        {/* Login page — redirect to dashboard if already logged in */}
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <Login onLogin={handleLogin} />}
        />

        {/* All protected routes wrapped in Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/products" element={<Products />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/purchases" element={<Purchases />} />
                  <Route path="/sales" element={<Sales />} />
                  <Route path="/suppliers" element={<Suppliers />} />
                  <Route path="/customers" element={<Customers />} />

                  {/* Expenses: admin and accountant only */}
                  <Route
                    path="/expenses"
                    element={
                      <ProtectedRoute allowedRoles={['admin', 'accountant']}>
                        <Expenses />
                      </ProtectedRoute>
                    }
                  />

                  {/* 404 within app */}
                  <Route
                    path="*"
                    element={
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '60vh', flexDirection: 'column', gap: '12px'
                      }}>
                        <div style={{ fontSize: '48px' }}>🔍</div>
                        <h2 style={{ color: '#ffffff' }}>Page Not Found</h2>
                        <a href="/" style={{ color: '#4f8ef7' }}>Go to Dashboard</a>
                      </div>
                    }
                  />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}