import React, { useEffect, useState } from 'react'
import { fetchJSON } from '../javascripts/utils'

function Profile() {
    const [userData, setUserData] = useState(null)
    const [games, setGames] = useState([])

    useEffect(() => {
        const fetchData = async () => {
            try {
                const userIdentity = await fetchJSON("/api/v1/users/myIdentity")
                const gamesList = await fetchJSON("/api/v1/games/list")
                setUserData({
                    username: userIdentity.userInfo.username,
                    elo: userIdentity.userInfo.elo
                })
                setGames(Array.isArray(gamesList) ? gamesList : [])
            } catch (err) {
                console.error(err)
            }
        }
        fetchData()
    }, [])

    return (
        <div style={styles.container}>
            {/* Left Panel: User Info */}
            <div style={styles.leftPanel}>
                {userData ? (
                    <div style={styles.userInfo}>
                        <h2 style={styles.title}>{userData.username}</h2>
                        <p style={styles.elo}>ELO: {userData.elo}</p>
                    </div>
                ) : (
                    <p>Loading...</p>
                )}
            </div>

            {/* Right Panel: Game History */}
            <div className="right-panel" style={styles.rightPanel}>
                <h3 style={styles.historyTitle}>Recent Games</h3>
                {games.length === 0 ? (
                    <p style={styles.noGames}>No games found.</p>
                ) : (
                    <div style={styles.gameTable}>
                        {/* Table Header */}
                        <div style={styles.tableRow}>
                            <div style={styles.tableHeader}>Opponent</div>
                            <div style={styles.tableHeader}>Score</div>
                            <div style={styles.tableHeader}>Result</div>
                            <div style={styles.tableHeader}>Date</div>
                        </div>
                        {/* Table Rows */}
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
    )
}

const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px',
        backgroundColor: '#333',
        color: 'white',
        fontFamily: "'Micro 5', sans-serif",
        minHeight: '100vh',
        boxSizing: 'border-box',
    },
    leftPanel: {
        width: '30%',
        padding: '20px',
        marginRight: '20px',
        backgroundColor: '#444',
        borderRadius: '8px',
        textAlign: 'center',
    },
    userInfo: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    title: {
        fontSize: '24px',
        margin: '0 0 10px 0',
    },
    elo: {
        fontSize: '20px',
        margin: '0',
    },
    rightPanel: {
        width: '65%',
        padding: '20px',
        backgroundColor: '#444',
        borderRadius: '8px',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)',
        maxHeight: '500px',
        overflowY: 'auto',
    },
    historyTitle: {
        fontSize: '28px',
        marginBottom: '15px',
    },
    noGames: {
        fontSize: '18px',
        color: '#ccc',
    },
    gameTable: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '10px',
        marginTop: '20px',
    },
    tableRow: {
        display: 'contents',
    },
    tableHeader: {
        fontWeight: 'bold',
        backgroundColor: '#555',
        padding: '10px',
        textAlign: 'center',
        borderRadius: '5px',
    },
    tableCell: {
        backgroundColor: '#555',
        padding: '10px',
        textAlign: 'center',
        borderRadius: '5px',
        border: '1px solid #666',
    },
}

export default Profile;
