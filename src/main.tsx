// index.css first: its @layer line must be the first stylesheet the page loads (Astryx layer order)
import './index.css';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <Theme theme={neutralTheme} mode="dark">
    <App />
  </Theme>,
);
