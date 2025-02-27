import React from 'react' // Import React to use JSX and functional components
import { Link } from 'react-router-dom' // Import Link from React Router for navigation

/**
 * Navbar Component
 * - Displays navigation links and sign-in/sign-out options.
 * - Uses React Router for client-side navigation.
 * - Applies inline styles for styling.
 * 
 * Props:
 * @param {Function} onSignOut - Function that handles signing out.
 * @param {Boolean} isLoggedIn - Boolean indicating if the user is logged in.
 */
const Navbar = ({ onSignOut, isLoggedIn }) => {
  return (
    <nav style={styles.navbar}>
      {/* Logo or Title, links to Home Page */}
      <Link to="/home">
        <h1 style={styles.title}>Pong</h1>
      </Link>

      {/* Navigation Links */}
      <div style={styles.navLinks}>
        {isLoggedIn ? (
          <>
            {/* Profile Page Link */}
            <Link to="/profile" style={styles.link}>Profile</Link>

            {/* Play Game Link */}
            <Link to="/gamePage" style={styles.link}>Play</Link>

            {/* Sign Out Button */}
            <button onClick={onSignOut} style={styles.button}>Sign Out</button>
          </>
        ) : (
          // If user is not logged in, show Sign In link
          <Link to="/signin" style={styles.link}>Sign In</Link>
        )}
      </div>
    </nav>
  )
}

/**
 * Inline styles for the Navbar component.
 * - Defines styles for navigation bar, links, and buttons.
 * - Uses a JavaScript object for styling instead of external CSS.
 */
const styles = {
  navbar: {
    backgroundColor: '#333', // Dark background color for navbar
    padding: '10px 20px', // Padding inside navbar
    display: 'flex', // Uses flexbox for alignment
    justifyContent: 'center', // Center elements horizontally
    alignItems: 'center', // Align items in the middle vertically
    color: 'white', // White text color
  },
  title: {
    margin: 0, // Remove default margin from h1
    fontSize: '40px', // Set title font size
    fontFamily: "'Micro 5', sans-serif", // Custom font family
  },
  navLinks: {
    display: 'flex', // Use flexbox for navigation links
    alignItems: 'center', // Align links vertically
  },
  link: {
    color: 'white', // Set text color to white
    textDecoration: 'none', // Remove underline from links
    margin: '0 15px', // Add spacing between links
    fontSize: '18px', // Set font size for links
  },
  button: {
    backgroundColor: 'red', // Red background for sign-out button
    color: 'white', // White text color
    border: 'none', // Remove default border
    padding: '10px 20px', // Add padding for button size
    marginLeft: '20px', // Add spacing between links and button
    cursor: 'pointer', // Show pointer cursor on hover
  }
}

export default Navbar; // Export Navbar component for use in other parts of the app
