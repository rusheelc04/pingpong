import React from 'react'
import { Link } from 'react-router-dom'

const Navbar = ({ onSignOut, isLoggedIn }) => {
  return (
    <nav style={styles.navbar}>
      <Link to="/home"><h1 style={styles.title}>Pong</h1></Link>
      <div style={styles.navLinks}>
        {isLoggedIn ? (
          <>
            <Link to="/profile" style={styles.link}>Profile</Link>
            <Link to="/gamePage" style={styles.link}>Play</Link>
            <button onClick={onSignOut} style={styles.button}>Sign Out</button>
          </>
        ) : (
          <Link to="/signin" style={styles.link}>Sign In</Link>
        )}
      </div>
    </nav>
  )
}

const styles = {
  navbar: {
    backgroundColor: '#333',
    padding: '10px 20px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
  },
  title: {
    margin: 0,
    fontSize: '40px',
    fontFamily: "'Micro 5', sans-serif",
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
  },
  link: {
    color: 'white',
    textDecoration: 'none',
    margin: '0 15px',
    fontSize: '18px',
  },
  button: {
    backgroundColor: 'red',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    marginLeft: '20px',
    cursor: 'pointer',
  }
}

export default Navbar;