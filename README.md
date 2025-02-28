# Multiplayer Pong Web Application

**Group Members:** Munir Emam, Rusheel Chande, Dhruv Ashok, Alex Han  
**Web App URL:** [https://pong441.onrender.com/](https://pong441.onrender.com/)  
**Class Project:** INFO 441 - Server-Side Development, Fall Quarter 2024  

## Project Overview

This is a **full-stack web application** designed to allow users to play **real-time multiplayer Pong** against each other over the internet, utilizing **WebSockets for real-time game state synchronization**. The application includes **competitive matchmaking with an ELO-based ranking system**, a **global leaderboard**, and **real-time in-game chat**.

The application is built with a **React.js frontend, a Node.js/Express backend, and a MongoDB database**. It uses **Microsoft Azure Active Directory (Azure AD)** for authentication, ensuring that only **University of Washington (UW) students** can log in and play. The **game physics and real-time updates** are handled using **WebSockets**, allowing smooth gameplay with synchronized paddle and ball movement.

## **Architecture**

![architectural diagram](diagrams/architectural.png)

## **Data Flow**

![data flow diagram](diagrams/data_flow.png)

---

## **Technology Stack**
### **Frontend**
- **React.js** - Component-based UI rendering
- **React Router** - Client-side navigation
- **WebSockets (`ws`)** - Real-time communication
- **Bootstrap** - UI styling

### **Backend**
- **Node.js with Express.js** - REST API and WebSocket server
- **MongoDB with Mongoose** - Database for storing users, games, and chat messages
- **Express WebSockets (`express-ws`)** - WebSocket handling for game state synchronization
- **MSAL Node.js (`msal-node-wrapper`)** - Microsoft Azure AD authentication

### **Infrastructure**
- **Render.com** - Hosting for both frontend and backend
- **MongoDB Atlas** - Cloud-hosted database
- **Dotenv** - Environment variable management

---

## **Endpoints and API Reference**

### **User Authentication (`/user`)**
| Method | Endpoint          | Description |
|--------|------------------|-------------|
| **GET** | `/user/login` | Authenticates a user via Azure AD |
| **GET** | `/user/profile` | Retrieves user profile information (username, ELO, match history) |
| **POST** | `/user/updateElo` | Updates the ELO ranking for a user after a match |

### **Game Management (`/games`)**
| Method | Endpoint          | Description |
|--------|------------------|-------------|
| **GET** | `/games/list` | Retrieves a list of all games played by the logged-in user |
| **POST** | `/games` | Creates a new game entry after a match ends |

### **Real-Time Chat (`/messages`)**
| Method | Endpoint          | Description |
|--------|------------------|-------------|
| **GET** | `/messages` | Retrieves chat messages for a specific game |
| **POST** | `/messages` | Sends a new message in an active game chat room |

### **Leaderboard (`/leaderboard`)**
| Method | Endpoint          | Description |
|--------|------------------|-------------|
| **GET** | `/leaderboard` | Fetches the list of users ranked by their ELO score |

### **Matchmaking (`/matchmaking`)**
| Method | Endpoint          | Description |
|--------|------------------|-------------|
| **POST** | `/matchmaking/find` | Finds an opponent with similar ELO using a priority queue |

---

## **Database Schemas**
### **User Schema (`users` Collection)**
```json
{
    "user_id": ObjectId,
    "username": "String (Unique)",
    "elo": Number,
    "createdAt": "Date",
    "updatedAt": "Date"
}
