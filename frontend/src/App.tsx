import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { checkAuth } from './api';
import Login from './components/Login';
import MainLayout from './components/MainLayout';
import Dashboard from './components/Dashboard';
import CharacterManagement from './components/CharacterManagement';
import PositionsManagement from './components/PositionsManagement';
import GeographyManagement from './components/GeographyManagement';
import DbAdmin from './components/DbAdmin';
import './App.css';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    checkAuth()
      .then((data) => {
        setIsAuthenticated(data.authenticated);
        if (data.username) setUsername(data.username);
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    checkAuth().then((data) => {
      if (data.username) setUsername(data.username);
    });
  };

  if (isAuthenticated === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ConfigProvider locale={zhCN}>
        <Login onLoginSuccess={handleLoginSuccess} />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1e3a5f',
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout username={username} />}>
            <Route index element={<Dashboard />} />
            <Route path="characters/*" element={<CharacterManagement />} />
            <Route path="positions" element={<PositionsManagement />} />
            <Route path="geography" element={<GeographyManagement />} />
            <Route path="dba" element={<DbAdmin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
