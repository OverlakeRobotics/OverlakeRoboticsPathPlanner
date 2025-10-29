import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// global robot chassis overlays
import './styles/robot-chassis.css';

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
