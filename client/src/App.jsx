import React from 'react';
import { AppProvider } from './contexts/AppContext';
import { App as AppComponent } from './components/App';
import './styles.css';

function App() {
  return (
    <AppProvider>
      <AppComponent />
    </AppProvider>
  );
}

export default App;