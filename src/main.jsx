import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // Asegúrate de que esto apunta a App.jsx
import './index.css'; // Asegúrate de que esto importa tu CSS principal

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);