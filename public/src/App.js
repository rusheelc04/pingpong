import React, { useState } from 'react' // Import React and the useState hook for managing state
import './App.css' // Import global styles
import { HashRouter, Route, Routes } from 'react-router-dom' // Import React Router for navigation
import Navbar from './components/Navbar' // Import Navbar component
import SignIn from './components/SignIn' // Import SignIn component
import PongGame from './components/PongGame' // Import PongGame component
import Profile from './components/Profile' // Import Profile component
import MainPage from './components/MainPage' // Import MainPage component

/**
 * App Component
 * - The root component that sets up routing and global state.
 * - Manages user authentication state.
 * - Handles sign-out functionality.
 * - Renders different pages based on the route.
 */
function App() {
  // State to store user authentication information
  const [identityInfo, setIdentityInfo] = useState(null)

  // State to store error messages (used for sign-in errors)
  const [error, setError] = useState(null)

  /**
   * handleSignOut - Handles user sign-out process.
   * - Sends a request to the backend to log out the user.
   * - Clears user authentication state.
   * - Redirects user to the home page after signing out.
   */
  const handleSignOut = async () => {
    try {
      await fetch('/signout') // Send signout request to backend
      setIdentityInfo(null) // Clear identity state
      window.location.href = '/' // Redirect to home page
    } catch (err) {
      setError("Error signing out. Please try again.") // Display error message if signout fails
    }
  }

  return (
    <div className="App">
      {/* HashRouter is used to manage routing in the app */}
      <HashRouter>
        {/* Navbar Component - Displays navigation links based on login status */}
        <Navbar onSignOut={handleSignOut} isLoggedIn={identityInfo !== null} />

        {/* Routes - Defines different pages and their components */}
        <Routes>
          {/* Sign-In Page - Default route (/) */}
          <Route path='/' 
            element={
              <SignIn 
                identityInfo={identityInfo} 
                setIdentityInfo={setIdentityInfo} 
                error={error} 
                setError={setError} 
              />
            } 
          />
          
          {/* Game Page - Displays the Pong game */}
          <Route path='/gamePage' 
            element={<PongGame identityInfo={identityInfo} />} 
          />

          {/* Profile Page - Displays user information */}
          <Route path='/profile' 
            element={<Profile />} 
          />

          {/* Home Page - Displays the leaderboard and matchmaking option */}
          <Route path='/home' 
            element={<MainPage identityInfo={identityInfo}/>} 
          />
        </Routes>
      </HashRouter>
    </div>
  )
}

export default App // Export App component as default
