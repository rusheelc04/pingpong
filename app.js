import express from 'express'; // Import Express framework
import path from 'path'; // Import Path module for file system operations
import cookieParser from 'cookie-parser'; // Import Cookie Parser for handling cookies
import logger from 'morgan'; // Import Morgan for request logging
import sessions from 'express-session'; // Import Express Session for user session handling
import WebAppAuthProvider from 'msal-node-wrapper'; // Import Microsoft Authentication Library (MSAL)
import apiv1Router from './routes/v1/apiv1.js'; // Import API routes
import { fileURLToPath } from 'url'; // Import URL utilities for file system paths
import { dirname } from 'path'; // Import dirname for directory resolution
import dotenv from 'dotenv'; // Import dotenv to manage environment variables

dotenv.config(); // Load environment variables from .env file

// Microsoft Authentication Configuration
const authConfig = {
    auth: {
        clientId: process.env.CLIENT_ID, // Client ID for Azure authentication
        authority: process.env.AUTHORITY, // Authority URL for Azure authentication
        clientSecret: process.env.CLIENT_SECRET, // Secret key for client authentication
        redirectUri: "/redirect" // Redirect URI after login
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false, // Disable Personally Identifiable Information logging
            logLevel: 3, // Set log level to verbose
        }
    }
};

import models from './models.js' // Import MongoDB models
import { setupGameSocket } from './routes/v1/websockets/gameSocket.js' // Import WebSocket game handler

// Resolve current file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

var app = express(); // Create an Express application instance

app.enable('trust proxy'); // Trust reverse proxy for deployment (e.g., Heroku, Render)

/**
 * Middleware to attach database models to each request
 * - Ensures `req.models` is available in all routes.
 */
app.use((req, res, next) => {
    req.models = models;
    next();
});

// Middleware Setup
app.use(logger('dev')); // Log HTTP requests
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded request bodies
app.use(cookieParser()); // Parse cookies
app.use(express.static(path.join(__dirname, 'public/build'))); // Serve React frontend

// Configure Express Session
app.use(sessions({
    secret: process.env.SESSION_SECRET, // Secret for session encryption
    saveUninitialized: true, // Save empty sessions
    cookie: { maxAge: 1000 * 60 * 60 * 24 }, // Session expiration: 1 day
    resave: false // Do not resave session data if not modified
}));

// Initialize Microsoft Authentication Provider
const authProvider = await WebAppAuthProvider.WebAppAuthProvider.initialize(authConfig);

// Apply authentication middleware
app.use(authProvider.authenticate());

/**
 * GET /signin
 * - Redirects user to Azure AD login.
 */
app.get('/signin', (req, res, next) => {
    return req.authContext.login({
        postLoginRedirectUri: "/",
    })(req, res, next);
});

/**
 * GET /signout
 * - Destroys user session and logs out the user.
 */
app.get('/signout', (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error during session destroy:", err);
            return next(err);
        }
        res.clearCookie('connect.sid'); // Remove session cookie
        res.redirect('/'); // Redirect to home page
    });
});

// Mount API Routes
app.use('/api/v1', apiv1Router);

export { app, setupGameSocket }; // Export app and WebSocket setup function
