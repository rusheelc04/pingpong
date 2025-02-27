import React from 'react'; // Import React library
import ReactDOM from 'react-dom/client'; // Import ReactDOM for rendering
import 'bootstrap/dist/css/bootstrap.css'; // Import Bootstrap CSS for styling
import './index.css'; // Import global styles
import App from './App'; // Import root App component

/**
 * Creates a root React element and renders the application.
 * - Uses `React.StrictMode` for better debugging and performance warnings.
 */
const root = ReactDOM.createRoot(document.getElementById('root')); // Find the root element in index.html
root.render(
  <React.StrictMode>
    <App /> {/* Render the App component inside StrictMode */}
  </React.StrictMode>
);
