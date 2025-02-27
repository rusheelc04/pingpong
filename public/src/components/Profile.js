import React, { useEffect, useState } from 'react' // Import React and hooks for state management
import { fetchJSON } from '../javascripts/utils' // Import utility function for API requests

/**
 * Profile Component
 * - Displays user profile information (username, ELO rating).
 * - Fetches and displays recent game history.
 * - Uses styled components for layout and design.
 */
function Profile() {
    // State to store user data (username & ELO)
    const [userData, setUserData] = useState(null);
    
    // State to store the list of recent games played
    const [games, setGames] = useState([]);

    /**
     * useEffect Hook - Fetches user profile and game history when the component mounts.
     */
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch the current user's identity from the backend API
                const userIdentity = await fetchJSON("/api/v1/users/myIdentity");

                // Fetch the user's recent games from the backend API
                const gamesList = await fetchJSON("/api/v1/games/list");

                // Update userData state with username and ELO
                setUserData({
                    username: userIdentity.userInfo.username,
                    elo: userIdentity.userInfo.elo
                });

                // Ensure gamesList is an array before setting state
                setGames(Array.isArray(gamesList) ? gamesList : []);
            } catch (err) {
                console.error(err); // Log any errors that occur during data fetching
            }
        };

        fetchData(); // Call the fetch function

    }, []); // Empty dependency array ensures this effect runs only once on mount

    return (
        <div style={styles.container}>
            {/* Left Panel: User Info */}
            <div style={styles.leftPanel}>
                {userData ? (
                    <div style={styles.userInfo}>
                        <h2 style={styles.title}>{userData.username}</h2> {/* Display username */}
                        <p style={styles.elo}>ELO: {userData.elo}</p> {/* Display ELO rating */}
                    </div>
                ) : (
                    <p>Loading...</p> // Show loading text if userData has not loaded yet
                )}
            </div>

            {/* Right Panel: Game History */}
            <div className="right-panel" style={styles.rightPanel}>
                <h3 style={styles.historyTitle}>Recent Games</h3>
                {games.length === 0 ? (
                    <p style={styles.noGames}>No games found.</p> // Display message if no games are available
                ) : (
                    <div style={styles.gameTable}>
                        {/* Table Header */}
                        <div style={styles.tableRow}>
                            <div style={styles.tableHeader}>Opponent</div>
                            <div style={styles.tableHeader}>Score</div>
                            <div style={styles.tableHeader}>Result</div>
                            <div style={styles.tableHeader}>Date</div>
                        </div>
                        
                        {/* Table Rows - Iterating over games list */}
                        {games.map((game, index) => (
                            <div key={index} style={styles.tableRow}>
                                <div style={styles.tableCell}>{game.opponent}</div>
                                <div style={styles.tableCell}>{game.score}</div>
                                <div style={styles.tableCell}>{game.result}</div>
                                <div style={styles.tableCell}>{game.date}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Inline Styles for the Profile Component
 * - Defines layout and appearance for user info and game history.
 */
const styles = {
    container: {
        display: 'flex', // Flexbox for side-by-side layout
        justifyContent: 'center', // Center elements horizontally
        alignItems: 'flex-start', // Align items at the top
        padding: '20px', // Padding for spacing
        backgroundColor: '#333', // Dark background color
        color: 'white', // White text color
        fontFamily: "'Micro 5', sans-serif", // Custom font
        minHeight: '100vh', // Ensure full-page height
        boxSizing: 'border-box', // Include padding in width/height calculations
    },
    leftPanel: {
        width: '30%', // Left panel takes 30% width
        padding: '20px', // Add padding
        marginRight: '20px', // Space between left and right panels
        backgroundColor: '#444', // Darker background for user panel
        borderRadius: '8px', // Rounded corners
        textAlign: 'center', // Center align text
    },
    userInfo: {
        display: 'flex', // Flexbox for layout
        flexDirection: 'column', // Arrange elements in a column
        alignItems: 'center', // Center content
    },
    title: {
        fontSize: '24px', // Set font size for username
        margin: '0 0 10px 0', // Remove default margin
    },
    elo: {
        fontSize: '20px', // Set font size for ELO rating
        margin: '0', // Remove default margin
    },
    rightPanel: {
        width: '65%', // Right panel takes 65% width
        padding: '20px', // Add padding
        backgroundColor: '#444', // Darker background for game history panel
        borderRadius: '8px', // Rounded corners
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)', // Add subtle shadow
        maxHeight: '500px', // Limit height to prevent excessive scrolling
        overflowY: 'auto', // Enable vertical scrolling if needed
    },
    historyTitle: {
        fontSize: '28px', // Set font size for history title
        marginBottom: '15px', // Add spacing below title
    },
    noGames: {
        fontSize: '18px', // Set font size for "No games found" text
        color: '#ccc', // Light gray color for better visibility
    },
    gameTable: {
        display: 'grid', // Use CSS Grid for layout
        gridTemplateColumns: '1fr 1fr 1fr 1fr', // Four equal columns
        gap: '10px', // Space between grid items
        marginTop: '20px', // Add spacing above table
    },
    tableRow: {
        display: 'contents', // Ensure grid elements appear inline
    },
    tableHeader: {
        fontWeight: 'bold', // Bold font for headers
        backgroundColor: '#555', // Dark background for headers
        padding: '10px', // Add padding for readability
        textAlign: 'center', // Center align text
        borderRadius: '5px', // Rounded corners
    },
    tableCell: {
        backgroundColor: '#555', // Dark background for table cells
        padding: '10px', // Add padding
        textAlign: 'center', // Center align text
        borderRadius: '5px', // Rounded corners
        border: '1px solid #666', // Light border for separation
    },
}

export default Profile; // Export Profile component for use in the app
