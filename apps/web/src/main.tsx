import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './mobile-layout.css';
import './prototype-layout.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing root');
createRoot(root).render(<App />);
