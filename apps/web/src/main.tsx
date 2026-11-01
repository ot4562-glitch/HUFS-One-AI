import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// Placeholder entry so `npm run build:web` is verifiable; the UI shell replaces this (#9).
const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><main><h1>HUFS One AI</h1></main></StrictMode>);
