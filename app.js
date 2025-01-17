import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import sessions from 'express-session';
import WebAppAuthProvider from 'msal-node-wrapper';
import apiv1Router from './routes/v1/apiv1.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
dotenv.config();

const authConfig = {
    auth: {
        clientId: process.env.CLIENT_ID,
        authority: process.env.AUTHORITY,
        clientSecret: process.env.CLIENT_SECRET,
        redirectUri: "/redirect"
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: 3,
        }
    }
};

import models from './models.js'
import {setupGameSocket} from './routes/v1/websockets/gameSocket.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
var app = express();

app.enable('trust proxy')

app.use((req, res, next) => {
    req.models = models
    next()
})

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public/build')));

app.use(sessions({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: true,
    cookie: {maxAge: 1000 * 60 * 60 * 24},  // 1 day
    resave: false
}));

const authProvider = await WebAppAuthProvider.WebAppAuthProvider.initialize(authConfig);
app.use(authProvider.authenticate());

app.get('/signin', (req, res, next) => {
    return req.authContext.login({
        postLoginRedirectUri: "/",
    })(req, res, next);
});

app.get('/signout', (req, res, next) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error during session destroy:", err);
            return next(err);
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});

app.use('/api/v1', apiv1Router);

export { app, setupGameSocket};