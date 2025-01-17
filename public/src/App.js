import React, { useState } from 'react'
import './App.css'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import SignIn from './components/SignIn'
import PongGame from './components/PongGame'
import Profile from './components/Profile'
import MainPage from './components/MainPage';

function App() {
  const [identityInfo, setIdentityInfo] = useState(null)
  const [error, setError] = useState(null)

  const handleSignOut = async () => {
    try {
      await fetch('/signout')
      setIdentityInfo(null)
      window.location.href = '/'
    } catch (err) {
      setError("Error signing out. Please try again.")
    }
  }

  return (
    <div className="App">
      <HashRouter>
        <Navbar onSignOut={handleSignOut} isLoggedIn={identityInfo !== null} />
        <Routes>
          <Route path='/' element={<SignIn identityInfo={identityInfo} setIdentityInfo={setIdentityInfo} error={error} setError={setError} />} />
          <Route path='/gamePage' element={<PongGame identityInfo={identityInfo} />} />
          <Route path='/profile' element={<Profile />} />
          <Route path='/home' element={<MainPage identityInfo={identityInfo}/>}/>
        </Routes>
      </HashRouter>
    </div>
  )
}

export default App