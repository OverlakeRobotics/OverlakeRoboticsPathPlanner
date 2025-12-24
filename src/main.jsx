import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { loadRuntimeConfig } from './constants/config';

const root = createRoot(document.getElementById('root'));

const renderApp = () => {
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
};

loadRuntimeConfig().finally(renderApp);
